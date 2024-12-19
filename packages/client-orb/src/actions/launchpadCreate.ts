import { composeContext } from "@ai16z/eliza/src/context.ts";
import { generateObject } from "@ai16z/eliza/src/generation.ts";
import {
    ActionExample,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
    type Action,
    ModelClass,
} from "@ai16z/eliza/src/types.ts";
import { parseUnits } from "viem";
import { getClient } from "../services/mongo.ts";
import { getWallets } from "../services/coinbase.ts";
import {
    registerClub,
    IS_PRODUCTION,
    DECIMALS,
    USDC_CONTRACT_ADDRESS,
    LAUNCHPAD_CONTRACT_ADDRESS,
    CHAIN,
    getRegistrationFee,
    getTokenBalance,
} from "../services/launchpad/contract.ts";
import { getLensImageURL } from "../services/lens/ipfs.ts";
import { getProfileById } from "../services/lens/profiles.ts";
import { approveToken } from "../services/coinbase.ts";
import createPost from "../services/orb/createPost.ts";
import { AGENT_HANDLE } from "../utils/constants.ts";

/*
example orb post body data:

{
    publication_id: '0x0e76-0x03bc-DA-9884c2d8',
    profile_id: '0x0e76',
    action_modules: [],
    action_modules_init_datas: [],
    reference_module: null,
    reference_module_init_data: null,
    content_uri: 'ar://x2sj1Fv5njh3zvCIQrPLvePkGswj34DTwU-GSW-sXTo',
    timestamp: 1732740118000,
    action_modules_init_return_datas: [],
    reference_module_init_return_data: null,
    main_content_focus: 'TEXT_ONLY',
    tags: [ 'orbcommunitiesbonsai' ],
    description: 'Gm',
    external_url: 'https://orb.ac//@natem',
    name: 'text by @natem',
    attributes: [],
    animation_url: 'ipfs://bafkreig543m6ejm7rtkjluqws736scidhfkiqrqqjrcnd33sa26vigpq6q',
    lens: {
      id: 'fb2da93d-7ff2-4303-a761-f03e09b4d3cc',
      appId: 'orb',
      locale: 'en-US',
      tags: [ 'orbcommunitiesbonsai' ],
      mainContentFocus: 'TEXT_ONLY',
      content: 'Gm'
    },
    isEncrypted: false,
    type: 'post',
    total_amount_of_mirrors: 0,
    total_amount_of_actions: 0,
    total_amount_of_comments: 0,
    total_amount_of_quotes: 0,
    total_amount_of_tips: 0,
    total_reactions: 0,
    karma_score: 0,
    orb_reputation_score: 0,
    is_pinned: false,
    is_hidden: false,
    community_id: '65e6dec26d85271723b6357c',
    is_member: true
  }
*/

const DEFAULT_CURVE_TYPE = 1; // NORMAL;
const DEFAULT_INITIAL_SUPPLY = !IS_PRODUCTION ? "1" : "15"; // buy price at ~200 usdc

const messageTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "symbol": "$blondegirl"
    "name": "Blonde Girl",
    "description": "for blonde girls"
}
\`\`\`

{{userMessage}}

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
    name: "CREATE_TOKEN_LAUNCHPAD",
    similes: ["CREATE_TOKEN", "LAUNCH_TOKEN", "NEW_TOKEN"],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        // Check if the necessary parameters are provided in the message
        console.log("Message:", message);
        return true;
    },
    description: "Create a token on the launchpad.",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<{}> => {
        // orb post params
        const params = state?.params as any;
        if (!params?.publication_id) {
            throw new Error(
                "no params to determine creator, image etc. Orb params must be passed in through state"
            );
        }

        const messageContext = composeContext({
            state,
            template: messageTemplate,
        });

        const response = await generateObject({
            runtime,
            context: messageContext,
            modelClass: ModelClass.LARGE,
        });

        let { symbol, name, description } = response;

        // // Extract name, ticker, and description from text using regex
        // const nameMatch = text.match(/name:\s*([^,\n]+)/i);
        // const tickerMatch = text.match(/ticker:\s*\$?([^,\n\s]+)/i);
        // const descriptionMatch = text.match(/description:\s*([^,\n]+)/i);

        // const name = nameMatch ? nameMatch[1].trim() : null;
        // const symbol = tickerMatch ? tickerMatch[1].trim().toUpperCase() : null;
        // const description = descriptionMatch
        //     ? descriptionMatch[1].trim()
        //     : null;

        // if (!name || !symbol) {
        //     throw new Error(
        //         "Missing required name or ticker. Format should be: name: <name>, ticker: <ticker>"
        //     );
        // }

        symbol = symbol.replace("$", "");
        name = name || symbol.charAt(0).toUpperCase() + symbol.slice(1);
        console.log(
            `Parsed token details - Name: ${name}, Symbol: ${symbol}, Description: ${description || "None provided"}
Self as creator?: ${params.setSelfAsCreator}`
        );

        const imageURL = params.lens.image?.item
            ? getLensImageURL(params.lens.image?.item)
            : undefined;

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
        const lensProfile = await getProfileById(params.profile_id);

        // register club with the caller's lens profile as the creator, and buy the initial supply (if possible)
        const wallet = IS_PRODUCTION ? wallets.base : wallets.baseSepolia;
        const [_address] = await wallet.listAddresses();
        const address = _address.getId() as `0x${string}`;
        const creator = params.setSelfAsCreator
            ? address
            : (lensProfile.ownedBy.address as `0x${string}`);

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
        const handle = params.setSelfAsCreator
            ? AGENT_HANDLE
            : lensProfile.handle.localName;
        const { clubId } = await registerClub(wallet, creator, {
            pubId: params.publication_id,
            handle,
            profileId: params.profile_id,
            tokenName: name,
            tokenSymbol: symbol.replace("$", ""),
            tokenDescription: description,
            tokenImage: imageURL,
            initialSupply: parseUnits(initialSupply, DECIMALS).toString(),
            curveType: DEFAULT_CURVE_TYPE,
        });

        const reply = `$${symbol} has been created! 👇
https://launch.bonsai.meme/token/${clubId}`;
        await createPost(
            wallets?.polygon,
            wallets?.profile?.id,
            wallets?.profile?.handle,
            reply,
            undefined,
            undefined,
            params.publication_id
        );

        callback?.({
            text: reply,
            attachments: [],
        });

        return {};
    },
    examples: [
        // Add more examples as needed
        [
            {
                user: "{{user1}}",
                content: {
                    address: "create $beau for dogs",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    address: "create a token $beau for dogs",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Creating token $beau with description, for dogs",
                    action: "CREATE_TOKEN_LAUNCHPAD",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Token $beau created",
                },
            },
        ],
    ] as ActionExample[][],
} as Action;
