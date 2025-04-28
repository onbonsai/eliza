import {
  elizaLogger,
  ModelClass,
  composeContext,
  generateObjectDeprecated,
  type IAgentRuntime,
  ModelProviderName,
  getModelSettings,
  generateText,
} from "@elizaos/core";
import type { LanguageModelUsage } from "ai";
import type { ImageMetadata, URI } from "@lens-protocol/metadata";
import type { Post, TextOnlyMetadata } from "@lens-protocol/client";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import z from "zod";
import pkg from "lodash";
const { uniq, uniqBy } = pkg;
import { walletOnly } from "@lens-chain/storage-client";
import {
  ImageRequirement,
  LaunchpadChain,
  TemplateCategory,
  TemplateName,
  type SmartMedia,
  type Template,
  type TemplateHandlerResponse,
  type TemplateUsage,
  type NFTMetadata,
} from "../utils/types";
import { isMediaStale, getLatestComments, getVoteWeightFromBalance, downloadVideoBuffer } from "../utils/utils";
import { bufferToVideoFile } from "../utils/ipfs";
import { fetchAllCollectorsFor, fetchAllCommentsFor, fetchAllUpvotersFor } from "../services/lens/posts";
import { balanceOfBatched } from "../utils/viem";
import { storageClient, LENS_CHAIN_ID, LENS_CHAIN } from "../services/lens/client";
import { BONSAI_PROTOCOL_FEE_RECIPIENT } from "../utils/constants";
import { generateVideoRunway } from "../services/runway";
import { DEFAULT_MODEL_ID, generateVideoLuma } from "../services/luma";
import { generateSpeech } from "../services/elevenlabs";
import { mergeVideoAndAudio } from "../services/videoProcessor";

type VideoGenerationResponse = {
  videoPrompt: string;
  narration: string;
}

type TemplateData = {
  nft: NFTMetadata;
  videoPrompt: string;
  elevenLabsVoiceId: string;
  narration: string;
  minCommentUpdateThreshold?: number;
}

const DEFAULT_MIN_ENGAGEMENT_UPDATE_THREHOLD = 1; // at least 3 upvotes/comments before updating
const RUNWAY_CHAR_LIMIT = 250; // really 1k, but dont want to push it
const NARRATION_CHAR_LIMIT = 130; // roughly 10s
const DEFAULT_VOICE_ID = "pNInz6obpgDQGcFmaJgB"; // Italian Brainrot

export const videoGenerationTemplate = `
# Instructions
Given a set of user Comments, select one 'comment' that feels the most comical, weird, or memeable when combined with the image's Attributes. Prioritize higher votes.

Then, try to parse out a 'narration' from that 'comment' that would go well to narrate a video about the image. NO emojis. Keep it strictly under ${NARRATION_CHAR_LIMIT} characters.

Finally, based on the provided image and selected 'comment', describe the visual scene for video animation. Focus solely on specific movements or actions that naturally evolve from the image, ensuring descriptions are purely visual. Feel free to focus on one of the Image attributes for the animation. Limit the prompt to ${RUNWAY_CHAR_LIMIT} characters.

## Attributes
{{attributes}}

## Comments
{{comments}}

Return ONLY the result as a JSON block in this format:
\`\`\`json
{
  "videoPrompt": string,
  "narration": string
}
\`\`\`

Do not acknowledge this request, simply respond with the JSON object.
`;

/**
 * Handles the generation and updating of a video composed of nft art and narration
 * This function either generates a new video based on initial template data
 * or refreshes an existing video by evaluating new comments and votes to decide the next version of the video
 *
 * @param {IAgentRuntime} runtime - The eliza runtime environment providing utilities for generating content and images.
 * @param {SmartMedia} [media] - The current, persisted media object associated with the adventure, used for updates.
 * @param {TemplateData} [_templateData] - Initial data for generating a new adventure preview, used when not refreshing.
 * @returns {Promise<TemplateHandlerResponse | null>} A promise that resolves to the response object containing the new page preview, uri (optional), and updated template data, or null if the operation cannot be completed.
 */
const nftDotFun = {
  handler: async (
    runtime: IAgentRuntime,
    media?: SmartMedia,
    _templateData?: TemplateData,
    options?: { forceUpdate: boolean },
  ): Promise<TemplateHandlerResponse | undefined> => {
    const refresh = !!media?.templateData;
    elizaLogger.info(`Running template (refresh: ${refresh}):`, TemplateName.NFT_DOT_FUN);

    // either we are refreshing the persisted `media` object or we're generating a preview using `_templateData`
    const templateData = refresh ? media?.templateData as TemplateData : _templateData;
    if (!templateData) {
      elizaLogger.error("Missing template data");
      return;
    }

    const totalUsage: TemplateUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      imagesCreated: 0,
      videoCostParams: {},
      audioCharacters: 0,
      customTokens: {},
    };

    let videoPrompt: string;
    let narration = templateData.narration;
    const image = templateData.nft.image?.cachedUrl || templateData.nft.metadata?.image;
    const attributes = templateData.nft.attributes?.map(((a) => `${a.trait_type}:${a.value}`));
    elizaLogger.info("attributes: ", attributes);

    if (!image) {
      elizaLogger.error("Missing image url, not found in nft metadata");
      return;
    }

    try {
      if (refresh) {
        let comments: Post[]; // latest comments to evaluate for the next generation

        // if the post not stale, check if we've passed the min comment threshold
        if (isMediaStale(media as SmartMedia) || options?.forceUpdate) {
          elizaLogger.info("media is stale...");

          try {
            // TODO: try to filter by timestamp in lens sdk
            const allComments = await fetchAllCommentsFor(media?.postId as string);
            comments = getLatestComments(media as SmartMedia, allComments);
            comments = uniqBy(comments, 'comment.author.address');
            console.log("comments", comments.length);
            const threshold = (media?.templateData as TemplateData).minCommentUpdateThreshold ||
              DEFAULT_MIN_ENGAGEMENT_UPDATE_THREHOLD;
            if (comments.length < threshold) {
              elizaLogger.info(`adventureTime:: post ${media?.postId} is stale but has not met comment threshold; skipping`);
              return { metadata: undefined, totalUsage };
            }
          } catch (error) {
            console.log(error);
            return;
          }
        } else {
          // do not update if the media isn't stale; we're paying for generations
          elizaLogger.info("media not stale...");
          return { metadata: undefined, totalUsage };
        }

        elizaLogger.info("sufficient comments, checking balances");

        // fetch the token balances for each comment / upvote to use weighted votes
        const allCollectors = await fetchAllCollectorsFor(media?.postId as string);
        const commentsWeighted = await Promise.all(comments.map(async (comment) => {
          let voters = await fetchAllUpvotersFor(comment.id);
          voters.push(comment.author.address);
          voters = uniq(voters); // discard upvotes from the same user
          voters = voters.filter((account) => allCollectors.includes(account)); // only collectors

          // If no token is present, each voter gets 1 vote
          if (!media?.token?.address) {
            return {
              content: (comment.metadata as TextOnlyMetadata).content,
              votes: voters.length,
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

        const context = composeContext({
          // @ts-expect-error State
          state: { attributes, comments: JSON.stringify(commentsWeighted) },
          template: videoGenerationTemplate,
        });

        // animation prompt
        elizaLogger.info("generating decision response:: generateObjectDeprecated");
        const { response, usage } = await generateObjectDeprecated({
          runtime,
          context,
          modelClass: ModelClass.MEDIUM,
          modelProvider: ModelProviderName.VENICE,
          returnUsage: true,
          messages: [{
            role: "user",
            content: [
              {
                type: "text",
                text: context
              },
              {
                type: "image",
                image
              }
            ]
          }]
        }) as unknown as { response: VideoGenerationResponse, usage: LanguageModelUsage };
        totalUsage.customTokens[getModelSettings(ModelProviderName.VENICE, ModelClass.MEDIUM)?.name] = usage;

        videoPrompt = response.videoPrompt;
        narration = response.narration;
      } else {
        // pure video prompt
        elizaLogger.info("generating decision response:: generateObjectDeprecated");
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
                text: `Based on the provided image and accompanying user prompt, describe the visual scene for video animation. Focus solely on specific movements or actions that naturally evolve from the image, ensuring descriptions are purely visual. Feel free to focus on one of the Image attributes for the animation. Limit the prompt to ${RUNWAY_CHAR_LIMIT} characters. User prompt: "${templateData.videoPrompt}. Image attributes: ${attributes}`
              },
              {
                type: "image",
                image
              }
            ]
          }]
        }) as unknown as { response: string, usage: LanguageModelUsage };
        totalUsage.customTokens[getModelSettings(ModelProviderName.VENICE, ModelClass.MEDIUM)?.name] = usage;

        videoPrompt = response;
      }

      elizaLogger.info(`generating video with prompt: ${videoPrompt} and image: ${image}`);
      const videoResponse = await generateVideoLuma({
        prompt: videoPrompt,
        promptImage: image,
      }, runtime);
      totalUsage.videoCostParams = { model: DEFAULT_MODEL_ID, duration: 5 };

      let videoBuffer: Buffer;
      if (videoResponse.success && videoResponse.data?.length) {
        videoBuffer = await downloadVideoBuffer(videoResponse.data[0]);
      } else {
        throw new Error("No video response");
      }

      const voiceId = templateData.elevenLabsVoiceId || DEFAULT_VOICE_ID;
      elizaLogger.info(`generating speech with narration: ${narration} and voiceId: ${voiceId}`);
      const audioBuffer = await generateSpeech(
        narration,
        voiceId
      );
      if (!audioBuffer) throw new Error("No audio response");
      totalUsage.audioCharacters = narration.length;

      // Merge video and audio using fluent-ffmpeg, adding subtitles
      const video = await mergeVideoAndAudio(videoBuffer, audioBuffer, narration);

      let metadata: ImageMetadata | undefined;
      if (refresh) {
        const url = await storageClient.resolve(media?.uri as URI);
        const json: ImageMetadata = await fetch(url).then(res => res.json());
        const videoUri = json?.lens?.video?.item;
        const signer = privateKeyToAccount(process.env.LENS_STORAGE_NODE_PRIVATE_KEY as `0x${string}`);
        const acl = walletOnly(signer.address, LENS_CHAIN_ID);

        // edit the video
        const videoFile = bufferToVideoFile(video);
        await storageClient.editFile(videoUri, videoFile, signer, { acl });
      }

      return {
        preview: {
          video: !refresh ? {
            buffer: Buffer.from(video).toJSON().data,
            mimeType: 'video/mp4',
            size: video.length
          } : undefined,
        },
        metadata,
        refreshMetadata: refresh,
        updatedTemplateData: { ...templateData },
        totalUsage,
      }
    } catch (error) {
      console.log(error);
      elizaLogger.error("handler failed", error);
    }
  },
  clientMetadata: {
    protocolFeeRecipient: BONSAI_PROTOCOL_FEE_RECIPIENT,
    category: TemplateCategory.EVOLVING_ART,
    name: TemplateName.NFT_DOT_FUN,
    displayName: "nftdotfun",
    description: "Animate your favorite NFT with voice-over. Collectors can influence future animations. Remix for finer animation control.",
    image: "https://link.storjshare.io/raw/jucj52nt52h6dmwixr7cg6i7hnpa/bonsai/nftdotfun.png",
    options: {
      allowPreview: true,
      allowPreviousToken: true,
      requireContent: true,
      imageRequirement: ImageRequirement.NONE,
      nftRequirement: ImageRequirement.REQUIRED,
    },
    defaultModel: getModelSettings(ModelProviderName.OPENAI, ModelClass.LARGE)?.name,
    templateData: {
      form: z.object({
        videoPrompt: z.string().describe("Describe the scene for your video"),
        elevenLabsVoiceId: z.string().nullish().describe("Choose the voice that will narrate your video"),
        narration: z.string().max(NARRATION_CHAR_LIMIT).describe(`What gets narrated during your video? (max ${NARRATION_CHAR_LIMIT} characters)`),
      })
    }
  }
} as Template;

export default nftDotFun;
