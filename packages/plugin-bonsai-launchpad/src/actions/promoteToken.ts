import {
    type ActionExample,
    composeContext,
    generateText,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    type State,
    type Action,
} from "@elizaos/core";
import { erc20Abi } from "viem";
import { ModelClass } from "@elizaos/core";
import { getTokenAnalytics } from "../helpers/utils";
import { getEventFromReceipt } from "../utils/viem";
import { publicClient } from "../helpers/contract";

const messageHandlerTemplate = `Provide some commentary to this token analytics report, something that provides extra value in the form of insight, entertainment, or something witty about the token. Do not provide more than two stats from the report.

Given the token analytics report: {{analytics}}

Generate a 1-3 sentence commentary (no more than 280 characters), and mention the symbol with $ in front in your response at least once. Speak of the token as if it were a movement, a cult, or a community, not a singular entity.

If the token age is 0, or there's no/low marketcap, then phrase the commentary without these stats, and phrase it as a new launch, with potential.`;

interface VerifyTransferParams {
    hash: `0x${string}`;
    chainId: number;
    amount: string;
    to: `0x${string}`;
    token: `0x${string}`;
}

const _verifyTransfer = async (
    data: VerifyTransferParams,
    from: `0x${string}`
): Promise<boolean> => {
    const client = publicClient();
    const transactionReceipt = await client.waitForTransactionReceipt({
        hash: data.hash,
    });
    const transferEvent = getEventFromReceipt({
        contractAddress: data.token,
        transactionReceipt,
        abi: erc20Abi,
        eventName: "Transfer",
    });

    console.log(transferEvent);
    // TODO: check time is within -5min
    return (
        transferEvent.args.to === data.to &&
        transferEvent.args.from === from &&
        transferEvent.args.value === BigInt(data.amount)
    );
};

interface StatePayloadPromoteToken {
    verifyTransfer: VerifyTransferParams;
    userId: `0x${string}`;
}

export const promoteTokenAction: Action = {
    name: "PROMOTE_LAUNCHPAD_TOKEN",
    similes: ["SHILL_LAUNCHPAD_TOKEN"],
    validate: async (runtime: IAgentRuntime, _: Memory) => {
        const enabledTwitter =
            !!runtime.getSetting("TWITTER_USERNAME") && !!runtime.getSetting("TWITTER_PASSWORD");
        const enabledFarcaster =
            !!runtime.getSetting("FARCASTER_NEYNAR_SIGNER_UUID") &&
            !!runtime.getSetting("FARCASTER_NEYNAR_API_KEY") &&
            !!runtime.getSetting("FARCASTER_FID");
        const enabledLens =
            !!runtime.getSetting("EVM_PRIVATE_KEY") && !!runtime.getSetting("LENS_PROFILE_ID");

        return enabledTwitter || enabledFarcaster || enabledLens;
    },
    description: "Creates social posts to promote a token from the Bonsai Launchpad",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<{}> => {
        // state.payload must be set in the calling client
        const { verifyTransfer, userId } = state.payload as StatePayloadPromoteToken;
        const symbolMatch = message.content.text.match(/\$(\w+)/);
        const symbol = symbolMatch ? symbolMatch[0] : null;

        if (!symbol) {
            callback?.({
                text: "Failed to find token, try again later",
                attachments: [],
            });
            return;
        }
        console.log(`parsed symbol: ${symbol}`);

        // verify payment
        if (!(verifyTransfer && userId)) {
            callback?.({
                text: "Missing required verifyTransfer object or userId string in state.payload",
                attachments: [],
            });
            return;
        }
        if (!(await _verifyTransfer(verifyTransfer, userId))) {
            callback?.({
                text: "Failed to verify transfer tx",
                attachments: [],
            });
            return;
        }

        const analytics = await getTokenAnalytics(symbol);
        const link = `https://launch.bonsai.meme/token/${analytics.clubId}`;

        state.analytics = JSON.stringify(analytics);

        const context = composeContext({
            state,
            template: messageHandlerTemplate,
        });

        // generate some commentary
        const response = await generateText({
            runtime: runtime,
            context,
            modelClass: ModelClass.MEDIUM,
        });

        const attachments = [];

        // post to x, lens, farcaster
        if (!!runtime.getSetting("TWITTER_USERNAME") && !!runtime.getSetting("TWITTER_PASSWORD")) {
            const client = runtime.clients.twitter?.client?.twitterClient;
            const content = `${response}
Link below 👇`;

            const standardTweetResult = await client.sendTweet(content);
            const body = await standardTweetResult.json();
            console.log(body);
            const tweetId = body.data.create_tweet?.tweet_results?.result?.rest_id;
            if (tweetId) {
                await client.sendTweet(link, tweetId);
                attachments.push({
                    button: {
                        url: `https://x.com/${client.profile.username}/status/${tweetId}`,
                    },
                });
            }
        }

        if (!!runtime.getSetting("EVM_PRIVATE_KEY") && !!runtime.getSetting("LENS_PROFILE_ID")) {
            const lensClient = runtime.clients.lens;
            const content = `${response}
        ${link}`;
            const { id: publicationId } = await lensClient.posts.sendPublication({ content });

            attachments.push({
                button: {
                    url: `https://orb.club/p/${publicationId}`,
                },
            });
        }

        if (
            !!runtime.getSetting("FARCASTER_NEYNAR_SIGNER_UUID") &&
            !!runtime.getSetting("FARCASTER_NEYNAR_API_KEY") &&
            !!runtime.getSetting("FARCASTER_FID")
        ) {
            const farcasterClient = runtime.clients.farcaster;
            const fid = Number(runtime.getSetting("FARCASTER_FID")!);
            const farcasterProfile = await farcasterClient.client.getProfile(fid);
            const content = response;
            const { hash: castHash } = await farcasterClient.posts.sendCast({
                content,
                profile: farcasterProfile,
                embeds: [
                    {
                        url: link,
                    },
                ],
            });

            attachments.push({
                button: {
                    url: `https://warpcast.com/${farcasterProfile.username}/${castHash.slice(0, 10)}`,
                },
            });
        }

        callback?.({
            text: response,
            attachments,
            action: "NONE",
        });

        return {};
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Promote my launchpad token, the ticker is $",
                },
            },
            {
                user: "Sage",
                content: {
                    text: "Creating posts to promote your memecoin",
                    action: "PROMOTE_LAUNCHPAD_TOKEN",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Promote my memecoin on the launchpad. The ticker is $",
                },
            },
            {
                user: "Sage",
                content: {
                    text: "Promoting your memecoin on socials",
                    action: "PROMOTE_LAUNCHPAD_TOKEN",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Shill my memecoin $",
                },
            },
            {
                user: "Sage",
                content: {
                    text: "Shilling your memecoin on socials",
                    action: "PROMOTE_LAUNCHPAD_TOKEN",
                },
            },
        ],
    ] as ActionExample[][],
} as Action;
