import { elizaLogger } from "@ai16z/eliza/src/logger.ts";
import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    Plugin,
    State,
} from "@ai16z/eliza/src/types.ts";
import { generateVideo } from "@ai16z/eliza/src/generation.ts";

const videoGeneration: Action = {
    name: "GENERATE_VIDEO",
    similes: ["VIDEO_GENERATION", "VIDEO_GEN", "CREATE_VIDEO", "MAKE_PICTURE"],
    description: "Generate a video to go along with the message.",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        const runwayApiKeyOk = !!runtime.getSetting("RUNWAY_API_KEY");
        return runwayApiKeyOk;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback: HandlerCallback
    ) => {
        elizaLogger.log("Composing state for message:", message);
        state = (await runtime.composeState(message)) as State;
        const userId = runtime.agentId;
        elizaLogger.log("User ID:", userId);

        const videoPrompt = message.content.text;
        elizaLogger.log("Video prompt received:", videoPrompt);

        // TODO: Generate a prompt for the video

        const res: { video: string; caption: string }[] = [];

        elizaLogger.log("Generating video with prompt:", videoPrompt);
        const videos = await generateVideo(
            {
                prompt: videoPrompt,
                promptImage: message.content.attachments[0].url,
                width: 1024,
                height: 1024,
                count: 1,
            },
            runtime
        );

        if (videos.success && videos.data && videos.data.length > 0) {
            elizaLogger.log(
                "Video generation successful, number of videos:",
                videos.data.length
            );

            // TODO: generate caption for video

            for (let i = 0; i < videos.data.length; i++) {
                const video = videos.data[i];
                elizaLogger.log(`Processing video ${i + 1}:`, video);

                res.push({ video: video, caption: videoPrompt });

                callback(
                    {
                        text: videoPrompt,
                        attachments: [
                            {
                                id: crypto.randomUUID(),
                                url: video,
                                title: "Generated video",
                                source: "videoGeneration",
                                description: videoPrompt,
                                text: videoPrompt,
                            },
                        ],
                    },
                    []
                );
            }
        } else {
            elizaLogger.error("Video generation failed or returned no data.");
        }
    },
    examples: [
        // TODO: We want to generate videos in more abstract ways, not just when asked to generate an video

        [
            {
                user: "{{user1}}",
                content: { text: "Generate an video of a cat" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here's an video of a cat",
                    action: "GENERATE_VIDEO",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Generate an video of a dog" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here's an video of a dog",
                    action: "GENERATE_VIDEO",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Create an video of a cat with a hat" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here's an video of a cat with a hat",
                    action: "GENERATE_VIDEO",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Make an video of a dog with a hat" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here's an video of a dog with a hat",
                    action: "GENERATE_VIDEO",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Paint an video of a cat with a hat" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here's an video of a cat with a hat",
                    action: "GENERATE_VIDEO",
                },
            },
        ],
    ],
} as Action;

export const videoGenerationPlugin: Plugin = {
    name: "videoGeneration",
    description: "Generate videos",
    actions: [videoGeneration],
    evaluators: [],
    providers: [],
};
