import {
    type Action,
    composeContext,
    generateObjectDeprecated,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    ModelClass,
    type State,
} from "@elizaos/core";
import { getTokenAnalytics } from "../helpers/utils";
import {
    formatActiveTokenAnalytics,
    getDailyStatsAnalytics,
    getHoldersAnalytics,
    getLiquidityAnalytics,
    getNewestTokensAnalytics,
    getTopGainersAnalytics,
    getTrendingAnalytics,
    getVolumeAnalytics,
} from "../helpers/actionHelpers";
import { z } from "zod";

const ACTION = "LAUNCHPAD_ANALYTICS";

const analyticsMessageTemplate = `Respond with a JSON markdown block containing only the extracted operation. Use null if no valid operation can be determined.

Available operations:
- tokenMatch: When asking about a specific token (e.g. "How's $BONSAI doing?")
- topGainers: When asking about best performing or top gaining tokens
- liquidity: When asking about token liquidity
- holders: When asking about token holders or community size
- dailyStats: When asking about today's or 24h activity
- volume: When asking about trading volume
- trending: When asking about trending or popular tokens
- newest: When asking about newest or latest tokens

User Message:
{{userMessage}}

Given the above user message, determine which operation they are requesting. If they mention a specific token with $ symbol, use tokenMatch and include the symbol.

Respond with a JSON markdown block containing only the operation and symbol if applicable. The result should be a valid JSON object with the following schema:
\`\`\`json
{
    "operation": "tokenMatch" | "topGainers" | "liquidity" | "holders" | "dailyStats" | "volume" | "trending" | "newest"
    "symbol": string | null
}
\`\`\`

Respond with a single JSON object ONLY, EXACTLY as shown and the first key MUST BE "operation" with one of those listed values ("tokenMatch", "topGainers", etc.).
`;

export const launchpadAnalyticsAction = {
    name: ACTION,
    similes: [
        "LAUNCHPAD_STATS",
        "LAUNCHPAD_VOLUME",
        "LAUNCHPAD_TRENDING",
        "LAUNCHPAD_DATA",
        "LAUNCHPAD_TOKENS",
        "LAUNCHPAD_INFO",
        "LAUNCHPAD_TODAY",
        "LAUNCHPAD_ACTIVITY",
    ],
    description: "Get analytics about the Bonsai Launchpad activity",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        return true;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: State,
        options?: any,
        callback?: HandlerCallback
    ) => {
        const messageContext = composeContext({
            state,
            template: analyticsMessageTemplate.replace("{{userMessage}}", message.content.text),
        });

        const response = await generateObjectDeprecated({
            runtime,
            context: messageContext,
            modelClass: ModelClass.LARGE,
        });

        const { operation, symbol } = response;

        let result = "";

        switch (operation) {
            case "tokenMatch": {
                if (!symbol) break;

                const analytics = await getTokenAnalytics(symbol);

                if (!analytics) {
                    result = `Could not find token ${symbol} on the launchpad.`;
                } else if (analytics.complete) {
                    result = `Token has graduated from to a Uni v4 pool! \n\n The CA is: ${analytics.tokenAddress}`;
                } else {
                    result = formatActiveTokenAnalytics(analytics);
                }
                break;
            }

            case "topGainers":
                result = await getTopGainersAnalytics();
                break;

            case "liquidity":
                result = await getLiquidityAnalytics();
                break;

            case "holders":
                result = await getHoldersAnalytics();
                break;

            case "dailyStats":
                result = await getDailyStatsAnalytics();
                break;

            case "volume":
                result = await getVolumeAnalytics();
                break;

            case "trending":
                result = await getTrendingAnalytics();
                break;

            case "newest":
                result = await getNewestTokensAnalytics();
                break;

            default:
                result =
                    "I couldn't understand what launchpad analytics you're looking for. You can ask about specific tokens, top gainers, liquidity, holders, daily stats, volume, trending tokens, or newest tokens.";
        }

        await callback?.({
            text: result,
        });

        return result;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What launchpad stuff can I ask you about?",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "I can tell you about a ticker, top gainers, liquidity, volume, holders, today, trending and newest tokens.",
                    action: "NONE",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "How's $CAPO doing on the launchpad?",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here are the latest stats for $CAPO.",
                    action: ACTION,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What are the top gainers on the launchpad?",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here are the top performing tokens in the last 24h.",
                    action: ACTION,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "How much liquidity is there on the launchpad?",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here's the latest liquidity statistics on top launchpad tokens.",
                    action: ACTION,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Which launchpad tokens have the most holders?",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here's a summary of the tokens with the top holders on the launchpad.",
                    action: ACTION,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Which launchpad tokens have the biggest community?",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here's a summary of the tokens with the biggest communities on the launchpad.",
                    action: ACTION,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Show me today's launchpad activity",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here's a summary of the last 24 hours on the launchpad.",
                    action: ACTION,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "How's the launchpad today?",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here's a summary of the last 24 hours on the launchpad.",
                    action: ACTION,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "How much volume has there been on the launchpad?",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here's the latest trading volume statistics.",
                    action: ACTION,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What are the trending tokens right now on the launchpad?",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here are the top trending tokens by volume.",
                    action: ACTION,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "How are the launchpad tokens?",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here are the top trending tokens by volume.",
                    action: ACTION,
                },
            },
        ],
    ],
} as Action;
