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
} from "@elizaos/core";
import { z } from "zod";
import { parseEther, parseUnits } from "viem";
import { getClient } from "../services/mongo.ts";
import { getWallets } from "../services/coinbase.ts";
import {
    // IS_PRODUCTION,
    DECIMALS,
    BONSAI_TOKEN_ADDRESS_BASE,
    searchToken,
    // registerClub,
    // getTokenBalance,
} from "@elizaos/plugin-bonsai-launchpad";
import { createClub } from "../services/launchpad/database.ts";
import { getLensImageURL } from "../services/lens/ipfs.ts";
import { getProfileById } from "../services/lens/profiles.ts";
import { approveToken } from "../services/coinbase.ts";
import createPost from "../services/orb/createPost.ts";
import { AGENT_HANDLE } from "../utils/constants.ts";
import {
    IS_PRODUCTION,
    registerClub,
    getTokenBalance,
} from "../services/launchpad/contract.ts";
import {
    tweetIntentTokenReferral,
    orbIntentTokenReferral,
    castIntentTokenReferral,
} from "../utils/utils.ts";

export const TokenInfoSchema = z.object({
    symbol: z.string().nullable().describe("Symbol"),
    name: z.string().nullable().describe("Name"),
    description: z.string().nullable().describe("Description"),
});

// Updated to allow either a single object or an array of objects
export const OptionalArrayTokenInfoSchema = z
    .union([TokenInfoSchema.nullable(), z.array(TokenInfoSchema.nullable())])
    .describe("Either a single info or an array of info");

const DEFAULT_CURVE_TYPE = 1; // NORMAL;
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
            response = await generateObject({
                runtime,
                context: messageContext,
                modelClass: ModelClass.LARGE,
                schema: OptionalArrayTokenInfoSchema,
            });
            response = Array.isArray(response)
                ? response.find((item) => item !== null)
                : response.object;
            response = Array.isArray(response)
                ? response.find((item) => item !== null)
                : response;
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
            `Parsed token details - Name: ${name}, Symbol: ${symbol}, Description: ${description || "n/a"}. Self as creator?: ${selfAsCreator}`
        );
        if (!(symbol && name)) {
            callback?.({
                text: "Failed to create token, try again later",
                attachments: [],
                action: "NONE",
            });
            return;
        }

        const imageURL = params?.lens?.image?.item
            ? getLensImageURL(params.lens.image?.item)
            : _imageURL;

        // TODO: generate an image for the token
        if (!imageURL) {
            console.log(`no image url`);
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

        const initialSupply = "0"; // not buying till we have a good strategy
        // const registrationFee = await getRegistrationFee(
        //     DEFAULT_INITIAL_SUPPLY,
        //     DEFAULT_CURVE_TYPE,
        //     address
        // );
        // const balance = await getTokenBalance(address);
        // const initialSupply =
        //     balance > registrationFee ? DEFAULT_INITIAL_SUPPLY : "0";
        // if (balance > registrationFee) {
        //     await approveToken(
        //         USDC_CONTRACT_ADDRESS,
        //         wallet,
        //         address,
        //         LAUNCHPAD_CONTRACT_ADDRESS,
        //         CHAIN
        //     );
        // }
        const handle = selfAsCreator
            ? AGENT_HANDLE
            : withPost
              ? lensProfile.handle.localName
              : userAddress;
        const registerParams = {
            pubId: params?.publication_id,
            handle,
            profileId: params?.profile_id,
            tokenName: name,
            tokenSymbol: symbol.replace("$", ""),
            tokenDescription: description,
            tokenImage: imageURL,
            initialSupply: parseUnits(initialSupply, DECIMALS).toString(),
            curveType: DEFAULT_CURVE_TYPE,
        };
        const existingClubId = await searchToken(registerParams.tokenSymbol);

        let reply;
        let attachments;
        if (!existingClubId) {
            const { clubId } = await registerClub(
                wallet,
                creator,
                registerParams
            );
            if (clubId) {
                let pubId = registerParams.pubId;
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
                await createClub(clubId, {
                    pubId,
                    handle: registerParams.handle,
                    profileId: registerParams.profileId,
                    strategy: "lens",
                    token: {
                        name: registerParams.tokenName,
                        symbol: registerParams.tokenSymbol,
                        image: registerParams.tokenImage,
                        description: registerParams.tokenDescription,
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
                const url = `https://launch.bonsai.meme/token/${clubId}?ref=${userAddress}`;
                attachments = [
                    {
                        button: { url },
                    },
                    {
                        button: {
                            label: "Share to X",
                            url: tweetIntentTokenReferral({
                                url,
                                text: `Created $${symbol}!`,
                            }),
                            useLabel: true,
                        },
                    },
                    {
                        button: {
                            label: "Share to Farcaster",
                            url: castIntentTokenReferral({
                                url,
                                text: `Created $${symbol}!`,
                            }),
                            useLabel: true,
                        },
                    },
                    {
                        button: {
                            label: "Share to Lens",
                            url: orbIntentTokenReferral({
                                text: `Created $${symbol}! ${url}`,
                            }),
                            useLabel: true,
                        },
                    },
                ];
            } else {
                reply = "Failed to create your token, try again later";
            }
        } else {
            console.log(`skipping, token already exists: ${existingClubId}`);
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
