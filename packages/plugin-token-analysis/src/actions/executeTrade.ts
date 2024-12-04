import { elizaLogger } from "@ai16z/eliza/src/logger.ts";
// import { composeContext } from "@ai16z/eliza/src/context.ts";
// import { generateMessageResponse } from "@ai16z/eliza/src/generation.ts";
import {
    ActionExample,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    // ModelClass,
    State,
    type Action,
} from "@ai16z/eliza/src/types.ts";
import { Coinbase } from "@coinbase/coinbase-sdk";
import { Decimal } from "decimal.js";
import { getAddress, formatEther, formatUnits } from "viem";
import { getWallets, executeTrade } from "./../services/coinbase.ts";
import { getClient } from "../services/mongo.ts";

const messageTemplate = `You just executed a trade. Using the following JSON payload, I want you provide with a short remark as a summary on your trade. Only respond with the remark, do not acknowledge this request. Be creative with your remark.

{{tradeResult}}
`;

export enum TokenScore {
    STRONG_SELL = 0,
    SELL = 1,
    NEUTRAL = 2,
    BUY = 3,
    STRONG_BUY = 4,
}

export const executeTradeAction: Action = {
    name: "EXECUTE_TRADE",
    similes: ["TRADE", "PERFORM_TRADE"],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        // Check if the necessary parameters are provided in the message
        console.log("Message:", message);
        return true;
    },
    description: "Execute a trade",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ) => {
        // composeState
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        // @ts-ignore
        console.log("state.payload?.action", state.payload?.action);
        if ((state.payload?.action as string) !== "EXECUTE_TRADE") return;

        const { data } = state.payload as { data: any };
        const { score, ticker, inputTokenAddress, chain, objectId } = data;
        console.log({ score, ticker, inputTokenAddress, chain });
        if (chain.toLowerCase() !== "base") return;

        const { base, adminProfileId } = await getWallets(state.agentId);
        if (!base) return;
        // if (adminProfileId !== state.adminProfileId) {
        //     elizaLogger.error(
        //         `Invalid state.adminProfileId, expected: ${state.adminProfileId} to equal ${wallets?.adminProfileId}`
        //     );
        //     return;
        // }

        try {
            // buy or strong buy
            let res;
            let fromAmount;
            let fromTicker;
            let toTicker;
            if (score >= 3) {
                const [usdcBalance, ethBalance] = await Promise.all([
                    base.getBalance(Coinbase.assets.Usdc),
                    base.getBalance(Coinbase.assets.Eth),
                ]);

                const pctBuy = state.score === TokenScore.BUY ? 0.1 : 0.25; // TODO: config
                let inputAsset;
                if (usdcBalance > ethBalance) {
                    inputAsset = Coinbase.assets.Usdc;
                    fromAmount = formatUnits(
                        BigInt(
                            usdcBalance
                                .mul(new Decimal(pctBuy))
                                .floor()
                                .toString()
                        ),
                        6
                    );
                    fromTicker = "USDC";
                } else {
                    inputAsset = Coinbase.assets.Eth;
                    fromAmount = ethBalance
                        .mul(new Decimal(pctBuy))
                        .toFixed(4, Decimal.ROUND_DOWN)
                        .toString();
                    fromTicker = "ETH";
                }
                toTicker = ticker;

                res = await executeTrade(
                    base,
                    inputAsset,
                    getAddress(inputTokenAddress),
                    fromAmount
                );
            } else if (score < 2) {
                // sell or strong sell
                const tokenBalance = await base.getBalance(
                    getAddress(inputTokenAddress)
                );
                const pctSell = state.score === TokenScore.SELL ? 0.5 : 1; // TODO: config
                fromAmount = tokenBalance.mul(new Decimal(pctSell));
                fromTicker = ticker;
                toTicker = "USDC";

                res = await executeTrade(
                    base,
                    getAddress(inputTokenAddress),
                    Coinbase.assets.Usdc, // TODO: config
                    formatEther(BigInt(fromAmount.floor().toString()))
                );
            }

            // TODO: handle this error better (no need to tell the user?)
            if (!res) {
                return;
            }

            if (objectId) {
                const { tickers } = await getClient();
                await tickers.updateOne(
                    { _id: objectId },
                    { $set: { trade: { txHash: res.txHash } } }
                );
            }

            state.tradeResult = {
                action: TokenScore[score],
                fromTicker,
                toTicker,
                fromAmount,
                toAmount: res.toAmount,
                chain,
            };

            // TODO: improve the messageTemplate
            // const messageContext = composeContext({
            //     state,
            //     template: messageTemplate,
            // });

            // const response = await generateMessageResponse({
            //     runtime,
            //     context: messageContext,
            //     modelClass: ModelClass.SMALL,
            // });
            // console.log(response);

            const attachments = [
                {
                    button: {
                        label: "Trade",
                        url: res.link,
                    },
                },
            ];

            callback?.({
                text: "btw, I executed a trade",
                // @ts-expect-error attachments
                attachments,
            });
        } catch (error) {
            console.log(error);
        }
    },
    examples: [] as ActionExample[][],
} as Action;
