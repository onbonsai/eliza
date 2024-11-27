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

export const launchpadCreate: Action = {
    name: "CREATE_TOKEN_LAUNCHPAD",
    similes: [
        "CREATE_TOKEN",
        "LAUNCH_TOKEN",
        "NEW_TOKEN"
    ],
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

        const text = message.content.text

        // Extract name, ticker, and description from text using regex
        const nameMatch = text.match(/name:\s*([^,\n]+)/i);
        const tickerMatch = text.match(/ticker:\s*\$?([^,\n\s]+)/i);
        const descriptionMatch = text.match(/description:\s*([^,\n]+)/i);

        const name = nameMatch ? nameMatch[1].trim() : null;
        const ticker = tickerMatch ? tickerMatch[1].trim().toUpperCase() : null;
        const description = descriptionMatch ? descriptionMatch[1].trim() : null;

        if (!name || !ticker) {
            throw new Error("Missing required name or ticker. Format should be: name: <name>, ticker: <ticker>");
        }

        console.log(`Parsed token details - Name: ${name}, Ticker: ${ticker}, Description: ${description || 'None provided'}`);

        // TODO: register club
        // await registerClub()

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
