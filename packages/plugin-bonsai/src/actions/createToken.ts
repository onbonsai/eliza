import {
    composeContext,
    type ActionExample,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    type State,
    type Action,
    ModelClass,
    generateObjectDeprecated,
    generateImage,
    ModelProviderName,
    elizaLogger,
    type Clients,
} from "@elizaos/core";
import { CHAIN, searchToken } from "../helpers/utils.ts";
import { createToken } from "../helpers/contract.ts";
import { getWalletClient } from "../utils/viem.ts";
import setLensData from "../helpers/setLensData.ts";

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

interface StatePayloadCreateToken {
    client: Clients.LENS | Clients.FARCASTER;
    replyTo?: {
        lensPubId?: string;
        farcasterCastHash?: string;
        fid?: string;
    };
    imageURL?: string;
    creatorAddress?: `0x${string}`;
}

export const createTokenAction: Action = {
    name: "CREATE_LAUNCHPAD_TOKEN",
    similes: ["CREATE_TOKEN", "CREATE_TOKEN_LAUNCHPAD"],
    validate: async (runtime: IAgentRuntime, _: Memory) => {
        return runtime.clients.lens || runtime.clients.farcaster;
    },
    description: "Create a token on the Bonsai Launchpad",
    handler: async (
        runtime: IAgentRuntime,
        _: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ) => {
        // entry point was a direct message or social post mention
        const params = state?.payload as StatePayloadCreateToken;

        const messageContext = composeContext({
            state,
            template: messageTemplate,
        });

        // use recent messages to get token info
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
            });
            return;
        }

        // parse out the token info
        let { symbol, name, description } = response;
        symbol = symbol ? symbol.replace("$", "") : null;
        name = name || (symbol ? symbol.charAt(0).toUpperCase() + symbol.slice(1) : null);
        console.log(
            `Parsed token details - Name: ${name}, Symbol: ${symbol}, Description: ${description || "n/a"}`
        );
        if (!(symbol && name)) {
            callback?.({
                text: "Failed to create token, try again later",
                attachments: [],
                action: "NONE",
            });
            return;
        }

        // determine creator address and token image from the post / cast
        let publication;
        let cast;
        let imageURL = params.imageURL;
        let creatorAddress = params.creatorAddress;
        if (params.replyTo.lensPubId) {
            publication = await runtime.clients.lens.client.getPublication(
                params.replyTo.lensPubId
            );
            creatorAddress = creatorAddress || publication.by.ownedBy.address;
            imageURL =
                imageURL ||
                publication.metadata?.asset?.image?.optimized?.uri ||
                publication.metadata?.asset?.image?.raw?.uri;
        } else {
            cast = await runtime.clients.farcaster.client.getCast(
                params.replyTo?.farcasterCastHash
            );
            const profile = await await runtime.clients.farcaster.client.getProfile(cast.authorFid);
            creatorAddress = creatorAddress || profile.ethAddress;
            // TODO: cast.embeds undefined even though it exists
            imageURL =
                imageURL ||
                (cast.embeds?.length > 0 && cast.embeds[0].metadata?.image
                    ? cast.embeds[0].url
                    : null);
        }

        // if no imageURL is parsed from the post / cast
        if (!imageURL) {
            // try to use the titles model
            const useTitles = !!runtime.getSetting("TITLES_API_KEY");
            const imageModelProvider = useTitles ? ModelProviderName.TITLES : undefined;
            elizaLogger.info(
                `No image provided, generating one using ${imageModelProvider ? ModelProviderName.TITLES : runtime.imageModelProvider}...`
            );
            const imageResponse = await generateImage(
                {
                    prompt: `generate an image that can accompany this project: Name: ${name}, Description: ${description}`,
                    width: 1024,
                    height: 1024,
                    imageModelProvider,
                    returnRawResponse: useTitles ? true : undefined,
                },
                runtime
            );
            imageURL = imageResponse.success ? imageResponse.data?.[0] : null;
        }

        // prepare transaction
        const walletClient = getWalletClient(
            runtime.getSetting("EVM_PRIVATE_KEY") as `0x${string}`,
            CHAIN,
            runtime.getSetting("BASE_RPC_URL") as `0x${string}`
        );
        const registerParams = {
            tokenName: name,
            tokenSymbol: symbol,
            tokenImage: imageURL,
            initialSupplyWei: "0", // TOOD: not immediately buying the first supply until we have user delegated wallets
        };

        let reply: string;
        let txHash: `0x${string}`;
        let id: string;
        // only create a token if the symbol doesn't already exist
        if (!(await searchToken(registerParams.tokenSymbol))) {
            const { txHash: hash, id: clubId } = await createToken(
                walletClient,
                creatorAddress,
                registerParams
            );

            id = clubId;
            txHash = hash;

            if (id) {
                reply = `$${symbol} has been created! 👇
https://launch.bonsai.meme/token/${id}`;
            } else {
                reply = "Failed to create your token, try again later";
            }
        } else {
            reply = `Token $${registerParams.tokenSymbol} already exists!`;
        }

        // reply to the lens post and cache lens data for the launchpad
        if (params.replyTo?.lensPubId) {
            const { handle, id: profileId } = publication.by;

            if (
                !(await setLensData({
                    txHash,
                    pubId: params.replyTo?.lensPubId,
                    handle: handle.localName,
                    profileId,
                }))
            ) {
                elizaLogger.error("plugin-bonsai:: createToken:: failed to set lens data");
            }
        }

        // reply to the farcaster post, create a lens post and cache it for the launchpad
        if (params.replyTo?.farcasterCastHash) {
            const fid = Number(runtime.getSetting("FARCASTER_FID"));
            const farcasterProfile = await runtime.clients.farcaster.client.getProfile(fid);
            await runtime.clients.farcaster.posts.sendCast({
                content: `$${symbol} has been created! 👇`,
                profile: farcasterProfile,
                embeds: [
                    {
                        url: `https://launch.bonsai.meme/token/${id}`,
                    },
                ],
                inReplyTo: {
                    hash: params.replyTo?.farcasterCastHash,
                    fid: cast.authorFid,
                },
            });

            // post to lens so we can reference in the launchpad, for comments
            const { id: pubId } = await runtime.clients.lens.posts.sendPublication({
                content: reply,
                commentOn: params.replyTo?.lensPubId
            });

            if (!(await setLensData({ txHash, pubId }))) {
                elizaLogger.error("plugin-bonsai:: createToken:: failed to set lens data");
            }
        }

        // do not invoke `callback` as it will likely create a new post
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
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Create the token $CAT to guide the cats to their home",
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
                    text: "@agentdotbonsai create $ANON for all the anons",
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
                    text: "Hey @bons_ai create a token on the launchpad $AGI with description: AGI needs a token platform",
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
