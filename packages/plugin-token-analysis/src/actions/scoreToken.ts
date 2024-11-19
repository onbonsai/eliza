import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes/index.js";
import {
    Connection,
    Keypair,
    PublicKey,
    VersionedTransaction,
} from "@solana/web3.js";
import BigNumber from "bignumber.js";
import { v4 as uuidv4 } from "uuid";
import { TrustScoreDatabase } from "../adapters/trustScoreDatabase.ts";
import { composeContext } from "@ai16z/eliza/src/context.ts";
import { generateObject } from "@ai16z/eliza/src/generation.ts";
import settings from "@ai16z/eliza/src/settings.ts";
import {
    ActionExample,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    type Action,
} from "@ai16z/eliza/src/types.ts";
import { TokenProvider } from "../providers/token.ts";
import { TrustScoreManager } from "../providers/trustScoreProvider.ts";
import { ProcessedTokenData } from "../types/token.ts";

const messageTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "ticker": "$BONSAI"
    "inputTokenAddress": "0x474f4cb764df9da079D94052fED39625c147C12C",
    "chain": "Base"
}
\`\`\`

{{recentMessages}}

Given the recent messages extract the following information about the requested token:
- The token ticker
- Contract address of the token
- The chain that the token is on

ONLY GET THE MOST RECENT TOKEN INFO FROM THE MESSAGES. MOST LIKELY FROM THE VERY LAST MESSAGE.

Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined. The result should be a valid JSON object with the following schema:
\`\`\`json
{
    "ticker": string | null,
    "inputTokenAddress": string | null,
    "chain": string | null
}
\`\`\`

The ticker will be several characters with a dollar sign in front such as $Degen, $BONSAI, $eth, $SOL, $BTC, $MOG, $wif. It may be all caps or all lower case or something in between.
The chain will be one of the following: ["solana", "ethereum", "arbitrum", "avalanche", "bsc", "optimism", "polygon", "base", "zksync"]
The token address will start with a "0x" and be 42 characters long, hexadecimal (example: 0x474f4cb764df9da079D94052fED39625c147C12C) UNLESS it is a Solana token in which case it will be 44 characters long and a mix of digits and letters (example: 5voS9evDjxF589WuEub5i4ti7FWQmZCsAsyD5ucbuRqM).
`;

const ratingTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "rating": TokenScore.STRONG_BUY
}
\`\`\`

Social Report
{{socialResult}}

Technical Report
{{technicalResult}}

Given the social and technical reports assign the token a TokenScore rating. Token Score is an enum defined as:

enum TokenScore {
    STRONG_SELL = "Strong Sell",
    SELL = "Sell",
    NEUTRAL = "Neutral",
    BUY = "Buy",
    STRONG_BUY = "Strong Buy",
}

Respond with a JSON markdown block containing only the extracted values. The result should be a valid JSON object with the following schema:
\`\`\`json
{
    "rating": TokenScore
}
\`\`\`
`;

// scoreToken should took CA, not symbol. return TokenScore enum

export enum TokenScore {
    STRONG_SELL = "Strong Sell",
    SELL = "Sell",
    NEUTRAL = "Neutral",
    BUY = "Buy",
    STRONG_BUY = "Strong Buy",
}

// SOCIAL ANALYSIS
const socialAnalysis = async (
    runtime: IAgentRuntime,
    ticker: string
): Promise<string> => {
    // TODO
    return "higher";
};

// TECHNICAL ANALYSIS
const technicalAnalysis = async (
    tokenProvider: TokenProvider
): Promise<string> => {
    const formattedReport = await tokenProvider.getFormattedTokenReport();
    return formattedReport;
};

export const scoreToken: Action = {
    name: "SCORE_TOKEN",
    similes: [
        "SCORE_TOKEN",
        "TOKEN_SCORE",
        "RATE_TOKEN",
        "ANALYZE_TOKEN",
        "TOKEN_ANALYSIS",
    ],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        // Check if the necessary parameters are provided in the message
        console.log("Message:", message);
        return true;
    },
    description: "Analyze a token.",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<TokenScore> => {
        // composeState
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        const messageContext = composeContext({
            state,
            template: messageTemplate,
        });

        console.log(messageContext)

        const response = await generateObject({
            runtime,
            context: messageContext,
            modelClass: ModelClass.LARGE,
        });

        console.log("Response:", response);
        const { ticker, inputTokenAddress, chain } = response;

        const [socialResult, technicalResult] = await Promise.all([
            ticker
                ? socialAnalysis(runtime, ticker)
                : Promise.resolve("No ticker - skipping social analysis"),
            inputTokenAddress && chain
                ? (async () => {
                      const tokenProvider = new TokenProvider(
                          inputTokenAddress,
                          chain
                      );
                      return technicalAnalysis(tokenProvider);
                  })()
                : Promise.resolve(
                      "No chain or token address - skipping technical analysis"
                  ),
        ]);

        // prompt LLM to read the results and return a TokenScore
        const ratingResponse = await generateObject({
            runtime,
            context: ratingTemplate
                .replace("{{socialResult}}", socialResult)
                .replace("{{technicalResult}}", technicalResult),
            modelClass: ModelClass.LARGE,
        });
        let score: TokenScore = ratingResponse.rating;

        return score;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    address: "0x474f4cb764df9da079D94052fED39625c147C12C",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Analyzing token 0x474f4cb764df9da079D94052fED39625c147C12C on Base",
                    action: "SCORE_TOKEN",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Analysis complete! I rate this token ...",
                },
            },
        ],
        // Add more examples as needed
    ] as ActionExample[][],
} as Action;
