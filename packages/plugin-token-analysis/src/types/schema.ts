import { z } from "zod";

export const ScoreSchema = z.object({
    rating: z.string().describe("Rating for the token"),
    reason: z.string().describe("Longer explanation"),
});

export const TokenInfoSchema = z.object({
    ticker: z.string().describe("Ticker"),
    inputTokenAddress: z.string().describe("Token address"),
    chain: z.string().describe("Chain"),
});
