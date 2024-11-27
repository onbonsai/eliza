import { composeContext } from "@ai16z/eliza/src/context.ts";
import { generateObject } from "@ai16z/eliza/src/generation.ts";
import {
    ActionExample,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    type Action,
} from "@ai16z/eliza/src/types.ts";
import { ClientBase } from "@ai16z/client-twitter/src/base.ts";
import { getClient } from "../services/mongo.ts";
import { getWallets } from "../services/coinbase.ts";
import { registerClub } from "../services/launchpad/contract.ts";
import { getLensImageURL } from "../services/lens/ipfs.ts";
import { getProfileById } from "../services/lens/profiles.ts";
import createPost from "../services/orb/createPost.ts";

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
        // composeState
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        // orb post params
        if (!_options?.params) {
            throw new Error(
                "no params to determine creator, image etc. Orb post body must be passed in through _options arg"
            );
        }
        const params = _options.params as any;

        const text = params.lens.content || message.content.text;

        // Extract name, ticker, and description from text using regex
        const nameMatch = text.match(/name:\s*([^,\n]+)/i);
        const tickerMatch = text.match(/ticker:\s*\$?([^,\n\s]+)/i);
        const descriptionMatch = text.match(/description:\s*([^,\n]+)/i);

        const name = nameMatch ? nameMatch[1].trim() : null;
        const ticker = tickerMatch ? tickerMatch[1].trim().toUpperCase() : null;
        const description = descriptionMatch
            ? descriptionMatch[1].trim()
            : null;

        if (!name || !ticker) {
            throw new Error(
                "Missing required name or ticker. Format should be: name: <name>, ticker: <ticker>"
            );
        }

        console.log(
            `Parsed token details - Name: ${name}, Ticker: ${ticker}, Description: ${description || "None provided"}`
        );

        const imageURL = params.lens.image?.item
            ? getLensImageURL(params.lens.image?.item)
            : undefined;

        // get agent
        const { collection } = await getClient();
        const agent = await collection.findOne({
            clubId: "65e6dec26d85271723b6357c", // only use bons_ai
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
        const recipient = lensProfile.ownedBy.address as `0x${string}`;

        // register club
        const createClubResponse = await registerClub(wallets.base, recipient, {
            pubId: params.publication_id,
            handle: params.name.split("@")[1].split("'")[0],
            profileId: params.profile_id,
            tokenName: name,
            tokenSymbol: ticker,
            tokenDescription: description,
            tokenImage: imageURL,
            initialSupply: "5000000",
        });

        const reply = `Your new token has been created: https://launch.bonsai.meme/token/${createClubResponse.clubId}`;
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
            text: "",
            attachments: [],
        });

        return {};
    },
    examples: [
        // Add more examples as needed
    ] as ActionExample[][],
} as Action;
