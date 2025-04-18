import { parseEther } from "viem";
import z from "zod";

interface InitInputData {
    isDirectPromotion: boolean;
    sharedRewardPercent: number;
    recipient: string;
    rewardsPoolId: number;
    token: string;
}

interface ActData {
    tokenIn: string;
    amountIn: string;
}

interface TxData {
    path: string;
    deadline: number;
    amountIn: bigint;
    amountOutMin: bigint;
    clientAddress: string;
}

// TODO: template for reward swap open action
const rewardSwap = {
    clientMetadata: {
        displayName: "Reward Swap",
        description:
            "Reward swap is an action that allows you to create incentivized swaps from a post.",
        image: "https://link.storjshare.io/raw/jv56xv4fctvo3ovgx5sotml3furq/bonsai/reward-swap.jpg",
        initData: {
            // TODO: how do users pick a reward pool? they need to be able to pick from a list of pools
            form: z.object({
                isDirectPromotion: z
                    .boolean()
                    .describe(
                        "Indicate if this promotion is direct (no incentive pool) or not"
                    ),
                sharedRewardPercent: z
                    .number()
                    .describe(
                        "The percent of their reward the poster shares with swapper"
                    ),
                recipient: z
                    .number()
                    .describe("The address of the recipient of the reward"),
                rewardsPoolId: z
                    .number()
                    .describe(
                        "The id of the rewards pool if not a direct promotion"
                    ),
                token: z
                    .number()
                    .describe(
                        "The token address to promote if direct promotion"
                    ),
            }),
            handler: async (
                address: string, // address of the actor
                profileId: string, // profile id of the actor
                data: InitInputData // data from the form
            ): Promise<InitInputData> => {
                console.log(data);

                // TODO: validate data
                return {
                    isDirectPromotion: data.isDirectPromotion,
                    sharedRewardPercent: data.sharedRewardPercent,
                    recipient: data.recipient,
                    rewardsPoolId: data.rewardsPoolId,
                    token: data.token,
                };
            },
        },
        actData: {
            form: z.object({
                tokenIn: z.string().describe("The token address to spend"),
                amountIn: z
                    .number()
                    .describe("The amount of the token to spend"),
            }),
            handler: async (
                address: string, // address of the actor
                profileId: string, // profile id of the actor
                data: ActData // data from the form
            ): Promise<TxData> => {
                console.log(data);

                // TODO: compute path and params
                return {
                    path: "",
                    deadline: 20 * 60, // 20 minutes
                    amountIn: parseEther(data.amountIn),
                    amountOutMin: 0n,
                    clientAddress: "",
                };
            },
        },
    },
};

export default rewardSwap;

