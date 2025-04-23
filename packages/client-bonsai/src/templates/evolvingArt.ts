import {
  elizaLogger,
  composeContext,
  type IAgentRuntime,
  ModelProviderName,
  generateImage,
  generateText,
  ModelClass,
} from "@elizaos/core";
import { type ImageMetadata, MediaImageMimeType, type URI } from "@lens-protocol/metadata";
import type { Post, TextOnlyMetadata } from "@lens-protocol/client";
import { chains } from "@lens-chain/sdk/viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { walletOnly } from "@lens-chain/storage-client";
import type { Account } from "viem";
import z from "zod";
import pkg from "lodash";
const { orderBy, uniq, uniqBy } = pkg;
import {
  ImageRequirement,
  LaunchpadChain,
  TemplateCategory,
  TemplateName,
  type SmartMedia,
  type Template,
  type TemplateHandlerResponse,
  type TemplateUsage,
} from "../utils/types";
import { formatMetadata } from "../services/lens/createPost";
import { isMediaStale, getLatestComments, getVoteWeightFromBalance } from "../utils/utils";
import { parseAndUploadBase64Image, parseBase64Image, pinFile, storjGatewayURL, uploadJson } from "../utils/ipfs";
import { fetchAllCollectorsFor, fetchAllCommentsFor, fetchAllUpvotersFor } from "../services/lens/posts";
import { balanceOfBatched } from "../utils/viem";
import { LENS_CHAIN, LENS_CHAIN_ID, storageClient } from "../services/lens/client";
import { BONSAI_PROTOCOL_FEE_RECIPIENT } from "../utils/constants";
import { refresh } from "@lens-protocol/client/actions";

export const nextImageTemplate = `
# Instructions
Begin with the given current image and evolve it. Use the Style and Prompt to generate the evolution.
# Style
{{style}}
# Prompt
{{prompt}}
`;

type TemplateData = {
  style: string;
  modelId?: string;
  stylePreset?: string;
  minCommentUpdateThreshold?: number;
}

const DEFAULT_IMAGE_MODEL_ID = "venice-sd35"; // most creative
const DEFAULT_IMAGE_STYLE_PRESET = "Neon Punk";
const DEFAULT_MIN_ENGAGEMENT_UPDATE_THREHOLD = 1; // at least 3 upvotes/comments before updating

/**
 * Handles the generation and updating of a "Evolving Art" type post.
 * This function refreshes an existing post by evaluating new comments and votes to decide the evolution of the image.
 *
 * @param {IAgentRuntime} runtime - The eliza runtime environment providing utilities for generating content and images.
 * @param {boolean} refresh - Flag indicating whether to generate a new page or update an existing one.
 * @param {SmartMedia} [media] - The current, persisted media object associated with the adventure, used for updates.
 * @param {TemplateData} [_templateData] - Initial data for generating a new adventure preview, used when not refreshing.
 * @returns {Promise<TemplateHandlerResponse | null>} A promise that resolves to the response object containing the new image preview, uri (optional), and updated template data, or null if the operation cannot be completed.
 */
const evolvingArt = {
  handler: async (
    runtime: IAgentRuntime,
    media?: SmartMedia,
    _templateData?: TemplateData,
    options?: { forceUpdate: boolean },
  ): Promise<TemplateHandlerResponse | undefined> => {
    const refresh = !!media?.templateData;
    elizaLogger.info(`Running template (refresh: ${refresh}):`, TemplateName.EVOLVING_ART);

    if (!media?.templateData) {
      elizaLogger.error("Missing template data");
      return;
    }

    const templateData = media.templateData as TemplateData;

    const totalUsage: TemplateUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      imagesCreated: 0,
    };

    try {
      let comments: Post[]; // latest comments to evaluate for the next decision

      // if the post not stale, check if we've passed the min comment threshold
      if (isMediaStale(media as SmartMedia) || options?.forceUpdate) {
        elizaLogger.info(`evolvingArt:: post ${media?.postId} is stale`);
        const allComments = await fetchAllCommentsFor(media?.postId as string);
        comments = getLatestComments(media as SmartMedia, allComments);
        comments = uniqBy(comments, 'comment.author.address');
        const threshold = (media?.templateData as TemplateData).minCommentUpdateThreshold ||
          DEFAULT_MIN_ENGAGEMENT_UPDATE_THREHOLD;
        if (comments.length < threshold) {
          elizaLogger.info(`evolvingArt:: post ${media?.postId} is stale but has not met comment threshold; skipping`);
          return { metadata: undefined, totalUsage };
        }
      } else {
        // do not update if the media was recently updated
        elizaLogger.info(`evolvingArt:: post ${media?.postId} is not stale; skipping`);
        return { metadata: undefined, totalUsage };
      }

      // fetch the token balances for each comment / upvote to use weighted votes
      const allCollectors = await fetchAllCollectorsFor(media?.postId as string);
      const commentsWeighted = await Promise.all(comments.map(async (comment) => {
        let voters = await fetchAllUpvotersFor(comment.id);
        voters.push(comment.author.address);
        voters = uniq(voters); // discard upvotes from the same user
        voters = voters.filter((account) => allCollectors.includes(account)); // only collectors

        // If no token is present, each collector gets 1 vote
        if (!media?.token?.address) {
          return {
            content: (comment.metadata as TextOnlyMetadata).content,
            votes: voters.length, // simple 1 vote per voter
          };
        }

        // Token-weighted voting
        const balances = await balanceOfBatched(
          media.token.chain === LaunchpadChain.BASE ? base : LENS_CHAIN,
          voters,
          media.token.address as `0x${string}`
        );
        return {
          content: (comment.metadata as TextOnlyMetadata).content,
          votes: balances.reduce((acc, b) => acc + getVoteWeightFromBalance(b), 0),
        };
      }));

      const url = await storageClient.resolve(media?.uri as URI);
      const json: ImageMetadata = await fetch(url).then(res => res.json());
      const imageUri = json.lens.image.item;
      const imageUrl = await storageClient.resolve(imageUri as URI);

      const prompt = orderBy(commentsWeighted, 'votes', 'desc')[0].content;

      let imageResponse;
      let attempts = 0;
      const MAX_ATTEMPTS = 2;
      while (attempts < MAX_ATTEMPTS) {
        // const firstAttempt = attempts === 0;
        const firstAttempt = false;

        let imagePrompt: string;
        if (firstAttempt) {
          imagePrompt = composeContext({
            // @ts-expect-error we don't need the full State object here to produce the context
            state: {
              style: templateData.style,
              // choose the most upvoted one as the prompt to update the art
              prompt
            },
            template: nextImageTemplate,
          });
        } else {
          const { response, usage } = await generateText({
            runtime,
            modelClass: ModelClass.MEDIUM,
            modelProvider: ModelProviderName.VENICE,
            returnUsage: true,
            messages: [{
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Produce a prompt for an image that evolves the current one, using the user input as direction for the evolution: ${prompt}. Only reply with the new image prompt, and be concise so to successfully prompt a new image.`
                },
                {
                  type: "image",
                  image: imageUrl
                }
              ]
            }]
          }) as { response: string, usage: TemplateUsage };

          totalUsage.promptTokens += usage.promptTokens;
          totalUsage.completionTokens += usage.completionTokens;
          totalUsage.totalTokens += usage.totalTokens;
          imagePrompt = response;
        }

        if (firstAttempt) elizaLogger.info("generating image with inpaint, context: ", imageUrl, imagePrompt);
        else elizaLogger.info("generating new image using text: ", imagePrompt);
        imageResponse = await generateImage(
          {
            prompt: imagePrompt,
            width: 1024,
            height: 1024,
            imageModelProvider: ModelProviderName.VENICE,
            modelId: templateData.modelId || DEFAULT_IMAGE_MODEL_ID,
            stylePreset: templateData.stylePreset || DEFAULT_IMAGE_STYLE_PRESET,
            inpaint: firstAttempt ? {
              strength: 50,
              source_image_base64: await fetch(imageUrl)
                .then(res => res.arrayBuffer())
                .then(buffer => Buffer.from(buffer).toString('base64'))
            } : undefined
          },
          runtime
        );

        totalUsage.imagesCreated += 1;

        if (imageResponse.success) break;
        attempts++;
      }

      if (!imageResponse.success) {
        throw new Error("Failed to generate image after multiple attempts");
      }

      let signer: Account;
      let acl;
      let file;
      try {
        signer = privateKeyToAccount(process.env.LENS_STORAGE_NODE_PRIVATE_KEY as `0x${string}`);
        acl = walletOnly(signer.address, LENS_CHAIN_ID);
        file = parseBase64Image(imageResponse);

        if (!file) throw new Error("Failed to parse base64 image");

        await storageClient.editFile(imageUri, file, signer, { acl });
      } catch (error) {
        console.log(error);
        throw new Error("failed");
      }
      const metadata = formatMetadata({
        text: prompt,
        image: {
          url: storjGatewayURL(await pinFile(file)),
          type: MediaImageMimeType.PNG // see generation.ts the provider
        },
        attributes: json.lens.attributes,
        media: {
          category: TemplateCategory.EVOLVING_POST,
          name: TemplateName.ADVENTURE_TIME,
        },
      }) as ImageMetadata;

      // upload version to storj for versioning
      const persistVersionUri = await uploadJson(metadata);

      return { persistVersionUri, totalUsage, refreshMetadata: refresh }
    } catch (error) {
      console.log(error);
      elizaLogger.error("handler failed", error);
    }
  },
  clientMetadata: {
    protocolFeeRecipient: BONSAI_PROTOCOL_FEE_RECIPIENT,
    category: TemplateCategory.EVOLVING_ART,
    name: TemplateName.EVOLVING_ART,
    displayName: "Evolving Art",
    description: "Collect the post, buy tokens, and interact with the post (replies, upvotes) to evolve the image.",
    image: "https://link.storjshare.io/raw/jwq56rwpuhhle4k7tjbxyfd4l37q/bonsai/artistPresent.png",
    options: {
      allowPreview: false,
      allowPreviousToken: true,
      imageRequirement: ImageRequirement.REQUIRED,
      requireContent: true,
    },
    templateData: {
      form: z.object({
        style: z.string().describe("Define the style to maintain for all image generations - e.g. bright, neon green."),
        modelId: z.string().nullish().describe("Optional: Specify an AI model to use for image generation"),
        stylePreset: z.string().nullish().describe("Optional: Choose a style preset to use for image generation"),
      })
    }
  }
} as Template;

export default evolvingArt;
