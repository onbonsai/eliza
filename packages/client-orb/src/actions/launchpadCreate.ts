// DEPRECATED BUT KEEPING FOR REFERENCE

import {
    composeContext,
    generateObject,
    ActionExample,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
    type Action,
    ModelClass,
    generateObjectDeprecated,
    generateImage,
} from "@elizaos/core";
import { z } from "zod";
import { parseEther, parseUnits } from "viem";
import { getClient } from "../services/mongo.ts";
import { getWallets } from "../services/coinbase.ts";
import {
    IS_PRODUCTION,
    DECIMALS,
    BONSAI_TOKEN_ADDRESS_BASE,
    searchToken,
    createToken,
    getTokenBalance,
} from "@elizaos/plugin-bonsai";
import { createClub } from "../services/launchpad/database.ts";
import { getLensImageURL } from "../services/lens/ipfs.ts";
import { getProfileById } from "../services/lens/profiles.ts";
import createPost from "../services/orb/createPost.ts";
import { AGENT_HANDLE } from "../utils/constants.ts";
import {
    tweetIntentTokenReferral,
    orbIntentTokenReferral,
    castIntentTokenReferral,
} from "../utils/utils.ts";
import { parseAndUploadBase64Image } from "../utils/ipfs.ts";

export const TokenInfoSchema = z.object({
    symbol: z.string().nullable().describe("Symbol"),
    name: z.string().nullable().describe("Name"),
    description: z.string().nullable().describe("Description"),
});

// Updated to allow either a single object or an array of objects
export const OptionalArrayTokenInfoSchema = z
    .union([TokenInfoSchema.nullable(), z.array(TokenInfoSchema.nullable())])
    .describe("Either a single info or an array of info");

const DEFAULT_INITIAL_SUPPLY = !IS_PRODUCTION ? "1" : "15"; // buy price at ~200 usdc

const messageTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "symbol": "$blonde"
    "name": "Blonde",
    "description": "for blondes"
}
\`\`\`

{{recentMessages}}

Given the user message extract the following information about the token to create
- The symbol
- The name
- The description

ONLY GET THE MOST RECENT TOKEN INFO FROM THE USER MESSAGE

Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined. The result should be a valid JSON object with the following schema:
\`\`\`json
{
    "symbol": string | null,
    "name": string | null,
    "description": string | null
}
\`\`\`

The symbol will be several characters with a dollar sign in front such as $Degen, $BONSAI, $eth, $SOL, $BTC, $MOG, $wif. It may be all caps or all lower case or something in between.
The name might come before or after, one or two words. If you can't derive it, imagine what it could be
An example input would be: "Create $blondegirl as a token for blonde girls"
`;

export const launchpadCreate: Action = {
    name: "CREATE_LAUNCHPAD_TOKEN",
    similes: ["CREATE_TOKEN", "LAUNCHPAD_TOKEN"],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        // Check if the necessary parameters are provided in the message
        console.log("Message:", message);
        return true;
    },
    description: "Create a token on the Bonsai Launchpad",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<{}> => {
        // entry point was a direct message or a lens post mention
        const params = state?.params as any;
        const withPost = !!params?.publication_id;
        const _imageURL = state?.imageURL as string | undefined;
        const selfAsCreator = params?.setSelfAsCreator || false;

        const messageContext = composeContext({
            state,
            template: messageTemplate,
        });

        let response;
        try {
            response = await generateObjectDeprecated({
                runtime,
                context: messageContext,
                modelClass: ModelClass.SMALL,
            });
            console.log("response", response);
        } catch (error) {
            console.log(error);
            callback?.({
                text: "Failed to create token, try again later",
                attachments: [],
                action: "NONE",
            });
            return;
        }

        let { symbol, name, description } = response;

        symbol = symbol ? symbol.replace("$", "") : null;
        name =
            name ||
            (symbol ? symbol.charAt(0).toUpperCase() + symbol.slice(1) : null);
        console.log(
            `Parsed token details - Name: ${name}, Symbol: ${symbol}, Description: ${
                description || "n/a"
            }. Self as creator?: ${selfAsCreator}`
        );
        if (!(symbol && name)) {
            callback?.({
                text: "Failed to create token, try again later",
                attachments: [],
                action: "NONE",
            });
            return;
        }

        let imageURL = params?.lens?.image?.item
            ? getLensImageURL(params.lens.image?.item)
            : _imageURL;

        if (!imageURL) {
            console.log(`no image url - generating...`);
            const imageResponse = await generateImage(
                {
                    prompt: `generate an image that can accompany this project: Name: ${name}, Description: ${description}`,
                    width: 1024,
                    height: 1024,
                },
                runtime
            );
            imageURL = await parseAndUploadBase64Image(imageResponse);
        }

        // get agent
        const { collection } = await getClient();
        const agent = await collection.findOne({
            handle: "bons_ai",
        });
        if (!agent) {
            console.log("agent not found");
            return;
        }

        // get wallets
        const wallets = await getWallets(agent.agentId, false);
        if (!wallets?.polygon) {
            console.log("failed to load polygon wallet");
            return;
        }

        // get info from the orb post that triggered it
        const userAddress = state.userAddress as `0x${string}` | undefined;
        const lensProfile = withPost
            ? await getProfileById(params.profile_id)
            : undefined;

        // register club with the caller's lens profile as the creator, and buy the initial supply (if possible)
        const wallet = IS_PRODUCTION ? wallets.base : wallets.baseSepolia;
        const [_address] = await wallet.listAddresses();
        const address = _address.getId() as `0x${string}`;
        const creator = selfAsCreator
            ? address
            : userAddress || (lensProfile.ownedBy.address as `0x${string}`);
        const hasBonsaiNFT =
            (await getTokenBalance(
                userAddress || (lensProfile.ownedBy.address as `0x${string}`),
                BONSAI_TOKEN_ADDRESS_BASE
            )) > parseEther("100000");

        const registerParams = {
            tokenName: name,
            tokenSymbol: symbol.replace("$", ""),
            tokenImage: imageURL,
            initialSupply: "0", // TOOD: not immediately buying the first supply until we have user delegated wallets
        };
        const existingClub = await searchToken(registerParams.tokenSymbol);

        let reply;
        let attachments;
        if (!existingClub) {
            const clubId = await createToken(
                wallet,
                creator,
                registerParams
            );
            if (clubId) {
                let pubId = params?.publication_id;
                const message = `$${symbol} has been created! 👇
https://launch.bonsai.meme/token/${clubId}`;

                if (!withPost) {
                    const { id } = await createPost(
                        wallets?.polygon,
                        wallets?.profile?.id,
                        wallets?.profile?.handle,
                        message
                    );
                    pubId = id;
                }

                // store in our db
                const handle = selfAsCreator
                    ? AGENT_HANDLE
                    : withPost
                        ? lensProfile.handle.localName
                        : userAddress;
                await createClub(clubId, {
                    pubId,
                    handle,
                    profileId: params?.profile_id,
                    strategy: "lens",
                    token: {
                        name: registerParams.tokenName,
                        symbol: registerParams.tokenSymbol,
                        image: registerParams.tokenImage,
                        description,
                    },
                    featureStartAt: hasBonsaiNFT
                        ? Math.floor(Date.now() / 1000)
                        : undefined,
                });

                if (withPost) {
                    await createPost(
                        wallets?.polygon,
                        wallets?.profile?.id,
                        wallets?.profile?.handle,
                        message,
                        undefined,
                        undefined,
                        params?.publication_id
                    );
                }

                reply = `$${symbol} has been created!`;
                const url = `https://launch.bonsai.meme/token/${clubId}`;
                attachments = [
                    {
                        button: { url },
                    },
                    {
                        button: {
                            label: "Share to X",
                            url: tweetIntentTokenReferral({
                                url,
                                text: `I created $${symbol} with Bonsai @agentdotbonsai`,
                            }),
                            useLabel: true,
                        },
                    },
                    {
                        button: {
                            label: "Share to Farcaster",
                            url: castIntentTokenReferral({
                                url,
                                text: `I created $${symbol} with Bonsai @agentdotbonsai`,
                            }),
                            useLabel: true,
                        },
                    },
                    {
                        button: {
                            label: "Share to Lens",
                            url: orbIntentTokenReferral({
                                text: `I created $${symbol} with Bonsai! @bons_ai ${url}`,
                            }),
                            useLabel: true,
                        },
                    },
                ];
            } else {
                reply = "Failed to create your token, try again later";
            }
        } else {
            console.log(
                `skipping, token already exists: ${existingClub.clubId}`
            );
            reply = `Ticker $${registerParams.tokenSymbol} already exists!`;
            attachments = [
                {
                    button: {
                        url: `https://launch.bonsai.meme/token/${existingClubId}`,
                    },
                },
            ];
        }

        callback?.({
            text: reply,
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
                    text: "Create a token $PARTNER for all the partners",
                },
            },
            {
                user: "Sage",
                content: {
                    text: "Creating the token",
                    action: "CREATE_LAUNCHPAD_TOKEN",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Create $DOG as a token for the dogs",
                },
            },
            {
                user: "Sage",
                content: {
                    text: "Creating the token",
                    action: "CREATE_LAUNCHPAD_TOKEN",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Create this token on the bonsai launchpad $CAT",
                },
            },
            {
                user: "Sage",
                content: {
                    text: "Creating the token",
                    action: "CREATE_LAUNCHPAD_TOKEN",
                },
            },
        ],
    ] as ActionExample[][],
} as Action;
