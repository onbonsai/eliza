import {
    elizaLogger,
    composeContext,
    type IAgentRuntime,
    ModelProviderName,
    generateObjectDeprecated,
    ModelClass,
    getModelSettings,
} from "@elizaos/core";
import type { Post, SessionClient, TextOnlyMetadata } from "@lens-protocol/client";
import { privateKeyToAccount } from "viem/accounts";
import z from "zod";
import { authenticate } from "../services/lens/authenticate";
import {
  ImageRequirement,
    TemplateCategory,
    TemplateName,
    type SmartMedia,
    type Template,
    type TemplateHandlerResponse,
    type TemplateUsage,
} from "../utils/types";
import { createPost } from "../services/lens/createPost";
import { getLatestComments } from "../utils/utils";
import { fetchAllCommentsFor } from "../services/lens/posts";
import { client, SAGE_HANDLE } from "../services/lens/client";
import { BONSAI_PROTOCOL_FEE_RECIPIENT } from "../utils/constants";
import { LanguageModelUsage } from "ai";
import { postId } from "@lens-protocol/client";
import { fetchPost } from "@lens-protocol/client/actions";
import { openai } from '@ai-sdk/openai';

export const replyTemplate = `
# Instructions
You are an agent commentator that is responding to the content of a social post. The social post content is:
{{postContent}}

Some additional information about the post is:
{{info}}

Use these websites to get more information about the post:
{{urls}}

Your job is to respond to the following comments. Reply with a JSON formatted object that is a reply to the index of the comment you are replying to. Format the reply as a JSON array with the following properties where each object in the array represents a reply to a comment:
 \`\`\`json
[
    {
        reply_to: number,
        text: string
    },
    ...
]
\`\`\`

# Comments
{{comments}}
`;

type TemplateData = {
    info: string;
    urls: string;
};

type Reply = {
    reply_to: number;
    text: string;
};

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
const infoAgent = {
    handler: async (
        runtime: IAgentRuntime,
        media?: SmartMedia,
        _templateData?: TemplateData
    ): Promise<TemplateHandlerResponse | undefined> => {
        elizaLogger.info("Running template:", TemplateName.INFO_AGENT);

        if (!media?.templateData) {
            elizaLogger.error("Missing template data");
            return;
        }

        const templateData = media.templateData as TemplateData;

        let totalUsage: TemplateUsage = {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            imagesCreated: 0,
        };

        try {
            let comments: Post[]; // latest comments to evaluate for the next decision

            // fetch comments and respond to/tip them
            const allComments = await fetchAllCommentsFor(
                media?.postId as string
            );
            comments = getLatestComments(media as SmartMedia, allComments);
            if (comments.length === 0) {
                elizaLogger.info("No comments to respond to");
                return { metadata: undefined, totalUsage };
            }

            // fetch the post content
            const result = await fetchPost(client, {
                post: postId(media?.postId as string),
            });

            let postContent = "";
            if (result.isErr()) {
                elizaLogger.error("Error fetching post", result.error);
            } else {
                // @ts-ignore: metadata is there for sure
                postContent = result.value?.metadata?.content;
            }

            // generate reponses to the comments
            const context = composeContext({
                // @ts-expect-error we don't need the full State object here to produce the context
                state: {
                    postContent,
                    info: templateData?.info,
                    urls: templateData?.urls,
                    comments: comments
                        .map((c) => (c.metadata as TextOnlyMetadata).content)
                        .join("\n"),
                },
                template: replyTemplate,
            });

            const { response: replies, usage } =
                (await generateObjectDeprecated({
                    runtime,
                    context,
                    modelClass: ModelClass.MEDIUM,
                    modelProvider: ModelProviderName.OPENAI,
                    returnUsage: true,
                    tools: {
                      web_search_preview: openai.tools.webSearchPreview(),
                    },
                })) as unknown as {
                    response: Reply[];
                    usage: LanguageModelUsage;
                };

            totalUsage.promptTokens += usage.promptTokens;
            totalUsage.completionTokens += usage.completionTokens;
            totalUsage.totalTokens += usage.totalTokens;

            // respond to the comments
            const signer = privateKeyToAccount(
              process.env.EVM_PRIVATE_KEY as `0x${string}`
            );
            const sessionClient = await authenticate(signer, SAGE_HANDLE);
            for (let i = 0; i < comments.length; i++) {
                console.log(`replying to post: ${comments[i].id}`);
                const result = await createPost(
                    sessionClient as SessionClient,
                    signer,
                    { text: replies[i].text },
                    comments[i].id
                );

                if (!result) {
                    elizaLogger.error("Failed to reply to comment", result);
                }
            }

            // TODO: pick some comments to tip - max 3 per post

            // metdata does not change
            return { metadata: undefined, totalUsage };
        } catch (error) {
            console.log(error);
            elizaLogger.error("handler failed", error);
        }
    },
    clientMetadata: {
        protocolFeeRecipient: BONSAI_PROTOCOL_FEE_RECIPIENT,
        category: TemplateCategory.CAMPFIRE,
        name: TemplateName.INFO_AGENT,
        displayName: "Info Agent",
        description:
            "An AI assistant that monitors your post and replies to comments using your defined context & web links. It's like having a smart co-pilot for your content.",
        image: "https://link.storjshare.io/raw/jwr2m6ilrn5q2ayhuk2osvt7rjgq/bonsai/infoAgent.png",
        options: {
            allowPreview: false,
            allowPreviousToken: true,
            imageRequirement: ImageRequirement.OPTIONAL,
            requireContent: true,
        },
        defaultModel: getModelSettings(ModelProviderName.OPENAI, ModelClass.MEDIUM)?.name,
        templateData: {
            form: z.object({
                info: z
                    .string()
                    .describe(
                        "Provide information about the topic you want the agent to respond to"
                    ),
                urls: z
                    .string()
                    .describe(
                        "List of URLs containing additional information for the agent to reference separated by commas"
                    ),
            }),
        },
    },
} as Template;

export default infoAgent;
