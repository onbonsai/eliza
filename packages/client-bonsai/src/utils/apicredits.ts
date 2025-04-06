import { getCreditsClient } from "../services/mongo";

export const DEFAULT_MODEL_ID = "gpt-4o";

const imageCost = 1; // venice costs 1 cent per image

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
};

const minCreditsForUpdate: Record<string, number> = {
    adventure_time:
        calculateTokenCost(350, modelCosts["gpt-4.5-preview"].input) +
        calculateTokenCost(15, modelCosts["gpt-4.5-preview"].output) +
        1,
    artist_present: 1,
    info_agent:
        calculateTokenCost(350, modelCosts["gpt-4o"].input) +
        calculateTokenCost(15, modelCosts["gpt-4o"].output),
};

function calculateTokenCost(
    tokensUsed: number,
    costPerMillionTokens: number
): number {
    return (tokensUsed / 1_000_000) * costPerMillionTokens;
}

export const canUpdate = async (address: string, template: string) => {
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
    images: number
) => {
    const cost =
        calculateTokenCost(tokens.input, modelCosts[model].input) +
        calculateTokenCost(tokens.output, modelCosts[model].output);
    const costImages = imageCost * images;
    const totalCost = cost + costImages;

    if (totalCost === 0) return;

    const { credits } = await getCreditsClient();
    await credits.updateOne(
        { address },
        { $inc: { credits: -totalCost } },
        { upsert: true }
    );
};
