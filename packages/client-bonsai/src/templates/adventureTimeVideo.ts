import {
  elizaLogger,
  ModelClass,
  composeContext,
  generateObjectDeprecated,
  type IAgentRuntime,
  ModelProviderName,
  generateImage,
  getModelSettings,
  generateText,
} from "@elizaos/core";
import type { LanguageModelUsage } from "ai";
import { type ImageMetadata, MediaImageMimeType, MediaVideoMimeType, type URI } from "@lens-protocol/metadata";
import type { Post, TextOnlyMetadata } from "@lens-protocol/client";
import { chains } from "@lens-chain/sdk/viem";
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
} from "../utils/types";
import { formatMetadata } from "../services/lens/createPost";
import { isMediaStale, getLatestComments, getVoteWeightFromBalance, downloadVideoBuffer } from "../utils/utils";
import { parseBase64Image, uploadJson, pinFile, storjGatewayURL, bufferToVideoFile } from "../utils/ipfs";
import { fetchAllCollectorsFor, fetchAllCommentsFor, fetchAllUpvotersFor } from "../services/lens/posts";
import { balanceOfBatched } from "../utils/viem";
import { storageClient, LENS_CHAIN_ID, LENS_CHAIN } from "../services/lens/client";
import { BONSAI_PROTOCOL_FEE_RECIPIENT } from "../utils/constants";
import { generateVideoRunway } from "../services/runway";

export const nextPageTemplate = `
# Instructions
You are generating the next page in a choose-your-own-adventure story.
The story is defined by the Context (the overall setting and premise), Writing Style, and Previous Pages (each condensed into this format: CHAPTER_NAME; DECISION_TAKEN).
Based on this information, write the next page. If there are no Previous Pages, then simply produce the first page which sets up the rest of the story.
Each "page" should be roughly 1-2 short paragraphs (4-5 sentences each) describing the action or situation.
End the new page with two distinct decision choices that the reader can pick from. The decision should be related to the events of the current page.
Start the page with a descriptive chapter name that can be used for future prompts to summarize the page. Do not include the chapter number in the name.

Provide a prompt to use to generate an image that would be a good compliment to the content.
After you generate the page and image prompt, format your response into a JSON object with these properties:
 \`\`\`json
{
    chapterName: string,
    content: string,
    decisions: string[2],
    imagePrompt: string
}
\`\`\`

# Context
{{context}}

# Writing Style
{{writingStyle}}

# Previous Pages
{{previousPages}}

Do not acknowledge this request, simply respond with the JSON object.
`;

export const decisionTemplate = `
# Instructions
You must choose one of the two Decisions based on the Comments. When processing the comments, you must account for any references to the decisions. For example, a comment might say "option A", "option 1", or include part of a decision's text; all should map to the correct decision.
Each comment is formatted as: { content: string, votes: number }.
Important: For each comment that maps to a decision, use the vote count exactly as provided (i.e., the integer in the "votes" field) without applying any scaling, rounding, or additional arithmetic transformations. For example, if a decision receives a comment with { votes: 22 }, then add exactly 22 to that decision's total.
Map each comment to its corresponding decision by matching textual cues, then sum the votes for each decision by adding up the exact vote values from all matching comments.
Return the result as a JSON object with the decisions and their corresponding totalVotes, sorted in descending order by totalVotes.
The output should be a JSON block with the following format: \`\`\`json { "decisions": [{ "content": string, "totalVotes": number }] } \`\`\`

# Decisions
{{decisions}}

# Comments
{{comments}}

Do not acknowledge this request, simply respond with the JSON block wrapped in triple backticks with 'json' language identifier.
`;

type NextPageResponse = {
  chapterName: string;
  content: string;
  decisions: [string, string];
  imagePrompt: string;
}

type DecisionResponse = {
  decisions: {
    content: string;
    totalVotes: number;
  }[]
}

type TemplateData = {
  context: string;
  writingStyle: string;
  chapterName: string;
  decisions: string[];
  previousPages?: string[]; // maybe only store the last n pages?
  modelId?: string;
  stylePreset?: string;
  minCommentUpdateThreshold?: number;
}

const DEFAULT_MIN_ENGAGEMENT_UPDATE_THREHOLD = 1; // at least 3 upvotes/comments before updating
const RUNWAY_CHAR_LIMIT = 250; // really 1k, but dont want to push it
const VIDEO_DURATION = 10;
const DEFAULT_MODEL_ID = "venice-sd35"; // most creative
const DEFAULT_STYLE_PRESET = "Film Noir";

/**
 * Handles the generation and updating of a "Choose Your Own Adventure" type post.
 * This function either generates a new adventure preview based on initial template data
 * or refreshes an existing adventure by evaluating new comments and votes to decide the next page.
 *
 * @param {IAgentRuntime} runtime - The eliza runtime environment providing utilities for generating content and images.
 * @param {SmartMedia} [media] - The current, persisted media object associated with the adventure, used for updates.
 * @param {TemplateData} [_templateData] - Initial data for generating a new adventure preview, used when not refreshing.
 * @returns {Promise<TemplateHandlerResponse | null>} A promise that resolves to the response object containing the new page preview, uri (optional), and updated template data, or null if the operation cannot be completed.
 */
const adventureTimeVideo = {
  handler: async (
    runtime: IAgentRuntime,
    media?: SmartMedia,
    _templateData?: TemplateData,
    options?: { forceUpdate: boolean },
  ): Promise<TemplateHandlerResponse | undefined> => {
    const refresh = !!media?.templateData;
    elizaLogger.info(`Running template (refresh: ${refresh}):`, TemplateName.ADVENTURE_TIME_VIDEO);

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

    try {
      if (refresh) {
        let comments: Post[]; // latest comments to evaluate for the next decision

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

        console.log({ decisions: templateData.decisions, comments: JSON.stringify(commentsWeighted) });
        const context = composeContext({
          // @ts-expect-error State
          state: { decisions: templateData.decisions, comments: JSON.stringify(commentsWeighted) },
          template: decisionTemplate,
        });

        // evaluate next decision
        elizaLogger.info("generating decision response:: generateObjectDeprecated");
        const { response, usage } = (await generateObjectDeprecated({
          runtime,
          context,
          modelClass: ModelClass.SMALL,
          modelProvider: ModelProviderName.OPENAI,
          returnUsage: true,
        })) as unknown as { response: DecisionResponse, usage: LanguageModelUsage };
        totalUsage.customTokens[getModelSettings(ModelProviderName.OPENAI, ModelClass.SMALL)?.name] = usage;

        // push to templateData.previousPages to be immediately used for a new generation
        if (templateData.previousPages) {
          templateData.previousPages.push(`${templateData.chapterName}; ${response.decisions[0].content}`);
        } else {
          templateData.previousPages = [`${templateData.chapterName}; ${response.decisions[0].content}`];
        }
        console.log("templateData.previousPages", templateData.previousPages);
      }

      const context = composeContext({
        // @ts-expect-error we don't need the full State object here to produce the context
        state: {
          context: templateData.context,
          previousPages: templateData.previousPages || '',
          writingStyle: templateData.writingStyle
        },
        template: nextPageTemplate,
      });

      elizaLogger.info("generating page:: generateObjectDeprecated");
      const { response: page, usage } = (await generateObjectDeprecated({
        runtime,
        context,
        modelClass: ModelClass.UNCENSORED,
        modelProvider: ModelProviderName.VENICE,
        returnUsage: true,
      })) as unknown as { response: NextPageResponse, usage: LanguageModelUsage };
      totalUsage.customTokens[getModelSettings(ModelProviderName.VENICE, ModelClass.UNCENSORED)?.name] = usage;

      const imageResponse = await generateImage(
        {
          prompt: page.imagePrompt,
          width: 1024,
          height: 1024,
          imageModelProvider: ModelProviderName.VENICE,
          modelId: templateData.modelId || DEFAULT_MODEL_ID,
          stylePreset: templateData.stylePreset || DEFAULT_STYLE_PRESET,
        },
        runtime
      );
      totalUsage.imagesCreated = 1;

      let image: string; // base64
      if (imageResponse?.success && imageResponse.data?.length) {
        image = imageResponse.data[0];
      } else {
        throw new Error("No image response");
      }

      const text = `${page.chapterName}
${page.content}

Option A) ${page.decisions[0]}

Option B) ${page.decisions[1]}
`;

      const { response: videoPrompt, usage: videoPromptUsage } = await generateText({
        runtime,
        modelClass: ModelClass.MEDIUM,
        modelProvider: ModelProviderName.VENICE,
        returnUsage: true,
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: `Based on the provided image and accompanying story content, describe the visual scene for video animation. Focus solely on specific movements or actions that naturally evolve from the image, ensuring descriptions are purely visual. Limit the prompt to ${RUNWAY_CHAR_LIMIT} characters. Story content: "${page.content}"`
            },
            {
              type: "image",
              image
            }
          ]
        }]
      }) as { response: string, usage: LanguageModelUsage };
      totalUsage.customTokens[getModelSettings(ModelProviderName.VENICE, ModelClass.MEDIUM)?.name] = videoPromptUsage;

      elizaLogger.info(`generating video with prompt: ${videoPrompt}`);
      const videoResponse = await generateVideoRunway({
        prompt: videoPrompt,
        promptImage: image,
        count: 1,
        duration: VIDEO_DURATION,
      }, runtime);
      totalUsage.videoCostParams = { model: "gen4_turbo", duration: 5 };

      let video: Buffer;
      if (videoResponse.success && videoResponse.data?.length) {
        video = await downloadVideoBuffer(videoResponse.data[0]);
      } else {
        throw new Error("No video response");
      }

      let metadata: ImageMetadata | undefined;
      if (refresh) {
        const url = await storageClient.resolve(media?.uri as URI);
        const json: ImageMetadata = await fetch(url).then(res => res.json());
        const videoUri = json?.lens?.video?.item
        const signer = privateKeyToAccount(process.env.LENS_STORAGE_NODE_PRIVATE_KEY as `0x${string}`);
        const acl = walletOnly(signer.address, LENS_CHAIN_ID);

        // edit the video and the metadata json
        const videoFile = bufferToVideoFile(video);
        await storageClient.editFile(videoUri, videoFile, signer, { acl });
        // edit the metadata
        metadata = formatMetadata({
          text,
          video: {
            url: videoUri,
            type: MediaVideoMimeType.MP4 // see generation.ts the provider
          },
          attributes: json.lens.attributes,
          media: {
            category: TemplateCategory.EVOLVING_POST,
            name: TemplateName.ADVENTURE_TIME_VIDEO,
          },
        }) as ImageMetadata;
        await storageClient.updateJson(media?.uri, metadata, signer, { acl });
      }

      return {
        preview: {
          text,
          image: imageResponse.success ? imageResponse.data?.[0] : undefined,
          video: !refresh ? {
            buffer: Buffer.from(video).toJSON().data,
            mimeType: 'video/mp4',
            size: video.length
          } : undefined,
        },
        metadata,
        refreshMetadata: refresh,
        updatedTemplateData: { ...templateData, decisions: page.decisions, chapterName: page.chapterName },
        totalUsage,
      }
    } catch (error) {
      console.log(error);
      elizaLogger.error("handler failed", error);
    }
  },
  clientMetadata: {
    protocolFeeRecipient: BONSAI_PROTOCOL_FEE_RECIPIENT,
    category: TemplateCategory.EVOLVING_POST,
    name: TemplateName.ADVENTURE_TIME_VIDEO,
    displayName: "Adventure Time (Video)",
    description: "The creator sets the stage for an evolving choose-your-own-adventure with video. Collectors & token holders decide the direction of the story.",
    image: "https://link.storjshare.io/raw/jxejf7rwn2hq3lhwh3v72g7bdpxa/bonsai/adventureTime.png",
    options: {
      allowPreview: true,
      allowPreviousToken: true,
      imageRequirement: ImageRequirement.NONE,
    },
    defaultModel: getModelSettings(ModelProviderName.OPENAI, ModelClass.LARGE)?.name,
    templateData: {
      form: z.object({
        context: z.string().describe("Set the initial context and background for your story. This will help guide the narrative direction. [placeholder: Satoshi sitting in his basement, ready to launch the Bitcoin Protocol; POV: Satoshi]"),
        writingStyle: z.string().describe("Define the writing style and tone - e.g. humorous, dramatic, poetic, etc. [placeholder: Smart, mysterious]"),
        modelId: z.string().nullish().describe("Optional: Specify an AI model to use for image generation"),
        stylePreset: z.string().nullish().describe("Optional: Choose a style preset to use for image generation"),
      })
    }
  }
} as Template;

export default adventureTimeVideo;
