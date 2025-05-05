import { elizaLogger, type IAgentRuntime } from "@elizaos/core";
import RunwayML from "@runwayml/sdk";

export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9";

const ASPECT_RATIO_MAP: Record<AspectRatio, string> = {
    "9:16": "720:1280",
    "16:9": "1280:720",
    "4:3": "1104:832",
    "3:4": "832:1104",
    "1:1": "960:960",
    "21:9": "1584:672"
};

export const generateVideoRunway = async (
    data: {
        prompt: string;
        promptImage: string;
        count?: number;
        duration?: 5 | 10;
        aspectRatio?: AspectRatio;
    },
    runtime: IAgentRuntime
): Promise<{
    success: boolean;
    data?: string[]; // urls
    error?: any;
}> => {
    const { prompt, promptImage } = data;
    let { count, duration, aspectRatio } = data;
    if (!count) count = 1;
    if (!duration) duration = 5;
    if (!aspectRatio) aspectRatio = "1:1";
    try {
        const client = new RunwayML({
            apiKey: runtime.getSetting("RUNWAY_API_KEY") as string,
        });

        const data = await client.imageToVideo.create({
            model: "gen4_turbo",
            promptImage,
            promptText: prompt,
            duration,
            seed: 10001, // TODO: maybe inferred from a generation
            // @ts-ignore
            ratio: ASPECT_RATIO_MAP[aspectRatio as AspectRatio],
        });

        console.log("create video submitted, waiting on job:", data.id);
        // const data = { id: '70b17281-085a-404f-9f41-8cde19850acb' }

        // Poll the task until it's complete
        let task: Awaited<ReturnType<typeof client.tasks.retrieve>>;
        do {
            // Wait for ten seconds before polling
            await new Promise((resolve) => setTimeout(resolve, 10000));

            task = await client.tasks.retrieve(data.id);
        } while (!["SUCCEEDED", "FAILED"].includes(task.status));

        elizaLogger.info("Task complete:", task);

        return { success: true, data: task.output };
    } catch (error) {
        console.error(error);
        return { success: false, error: error };
    }
};
