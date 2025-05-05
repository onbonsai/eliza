import type { LanguageModelUsage } from "ai";
import { getCreditsClient } from "../services/mongo";
import { TemplateName } from "./types";
import { DEFAULT_DURATION_S, DEFAULT_MODEL_ID as DEFAULT_LUMA_MODEL } from "../services/luma";
import { elizaLogger } from "@elizaos/core";

export const DEFAULT_MODEL_ID = "gpt-4o";

// disable credits system
const disableCredits = process.env.DISABLE_CREDITS === "true";

const imageCost = 1; // venice costs 1 cent per image
const videoCost = ({ model, duration }: { model: string; duration: number }) => {
  if (model === "gen4_turbo") return duration === 5 ? 25 : 50; // https://docs.dev.runwayml.com/usage/billing
  if (model === "ray-flash-2") return duration === 5 ? 24 : 44 // https://lumalabs.ai/api/pricing (720p)
  if (model === "ray-2") return duration === 5 ? 70 : 127 // https://lumalabs.ai/api/pricing (720p)
  return 0;
};
const audioCost = (characters: number) => (characters * 30) / 1000; // 30 cents/1000 chars (elevenlabs, creator)

// cost per 1M tokens (1 credit = 1 cent)
const modelCosts = {
    "gpt-4.5-preview": {
        input: 75_00,
        output: 150_00,
    },
    "gpt-4.5": {
        input: 75_00,
        output: 150_00,
    },
    "gpt-4o": {
        input: 2_50,
        output: 10_00,
    },
    "gpt-4o-mini": {
        input: 15,
        output: 60,
    },
    "qwen-2.5-vl": {
        input: 70,
        output: 2_80,
    },
    "gpt-4.1": {
        input: 2_00,
        output: 8_00,
    },
    "venice-uncensored": {
        input: 50,
        output: 200,
    },
};

export const minCreditsForUpdate: Record<string, number> = {
    [TemplateName.ADVENTURE_TIME]:
        calculateTokenCost(350, modelCosts["gpt-4.1"].input) +
        calculateTokenCost(15, modelCosts["gpt-4.1"].output) +
        1,
    [TemplateName.EVOLVING_ART]: 1,
    [TemplateName.INFO_AGENT]:
        calculateTokenCost(350, modelCosts["gpt-4o"].input) +
        calculateTokenCost(15, modelCosts["gpt-4o"].output),
    [TemplateName.VIDEO_DOT_FUN]:
        calculateTokenCost(800, modelCosts["qwen-2.5-vl"].input) +
        calculateTokenCost(125, modelCosts["qwen-2.5-vl"].output) +
        calculateTokenCost(225, modelCosts["gpt-4o-mini"].input) +
        calculateTokenCost(50, modelCosts["gpt-4o-mini"].output) +
        50 +
        4,
    [TemplateName.ADVENTURE_TIME_VIDEO]:
        calculateTokenCost(350, modelCosts["gpt-4.1"].input) +
        calculateTokenCost(250, modelCosts["gpt-4.1"].output) +
        calculateTokenCost(1850, modelCosts["qwen-2.5-vl"].input) +
        calculateTokenCost(50, modelCosts["qwen-2.5-vl"].output) +
        1 +
        50,
    [TemplateName.NFT_DOT_FUN]:
        calculateTokenCost(125, modelCosts["gpt-4o-mini"].input) +
        calculateTokenCost(25, modelCosts["gpt-4o-mini"].output) +
        calculateTokenCost(2250, modelCosts["qwen-2.5-vl"].input) +
        calculateTokenCost(50, modelCosts["qwen-2.5-vl"].output) +
        videoCost({ model: DEFAULT_LUMA_MODEL, duration: DEFAULT_DURATION_S }) +
        audioCost(130),
};

export const getCreditsForMessage = (model: string): number => {
    if (disableCredits) return 0;

    return (
        calculateTokenCost(3_500, modelCosts[model].input) +
        calculateTokenCost(150, modelCosts[model].output)
    );
};

function calculateTokenCost(
    tokensUsed: number,
    costPerMillionTokens: number
): number {
    return (tokensUsed / 1_000_000) * costPerMillionTokens;
}

export const canUpdate = async (address: string, template: string) => {
    if (disableCredits) return true;

    const { credits } = await getCreditsClient();
    const credit = await credits.findOne({ address });
    return (
        credit?.creditsRemaining &&
        credit.creditsRemaining >= (minCreditsForUpdate[template] ?? 0)
    );
};

export const decrementCredits = async (
    address: string,
    model: string,
    tokens: { input: number; output: number },
    images?: number,
    videoCostParams?: { model: string; duration: number },
    audioCharacters?: number,
    customTokens?: Record<string, LanguageModelUsage>,
): Promise<number | undefined> => {
    if (disableCredits) return;

    let cost: number;
    try {
        cost = customTokens
            ? Object.entries(customTokens).reduce(
                (acc, [_model, { promptTokens, completionTokens }]) =>
                    acc +
                    calculateTokenCost(promptTokens, modelCosts[_model].input) +
                    calculateTokenCost(completionTokens, modelCosts[_model].output),
                0
            )
            : calculateTokenCost(tokens.input, modelCosts[model].input) +
            calculateTokenCost(tokens.output, modelCosts[model].output);
    } catch (error) {
        elizaLogger.error("ERROR: decrementCredits::", error);
        cost = calculateTokenCost(tokens.input, modelCosts["gpt-4o"].input) +
            calculateTokenCost(tokens.output, modelCosts["gpt-4o"].output);
    }

    const costImages = imageCost * (images || 0);
    const costVideos = videoCostParams ? videoCost(videoCostParams) : 0;
    const costAudio = audioCharacters ? audioCost(audioCharacters) : 0;
    const totalCost = cost + costImages + costVideos + costAudio;

    if (totalCost === 0) return;

    const { credits } = await getCreditsClient();

    // Get current credit document
    const creditDoc = await credits.findOne({ address });
    if (!creditDoc) return;

    // Calculate how many credits to take from each type
    let remainingCost = totalCost;
    let freeCreditsUsed = 0;
    let stakingCreditsUsed = 0;
    let purchasedCreditsUsed = 0;

    // Use free credits first
    if (creditDoc.freeCredits > 0) {
        freeCreditsUsed = Math.min(remainingCost, creditDoc.freeCredits);
        remainingCost -= freeCreditsUsed;
    }

    // Then use staking credits
    if (remainingCost > 0 && creditDoc.stakingCredits > 0) {
        stakingCreditsUsed = Math.min(remainingCost, creditDoc.stakingCredits);
        remainingCost -= stakingCreditsUsed;
    }

    // Finally use purchased credits
    if (remainingCost > 0 && creditDoc.creditsPurchased > 0) {
        purchasedCreditsUsed = Math.min(remainingCost, creditDoc.creditsPurchased);
        remainingCost -= purchasedCreditsUsed;
    }

    // Update the credit document
    const updatedCredits = await credits.findOneAndUpdate(
        { address },
        {
            $inc: {
                freeCredits: -freeCreditsUsed,
                stakingCredits: -stakingCreditsUsed,
                creditsPurchased: -purchasedCreditsUsed,
                creditsUsed: totalCost,
                creditsRemaining: -totalCost,
            },
        },
        {
            returnDocument: "after",
        }
    );
    return updatedCredits?.creditsRemaining;
};

export const getCredits = async (address: string): Promise<number> => {
    if (disableCredits) return 0;

    const { credits } = await getCreditsClient();
    const credit = await credits.findOne({ address });
    return credit?.creditsRemaining || 0;
};
