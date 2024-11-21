import { composeContext } from "@ai16z/eliza/src/context.ts";
import { generateObject } from "@ai16z/eliza/src/generation.ts";
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
import { ClientBase } from "@ai16z/client-twitter/src/base.ts";
import { getClient } from "../services/mongo.ts";

const messageTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "ticker": "$BONSAI"
    "inputTokenAddress": "0x474f4cb764df9da079D94052fED39625c147C12C",
    "chain": "base"
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

// TODO: update judgement instructions
const ratingTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "rating": TokenScore.STRONG_BUY,
    "reason": "This token is a strong buy because..."
}
\`\`\`

Social Report
{{socialResult}}

Technical Report
{{technicalResult}}

You are an expert crypto and memecoin trader. You know how to combine charting skills with sentiment analysis to determine if a coin is under or over valued.

Given the social and technical reports assign the token a TokenScore rating. Note that there may be missing data for certain metrics since this reporting is still in development. Disregard this and make your analysis solely on the data present.
For the technical report the most important things are signs of momentum in increasing price, higher highs higher lows, increasing volume, that kind of thing.
For the social data an active community is one of the most important signals.

Beyond these things interpret the data as you see fit.

Token Score is an enum defined as:
enum TokenScore {
    STRONG_SELL,
    SELL,
    NEUTRAL,
    BUY,
    STRONG_BUY,
}

Include your reasoning also. Respond with a JSON markdown block containing only the extracted values. The result should be a valid JSON object with the following schema:
\`\`\`json
{
    "rating": TokenScore,
    "reason": string
}
\`\`\`
`;

// scoreToken should took CA, not symbol. return TokenScore enum

export enum TokenScore {
    STRONG_SELL = 0,
    SELL = 1,
    NEUTRAL = 2,
    BUY = 3,
    STRONG_BUY = 4,
}

// SOCIAL ANALYSIS
const socialAnalysis = async (
    runtime: IAgentRuntime,
    ticker: string
): Promise<string> => {
    const client = new ClientBase({ runtime }, true);
    const { tweets } = await client.searchWithDelay(`$${ticker}`);
    let report = `Social Analysis Report for ${ticker}\n\n`;

    for (const tweet of tweets) {
        // Skip retweets to avoid duplicate content
        if (tweet.isRetweet) continue;

        const engagement = {
            likes: tweet.likes || 0,
            retweets: tweet.retweets || 0,
            replies: tweet.replies || 0,
            views: tweet.views || 0,
        };

        const timestamp = tweet.timeParsed
            ? new Date(tweet.timeParsed).toISOString()
            : "Unknown time";

        report += `---\nTweet: ${tweet.text}\n`;
        report += `Author: @${tweet.username}\n`;
        report += `Time: ${timestamp}\n`;
        report += `Engagement: ${engagement.likes} likes, ${engagement.retweets} RTs, ${engagement.replies} replies, ${engagement.views} views\n`;
    }

    return tweets?.length > 0 ? report : "No relevant tweets found";
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
    ): Promise<{ score: TokenScore; scoreString: string; reason: string }> => {
        // composeState
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        let response;
        // @ts-ignore
        if (state.payload && state.payload.action === "SCORE_TOKEN") {
            const { data } = state.payload as { data: any };
            response = data;
        } else {
            const messageContext = composeContext({
                state,
                template: messageTemplate,
            });

            response = await generateObject({
                runtime,
                context: messageContext,
                modelClass: ModelClass.LARGE,
            });
        }

        console.log("response:", response);

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
        const context = ratingTemplate
            .replace("{{socialResult}}", socialResult)
            .replace("{{technicalResult}}", technicalResult);
        const ratingResponse = await generateObject({
            runtime,
            context,
            modelClass: ModelClass.LARGE,
        });
        console.log("ratingResponse", ratingResponse);

        const scoreString = ratingResponse.rating.replace(
            "TokenScore.",
            ""
        ) as keyof typeof TokenScore;
        const score = TokenScore[scoreString] as number;

        // score non-neutral to the db, using ticker as the uniq id
        if (score != 2) {
            const { tickers } = await getClient();
            try {
                await tickers.insertOne({
                    ticker,
                    inputTokenAddress,
                    chain,
                    score,
                    userId: message.userId,
                    createdAt: Math.floor(Date.now() / 1000),
                });
            } catch (error) {
                console.log(error);
            }
        }

        callback({
            text: ratingResponse.reason,
            attachments: [],
        });

        return { score, scoreString, reason: ratingResponse.reason };
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
