import { elizaLogger } from "@ai16z/eliza/src/logger.ts";
import { composeContext } from "@ai16z/eliza/src/context.ts";
import { generateText, trimTokens } from "@ai16z/eliza/src/generation.ts";
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
    NETWORK_ID_TO_NAME,
    NETWORK_NAME_TO_EXPLORER_URL,
    DEXSCREENER_URL,
} from "../services/codex.ts";

export const tokenSummaryTemplate = `# Structured token information
{{tokenInfo}}

# Instructions: Provide an analysis of the information to provide insight. No need to format information, keep it under 450 characters, and use 4 decimals of precision for floats, and for larger numbers round to integer and use k, mil, or bil formatting. Just return the analysis, and do not share any links. Do not acknowledge this request, just provide the analysis without labeling.`;

const ACTION = "FIND_TOKEN";
const searchTokenAction = {
    name: ACTION,
    similes: [
        "FIND_TICKER",
        "FIND_COIN",
        "THINK_TICKER",
        "THINK_COIN",
        "TELL_TOKEN",
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

        if (!ticker) return;

        try {
            const tokens = await searchTokens(ticker, contractAddress);

            // respond with some info about it and 'tool' button to view it on the explorer
            let text;
            let attachments;
            if (tokens.length === 1) {
                const token = tokens[0];
                token.token.networkName =
                    NETWORK_ID_TO_NAME[token.token.networkId];
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
                            label: `Rate $${token.token.symbol}`,
                            text: `Rate/Score $${token.token.symbol} on ${token.token.networkName} (CA: ${token.token.address})`,
                            payload: {
                                action: "SCORE_TOKEN",
                                data: {
                                    inputTokenAddress: token.token.address,
                                    chain: token.token.networkName.toLowerCase(),
                                    ticker: token.token.symbol,
                                    imageURL: token.token.info.imageSmallUrl,
                                },
                            },
                        },
                    },
                    {
                        button: {
                            label: `${token.token.name} ($${token.token.symbol})`,
                            url: `${DEXSCREENER_URL}/${token.token.networkName.toLowerCase()}/${token.token.address}`,
                        },
                    },
                    {
                        button: {
                            label: `${token.token.name} ($${token.token.symbol})`,
                            url: `${NETWORK_NAME_TO_EXPLORER_URL[token.token.networkName.toLowerCase()]}/token/${token.token.address}`,
                        },
                    },
                ];
            } else if (tokens.length > 1) {
                // respond with all 'tool buttons' and ask user to confirm one ({ name, symbol, address })
                console.log(
                    "FOUND SEVERAL TOKENS",
                    JSON.stringify(tokens, null, 2)
                );
                text = `Found ${tokens.length} tokens, can you clarify which one you meant, maybe with a contract address?`;
                attachments = tokens.map(({ token }) => ({
                    button: {
                        label: `${token.name} ($${token.symbol})`,
                        text: `Find the token with ticker ${token.symbol} and contract address ${token.address} on chain ${NETWORK_ID_TO_NAME[token.networkId]}`
                    },
                }));
            } else {
                // TODO: make this as catch all for search or score
                text = `Found 0 tokens, are you sure you have the right ticker? If it has a low liquidity or is not on Base, Solana, or Ethereum - I won't know about it.`;
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
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Tell me about $BONSAI",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here's an overview of $BONSAI.",
                    action: ACTION,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Tell me about the token $BONSAI",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here's an overview of $BONSAI.",
                    action: ACTION,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Tell me about the coin $BONSAI",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here's an overview of $BONSAI.",
                    action: ACTION,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What do you think about the token $BONSAI",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here's what I think of $BONSAI.",
                    action: ACTION,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Find out about the token $BONSAI",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here's what I found on $BONSAI.",
                    action: ACTION,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Is $BONSAI a good token?",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here's my analysis of $BONSAI.",
                    action: ACTION,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What do you think about $BONSAI?",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here's what I think about $BONSAI.",
                    action: ACTION,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Should I buy $BONSAI?",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here's my take on $BONSAI as an investment.",
                    action: ACTION,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Give me an analysis of $BONSAI.",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here's a detailed analysis of $BONSAI.",
                    action: ACTION,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What are the risks with $BONSAI?",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here are the risks associated with $BONSAI.",
                    action: ACTION,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Look up $BONSAI.",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here's $BONSAI.",
                    action: ACTION,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Is $BONSAI undervalued?",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here's my assessment of whether $BONSAI is undervalued.",
                    action: ACTION,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What are analysts saying about $BONSAI?",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here's what analysts are saying about $BONSAI.",
                    action: ACTION,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Does $BONSAI have potential?",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here's my take on the potential of $BONSAI.",
                    action: ACTION,
                },
            },
        ],
    ],
} as Action;

export default searchTokenAction;
