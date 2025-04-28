import fs from 'node:fs';
import { elizaLogger, type IAgentRuntime } from "@elizaos/core";
import { LumaAI } from "lumaai";
import { isBase64Image, saveBase64Image } from '../utils/image';

export const DEFAULT_MODEL_ID = "ray-flash-2"; // | ray-2
export const DEFAULT_DURATION = "9s";
export const DEFAULT_DURATION_S = 9;

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

  let tempImagePath: string | undefined;

  try {
    const client = new LumaAI({
      authToken: runtime.getSetting("LUMA_AI_API_KEY") as string
    });

    // Handle base64 image if present
    let imageUrl = promptImage;
    if (isBase64Image(promptImage)) {
      const savedImage = await saveBase64Image(promptImage);
      imageUrl = `${process.env.DOMAIN}${savedImage.url}`;
      tempImagePath = savedImage.filepath;
    }

    let generation = await client.generations.create({
      prompt,
      model: DEFAULT_MODEL_ID,
      keyframes: {
        frame0: {
          type: "image",
          url: imageUrl
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

    // Delete temporary image file if it exists
    if (tempImagePath) {
      try {
        await fs.promises.unlink(tempImagePath);
        // elizaLogger.info("Temporary image file deleted:", tempImagePath);
      } catch (error) {
        elizaLogger.error("Error deleting temporary image file:", error);
      }
    }

    return {
      success: true,
      data: generation.assets?.video ? [generation.assets.video] : undefined
    };
  } catch (error) {
    // Delete temporary image file if it exists, even on error
    if (tempImagePath) {
      try {
        await fs.promises.unlink(tempImagePath);
        // elizaLogger.info("Temporary image file deleted after error:", tempImagePath);
      } catch (deleteError) {
        elizaLogger.error("Error deleting temporary image file after error:", deleteError);
      }
    }

    elizaLogger.error(error);
    return { success: false, error: error };
  }
};
