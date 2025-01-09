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

// Updated to allow either a single object or an array of objects
export const OptionalArrayScoreSchema = z
    .union([ScoreSchema.nullable(), z.array(ScoreSchema.nullable())])
    .describe("Either a single score or an array of scores");

export const OptionalArrayTokenInfoSchema = z
    .union([TokenInfoSchema.nullable(), z.array(TokenInfoSchema.nullable())])
    .describe("Either a single token info or an array of token infos");
