import {
  elizaLogger,
  composeContext,
  type IAgentRuntime,
  ModelProviderName,
  generateImage,
} from "@elizaos/core";
import { type ImageMetadata, MediaImageMimeType, type URI } from "@lens-protocol/metadata";
import type { Post, TextOnlyMetadata } from "@lens-protocol/client";
import { chains } from "@lens-network/sdk/viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import pkg from "lodash";
const { orderBy } = pkg;
import {
  LaunchpadChain,
  TemplateName,
  type SmartMedia,
  type Template,
  type TemplateHandlerResponse,
} from "../utils/types";
import { formatMetadata } from "../services/lens/createPost";
import { isMediaStale, getLatestComments, getVoteWeightFromBalance } from "../utils/utils";
import { parseAndUploadBase64Image, parseBase64Image, uploadJson } from "../utils/ipfs";
import { fetchAllCollectorsFor, fetchAllCommentsFor, fetchAllUpvotersFor } from "../services/lens/posts";
import { balanceOfBatched } from "../utils/viem";
import { storageClient } from "../services/lens/client";

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

const DEFAULT_IMAGE_MODEL_ID = "stable-diffusion-3.5"; // most creative
const DEFAULT_IMAGE_STYLE_PRESET = "Neon Punk";
const DEFAULT_MIN_ENGAGEMENT_UPDATE_THREHOLD = 3; // at least 3 upvotes/comments before updating

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
const artistPresent = {
  name: TemplateName.ARTIST_PRESENT,
  description: "The artist is present in the evolving art. Creator sets the original image and style. The comment with the most votes dictates how the image evolves.",
  handler: async (
    runtime: IAgentRuntime,
    media?: SmartMedia,
    _templateData?: TemplateData,
  ): Promise<TemplateHandlerResponse | undefined> => {
    elizaLogger.log("Running template:", TemplateName.ARTIST_PRESENT);

    if (!media?.templateData) {
      elizaLogger.error("Missing template data");
      return;
    }

    const templateData = media.templateData as TemplateData;

    try {
      let comments: Post[]; // latest comments to evaluate for the next decision

      // if the post not stale, check if we've passed the min comment threshold
      if (isMediaStale(media as SmartMedia)) {
        elizaLogger.info("is stale");
        const allComments = await fetchAllCommentsFor(media?.postId as string);
        comments = getLatestComments(media as SmartMedia, allComments);
        const threshold = (media?.templateData as TemplateData).minCommentUpdateThreshold ||
          DEFAULT_MIN_ENGAGEMENT_UPDATE_THREHOLD;
        if (comments.length < threshold) {
          elizaLogger.info(`adventureTime:: media ${media?.agentId} is not stale and has not met comment threshold; skipping`);
          return;
        }
      } else {
        elizaLogger.info("not stale");
        // do not update if the media isn't stale; we're paying for generations
        return;
      }

      // fetch the token balances for each comment / upvote to use weighted votes
      const allCollectors = await fetchAllCollectorsFor(media?.postId as string);
      const commentsWeighted = await Promise.all(comments.map(async (comment) => {
        const voters = await fetchAllUpvotersFor(comment.id);
        const balances = await balanceOfBatched(
          media.token.chain === LaunchpadChain.BASE ? base : chains.testnet,
          [
            comment.author.address,
            ...voters.filter((account) => allCollectors.includes(account))
          ],
          media?.token.address as `0x${string}`
        );
        return {
          content: (comment.metadata as TextOnlyMetadata).content,
          votes: balances.reduce((acc, b) => acc + getVoteWeightFromBalance(b), 0),
        };
      }));

      // choose the most upvoted one as the prompt to update the art
      const prompt = orderBy(commentsWeighted, 'votes', 'desc')[0].content;

      const context = composeContext({
        // @ts-expect-error we don't need the full State object here to produce the context
        state: {
          style: templateData.style,
          prompt
        },
        template: nextImageTemplate,
      });

      const url = await storageClient.resolve(media?.uri as URI);
      const json: ImageMetadata = await fetch(url).then(res => res.json());
      const imageUri = json.lens.image.item;

      elizaLogger.info("generating image");
      const imageResponse = await generateImage(
        {
          prompt: context,
          width: 1024,
          height: 1024,
          imageModelProvider: ModelProviderName.VENICE,
          modelId: templateData.modelId || DEFAULT_IMAGE_MODEL_ID,
          stylePreset: templateData.stylePreset || DEFAULT_IMAGE_STYLE_PRESET,
          inpaint: {
            strength: 50,
            source_image_base64: await fetch(imageUri)
              .then(res => res.arrayBuffer())
              .then(buffer => Buffer.from(buffer).toString('base64'))
          }
        },
        runtime
      );

      // edit the image and format the metadata to be used to update
      await storageClient.editFile(
        imageUri,
        parseBase64Image(imageResponse) as File,
        privateKeyToAccount(process.env.LENS_STORAGE_NODE_PRIVATE_KEY as `0x${string}`)
      );
      const metadata = formatMetadata({
        text: prompt,
        image: {
          url: imageUri,
          type: MediaImageMimeType.PNG // see generation.ts the provider
        }
      }) as ImageMetadata;

      // upload version to storj for versioning
      const updatedUri = await uploadJson(formatMetadata({
        text: prompt,
        image: {
          url: await parseAndUploadBase64Image(imageResponse) as string,
          type: MediaImageMimeType.PNG // see generation.ts the provider
        }
      }));

      return {
        metadata,
        updatedUri,
      }
    } catch (error) {
      elizaLogger.error("handler failed", error);
    }
  }
} as Template;

export default artistPresent;
