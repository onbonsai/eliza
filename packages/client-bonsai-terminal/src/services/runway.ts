import type { IAgentRuntime } from "@elizaos/core";
import RunwayML from "@runwayml/sdk";

export const generateVideoRunway = async (
    data: {
        prompt: string;
        promptImage: string;
        count?: number;
    },
    runtime: IAgentRuntime
): Promise<{
    success: boolean;
    data?: string[];
    error?: any;
}> => {
    const { prompt, promptImage } = data;
    let { count } = data;
    if (!count) {
        count = 1;
    }
    try {
        const client = new RunwayML({
            apiKey: runtime.getSetting("RUNWAY_API_KEY"),
        });

        const data = await client.imageToVideo.create({
            model: "gen3a_turbo",
            promptImage,
            promptText: prompt,
            duration: 5,
            ratio: "768:1280",
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

        console.log("Task complete:", task);

        return { success: true, data: task.output };
    } catch (error) {
        console.error(error);
        return { success: false, error: error };
    }
};
