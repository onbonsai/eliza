import { elizaLogger, type IAgentRuntime } from "@elizaos/core";
import { LumaAI } from "lumaai";

export const DEFAULT_MODEL_ID = "ray-flash-2"; // | ray-2
export const DEFAULT_DURATION = "10s";

export const generateVideoLuma = async (
  data: {
    prompt: string;
    promptImage: string;
    aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "21:9" | "9:21" | undefined
  },
  runtime: IAgentRuntime
): Promise<{
  success: boolean;
  data?: string[]; // urls
  error?: any;
}> => {
  const { prompt, promptImage, aspectRatio } = data;

  try {
    const client = new LumaAI({
      authToken: runtime.getSetting("LUMA_AI_API_KEY") as string
    });

    let generation = await client.generations.create({
      prompt,
      model: DEFAULT_MODEL_ID,
      keyframes: {
        frame0: {
          type: "image",
          url: promptImage
        }
      },
      duration: DEFAULT_DURATION,
      aspect_ratio: aspectRatio || "1:1",
    });

    if (!generation.id) throw new Error("No generation id");
    elizaLogger.info("create video submitted, waiting on job:", generation.id);

    let completed = false;

    while (!completed) {
      generation = await client.generations.get(generation.id as string);

      if (generation.state === "completed") {
        completed = true;
      } else if (generation.state === "failed") {
        throw new Error(`Generation failed: ${generation.failure_reason}`);
      } else {
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    elizaLogger.info("Generation complete:", generation);

    return {
      success: true,
      data: generation.assets?.video ? [generation.assets.video] : undefined
    };
  } catch (error) {
    elizaLogger.error(error);
    return { success: false, error: error };
  }
};
