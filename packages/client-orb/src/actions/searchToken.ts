import { elizaLogger } from "@ai16z/eliza/src/logger.ts";
import { composeContext } from "@ai16z/eliza/src/context.ts";
import { generateText, trimTokens } from "@ai16z/eliza/src/generation.ts";
import models from "@ai16z/eliza/src/models.ts";
import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
    ModelClass,
} from "@ai16z/eliza/src/types.ts";
import {
    searchTokens,
    DEFAULT_NETWORK_EXPLORER_URL,
    TOKEN_ID_TO_NAME,
} from "../services/codex.ts";

export const tokenSummaryTemplate = `# Structured token information
{{tokenInfo}}

# Instructions: Provide an analysis of the information to provide insight. No need to format information, keep it under 450 characters, and use 4 decimals of precision for floats, and for larger numbers round to integer and use k, mil, or bil formatting. Just return the analysis. Do not acknowledge this request, just provide the analysis without labeling.`;

const ACTION = "THINK_TOKEN";
const searchTokenAction = {
    name: ACTION,
    similes: [
        "THINK_TICKER",
        "THINK_COIN",
        "FIND_TICKER",
        "FIND_TOKEN",
        "FIND_COIN",
    ],
    description:
        "Find the token given a ticker or name in the prompt. Require confirmation from user on multiple tokens",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        return !!process.env.CODEX_API_KEY;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback: HandlerCallback
    ) => {
        elizaLogger.log("Composing state for message:", message);
        state = (await runtime.composeState(message)) as State;
        const userId = runtime.agentId;
        elizaLogger.log("User ID:", userId);

        const ticker = message.content.text.match(/\$([A-Za-z]+)/)?.[1];
        const contractAddress =
            message.content.text.match(/0x[a-fA-F0-9]{40}/)?.[0];
        console.log(`the ticker is $${ticker}`);
        console.log(`the contract address is ${contractAddress}`);

        try {
            const tokens = await searchTokens(ticker, contractAddress);

            // respond with some info about it and 'tool' button to view it on the explorer
            let text;
            let attachments;
            if (tokens.length === 1) {
                const token = tokens[0];
                token.token.networkName = TOKEN_ID_TO_NAME[token.token.networkId];
                state.tokenInfo = JSON.stringify(token);
                const context = composeContext({
                    state,
                    // make sure it fits, we can pad the tokens a bit
                    template: trimTokens(
                        tokenSummaryTemplate,
                        100000,
                        "gpt-4o-mini" // TODO: make this dynamic and generic
                    ),
                });

                text = await generateText({
                    runtime,
                    context,
                    modelClass: ModelClass.SMALL,
                });
                attachments = [
                    {
                        button: {
                            label: "Social sentiment (X)",
                            payload: {
                                action: "CHECK_SOCIAL_SENTIMENT",
                                address: token.token.address,
                                networkId: token.token.networkId,
                                symbol: token.token.symbol,
                            },
                        },
                    },
                    {
                        button: {
                            label: "Technical Analysis",
                            payload: {
                                action: "GET_TECHNICAL_ANALYSIS",
                                address: token.token.address,
                                networkId: token.token.networkId,
                                symbol: token.token.symbol,
                            },
                        },
                    },
                    {
                        button: {
                            label: `${token.token.name} ($${token.token.symbol})`,
                            url: `${DEFAULT_NETWORK_EXPLORER_URL}/token/${token.token.address}`,
                        },
                    },
                ];
            } else {
                // respond with all 'tool buttons' and ask user to confirm one ({ name, symbol, address })
                console.log(
                    "FOUND SEVERAL TOKENS",
                    JSON.stringify(tokens, null, 2)
                );
                text = `Found ${tokens.length} tokens, can you clarify which one you meant?`;
                attachments = tokens.map(({ token }) => ({
                    button: {
                        label: `${token.name} ($${token.symbol})`,
                        payload: {
                            action: ACTION,
                            address: token.address,
                            networkId: token.networkId,
                            symbol: token.symbol,
                        },
                    },
                }));
            }

            callback({
                text,
                attachments,
            });
        } catch (error) {
            elizaLogger.error("Failed to search token");
            console.log(error);
        }
    },
    examples: [
        // TODO: We want to generate posts in more abstract ways, not just when asked to generate a post

        [
            {
                user: "{{user1}}",
                content: {
                    text: "What do you think about this token",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "You mean this token?",
                    action: ACTION,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Tell me more about the token",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "The token",
                    action: ACTION,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Should I buy this token",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here's what I think about the token",
                    action: ACTION,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What do you think about the coin",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "You mean this token?",
                    action: ACTION,
                },
            },
        ],
    ],
} as Action;

export default searchTokenAction;
