import {
  elizaLogger,
  type IAgentRuntime,
  ModelProviderName,
  generateImage,
  ModelClass,
  generateText,
  getModelSettings,
} from "@elizaos/core";
import type { VideoMetadata, URI } from "@lens-protocol/metadata";
import type { Post } from "@lens-protocol/client";
import { privateKeyToAccount } from "viem/accounts";
import { walletOnly } from "@lens-chain/storage-client";
import z from "zod";
import pkg from "lodash";
const { uniqBy } = pkg;
import type { LanguageModelUsage } from "ai";
import {
  ImageRequirement,
  TemplateCategory,
  TemplateName,
  type SmartMedia,
  type Template,
  type TemplateHandlerResponse,
  type TemplateUsage,
} from "../utils/types";
import { isMediaStale, downloadVideoBuffer, downloadImageAsBase64 } from "../utils/utils";
import { bufferToVideoFile } from "../utils/ipfs";
import { fetchAllCollectorsFor, fetchAllCommentsFor } from "../services/lens/posts";
import { LENS_CHAIN_ID, storageClient } from "../services/lens/client";
import { BONSAI_PROTOCOL_FEE_RECIPIENT } from "../utils/constants";
import type { AspectRatio } from "../services/runway";
import { generateSpeech } from "../services/elevenlabs";
import { concatenateVideos, extractFrameFromVideo, mergeVideoAndAudio } from '../services/videoProcessor';
import { DEFAULT_DURATION_S, DEFAULT_MODEL_ID, generateVideoLuma } from "../services/luma";

type TemplateData = {
  sceneDescription: string;
  narration: string;
  elevenLabsVoiceId: string;
  imageData?: string; // base64
  aspectRatio?: AspectRatio;
  modelId?: string;
  stylePreset?: string;
  versionCount: number; // how many videos we've created
}

const DEFAULT_IMAGE_MODEL_ID = "venice-sd35"; // most artistic (venice)
const DEFAULT_VOICE_ID = "zcAOhNBS3c14rBihAFp1"; // Italian
const MAX_VERSION_COUNT = 3; // only 3 versions allowed (index is 0-based)
const RUNWAY_CHAR_LIMIT = 150; // really 1k, but dont want to push it
const NARRATION_CHAR_LIMIT = 130; // roughly 10s

/**
 * Handles the generation and updating of a "Video fun" type post.
 * This function refreshes an existing post by evaluating new comments and votes to decide the evolution of the video.
 *
 * @param {IAgentRuntime} runtime - The eliza runtime environment providing utilities for generating content and images.
 * @param {boolean} refresh - Flag indicating whether to generate a new page or update an existing one.
 * @param {SmartMedia} [media] - The current, persisted media object associated with the smart media, used for updates.
 * @param {TemplateData} [_templateData] - Initial data for generating a new preview, used when not refreshing.
 * @returns {Promise<TemplateHandlerResponse | null>} A promise that resolves to the response object containing the new image preview, uri (optional), and updated template data, or null if the operation cannot be completed.
 */
const videoFun = {
  handler: async (
    runtime: IAgentRuntime,
    media?: SmartMedia,
    _templateData?: TemplateData,
    options?: { forceUpdate: boolean },
  ): Promise<TemplateHandlerResponse | undefined> => {
    const refresh = !!media?.templateData;
    elizaLogger.info(`Running template (refresh: ${refresh}):`, TemplateName.VIDEO_DOT_FUN);

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
      videoCostParams: 0,
      audioCharacters: 0,
      customTokens: {},
    };

    let versionCount = templateData.versionCount || 0;

    if (versionCount === MAX_VERSION_COUNT) {
      elizaLogger.info(`videoFun:: post ${media?.postId} has reached the max version count; skipping`);
      return { metadata: undefined, totalUsage };
    }

    let nextComment: Post | undefined;
    try {
      if (refresh) {
        let comments: Post[]; // the comments from collectors (first MAX_VERSION_COUNT) sorted asc by timestamp

        // if the post not stale, check if we've passed the min comment threshold
        if (isMediaStale(media as SmartMedia) || options?.forceUpdate) {
          elizaLogger.info("media is stale...");

          try {
            // TODO: try to filter by timestamp in lens sdk
            let allComments = await fetchAllCommentsFor(media?.postId as string);
            allComments = uniqBy(allComments.sort((a, b) => Number.parseInt(b.timestamp) - Number.parseInt(a.timestamp)), 'author.address');
            const collectorsSortedAsc = await fetchAllCollectorsFor(media?.postId as string, true);

            if (collectorsSortedAsc.length <= versionCount) {
              elizaLogger.info(`videoFun:: post ${media?.postId} is stale but does not have new collectors; skipping`);
              return { metadata: undefined, totalUsage };
            }

            // Create a map of lowercase addresses to their original comment objects
            const addressToComment = new Map(
              allComments.map(c => [c.author.address.toLowerCase(), c])
            );

            // Get comments for the first collectors
            comments = collectorsSortedAsc
              .slice(0, MAX_VERSION_COUNT)
              .map(addr => addressToComment.get(addr.toLowerCase()))
              .filter((c) => c) as Post[];
          } catch (error) {
            console.log(error);
            return;
          }
        } else {
          // do not update if the media isn't stale; we're paying for generations
          elizaLogger.info("media not stale...");
          return { metadata: undefined, totalUsage };
        }

        nextComment = comments[versionCount];
        if (!nextComment) throw new Error(`unexpected undefined comment at versionCount: ${versionCount}`);
      }

      let json: VideoMetadata | undefined;
      let videoUri: string | undefined;
      let ogVideo: Buffer<ArrayBufferLike> | undefined;

      // Generate a video using the template data inputs (optional image, narration)
      let image: string; // base64
      if (refresh) {
        const url = await storageClient.resolve(media?.uri as URI);
        json = await fetch(url).then(res => res.json());
        videoUri = json?.lens?.video?.item

        // use the comment image if provided, else the final frame in the last clip
        if (nextComment?.metadata?.image?.item) {
          const url = nextComment?.metadata?.image?.item.startsWith("lens://")
            ? await storageClient.resolve(nextComment?.metadata?.image?.item as URI)
            : nextComment?.metadata?.image?.item;
          image = await downloadImageAsBase64(url);
        } else {
          ogVideo = await downloadVideoBuffer(storageClient.resolve(videoUri as string));
          image = await extractFrameFromVideo(ogVideo!, true); // the last frame
        }
      } else if (!!templateData.imageData) {
        image = templateData.imageData;
        templateData.imageData = undefined; // delete it so it doesnt go in the cache
      } else {
        const imageResponse = await generateImage(
          {
            prompt: templateData.sceneDescription,
            width: 1024,
            height: 1024,
            imageModelProvider: ModelProviderName.VENICE,
            modelId: templateData.modelId || DEFAULT_IMAGE_MODEL_ID,
            stylePreset: templateData.stylePreset,
          },
          runtime
        );

        totalUsage.imagesCreated = 1;

        if (imageResponse?.success && imageResponse.data?.length) {
          image = imageResponse.data[0];
        } else {
          throw new Error("No image response");
        }
      }

      const comment = !refresh
        ? templateData.sceneDescription
        : nextComment?.metadata?.content || "something random happens";
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
              text: `Given the current image and the following user comment, briefly describe a dynamic and visually clear scene for video animation. Focus solely on ONE specific movement or action that naturally animates the image, ensuring the description is purely visual. Keep it strictly under ${RUNWAY_CHAR_LIMIT} characters. User comment: ${comment}`
            },
            {
              type: "image",
              image
            }
          ]
        }]
      }) as { response: string, usage: LanguageModelUsage };
      totalUsage.customTokens[getModelSettings(ModelProviderName.VENICE, ModelClass.MEDIUM)?.name] = usage;
      const videoPrompt = response;

      elizaLogger.info(`generating video with prompt: ${videoPrompt}`);
      const videoResponse = await generateVideoLuma({
        prompt: videoPrompt,
        promptImage: image,
        aspectRatio: templateData?.aspectRatio,
      }, runtime);
      totalUsage.videoCostParams = { model: DEFAULT_MODEL_ID, duration: DEFAULT_DURATION_S };

      let videoBuffer: Buffer;
      if (videoResponse.success && videoResponse.data?.length) {
        videoBuffer = await downloadVideoBuffer(videoResponse.data[0]);
      } else {
        throw new Error("No video response");
      }

      let narration: string | undefined;
      if (!refresh) {
        narration = templateData.narration;
      }

      if (!narration) {
        const { response: narrationResponse, usage: narrationUsage } = await generateText({
          runtime,
          context: `You're jumping into a collaboratively-made video moment. Given ${templateData.narration ? `the original line "${templateData.narration}" and ` : ""} what's happening in this clip ("${videoPrompt}"), write a short and spontaneous comment or reaction someone might naturally say out loud. The more unhinged the line, the better. Keep it under ${NARRATION_CHAR_LIMIT} characters, and do not use emojis.`,
          modelClass: ModelClass.SMALL,
          modelProvider: ModelProviderName.OPENAI,
          returnUsage: true,
        }) as { response: string, usage: LanguageModelUsage };
        totalUsage.customTokens[getModelSettings(ModelProviderName.OPENAI, ModelClass.SMALL)?.name] = narrationUsage;
        narration = narrationResponse.replace(/['"]/g, '');
      }

      elizaLogger.info(`generating speech with narration: ${narration}`);
      const audioBuffer = await generateSpeech(
        narration,
        templateData.elevenLabsVoiceId || DEFAULT_VOICE_ID
      );
      if (!audioBuffer) throw new Error("No audio response");
      totalUsage.audioCharacters = narration.length;

      // Merge video and audio using fluent-ffmpeg, adding subtitles
      const video = await mergeVideoAndAudio(videoBuffer, audioBuffer, narration);

      // Lens storage logic
      let persistVersionUri: string | undefined;
      if (refresh) {
        templateData.narration = `${templateData.narration}. ${narration}`;
        const signer = privateKeyToAccount(process.env.LENS_STORAGE_NODE_PRIVATE_KEY as `0x${string}`);
        const acl = walletOnly(signer.address, LENS_CHAIN_ID);
        const newVideo = await concatenateVideos(ogVideo!, video);

        // Convert video buffer to File and upload
        const videoFile = bufferToVideoFile(newVideo);
        await storageClient.editFile(videoUri, videoFile, signer, { acl });

        versionCount += 1;
      } else {
        templateData.narration = narration;
      }

      // elizaLogger.info("totalUsage", totalUsage)

      return {
        preview: {
          video: !refresh ? {
            buffer: Buffer.from(video).toJSON().data,
            mimeType: 'video/mp4',
            size: video.length
          } : undefined,
          image: !refresh ? await extractFrameFromVideo(video) : undefined, // the first frame for the cover
        },
        refreshMetadata: refresh,
        updatedTemplateData: { ...templateData, versionCount },
        persistVersionUri,
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
    name: TemplateName.VIDEO_DOT_FUN,
    displayName: "Video Dot Fun",
    description: `Collab on fun & spontanous video generation. The first ${MAX_VERSION_COUNT} collectors can comment to extend the video.`,
    image: "https://link.storjshare.io/raw/jxsesguowbvuyllaak6k6cegfywa/bonsai/videoDotFun.png",
    options: {
      allowPreview: true,
      allowPreviousToken: true,
      imageRequirement: ImageRequirement.OPTIONAL,
      requireContent: true,
    },
    templateData: {
      form: z.object({
        sceneDescription: z.string().describe("Describe the scene for your video [placeholder: The character waves at the camera]"),
        elevenLabsVoiceId: z.string().nullish().describe("Choose the voice that will narrate your video"),
        narration: z.string().max(NARRATION_CHAR_LIMIT).nullish().describe(`Optional: What gets narrated during your video? (max ${NARRATION_CHAR_LIMIT} characters) [placeholder: Hello, Bonsai. Load up your bags!]`),
        modelId: z.string().nullish().describe("Optional: Specify an AI model to use for image generation"),
        stylePreset: z.string().nullish().describe("Optional: Choose a style preset to use for image generation"),
      })
    }
  }
} as Template;

export default videoFun;