import { composeContext } from "@ai16z/eliza/src/context.ts";
import { generateMessageResponse } from "@ai16z/eliza/src/generation.ts";
import {
    ActionExample,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    type Action,
} from "@ai16z/eliza/src/types.ts";
import { Coinbase } from "@coinbase/coinbase-sdk";
import { Decimal } from "decimal.js";
// TODO: install coinbase
import { getWallets, executeTrade } from "./../services/coinbase.ts";

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
        if ((state.payload?.action as string) !== "EXECUTE_TRADE") return;

        const { data } = state.payload as { data: any };
        const { score, ticker, inputTokenAddress, chain } = data;
        if (chain.toLowerCase() !== "base") return;

        const { base } = await getWallets(state.agentId);
        if (!base) return;

        // buy or strong buy
        let res;
        let fromAmount;
        let fromTicker;
        let toTicker;
        if ((state.score as number) >= 3) {
            const [usdcBalance, ethBalance] = await Promise.all([
                base.getBalance(Coinbase.assets.Usdc),
                base.getBalance(Coinbase.assets.Eth),
            ]);

            const pctBuy = state.score === TokenScore.BUY ? 0.1 : 0.25; // TODO: config
            let inputAsset;
            if (usdcBalance > ethBalance) {
                inputAsset = Coinbase.assets.Usdc;
                fromAmount = usdcBalance.mul(new Decimal(pctBuy));
                fromTicker = "USDC";
            } else {
                inputAsset = Coinbase.assets.Eth;
                fromAmount = ethBalance.mul(new Decimal(pctBuy));
                fromTicker = "ETH";
            }
            toTicker = ticker;

            res = await executeTrade(
                base,
                inputAsset,
                inputTokenAddress,
                fromAmount
            );
        } else if (score < 2) {
            // sell or strong sell
            const tokenBalance = await base.getBalance(inputTokenAddress);
            const pctSell = state.score === TokenScore.SELL ? 0.5 : 1; // TODO: config
            fromAmount = tokenBalance.mul(new Decimal(pctSell));
            fromTicker = ticker;
            toTicker = "USDC";

            res = await executeTrade(
                base,
                inputTokenAddress,
                Coinbase.assets.Usdc, // TODO: config
                fromAmount
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

        const messageContext = composeContext({
            state,
            template: messageTemplate,
        });

        const response = await generateMessageResponse({
            runtime,
            context: messageContext,
            modelClass: ModelClass.SMALL,
        });

        const attachments = {
            button: {
                label: "Trade",
                url: res.link,
            },
        };

        callback?.({
            text: response.text,
            // @ts-expect-error attachments
            attachments,
        });
    },
    examples: [] as ActionExample[][],
} as Action;
