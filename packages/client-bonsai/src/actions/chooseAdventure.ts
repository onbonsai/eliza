import {
    elizaLogger,
    type Action,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    type State,
} from "@elizaos/core";

const chooseAdventure = {
    name: "CHOOSE_ADVENTURE",
    similes: [],
    description: "Create a post with a choose-your-own-adventure prompt and watch it unfold.",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        return !!process.env.ORB_API_BEARER_KEY;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback: HandlerCallback
    ) => {
        elizaLogger.log("Composing state for message:", message);
        state = (await runtime.composeState(message)) as State;

        try {
            // TODO: new type of callback, to set the post metadata, return the new uri, and cache
            callback(
                {
                    text: ""
                },
                []
            );
        } catch (error) {
            elizaLogger.error("Failed to handle");
            console.log(error);
        }
    },
    examples: [
        // TODO: instead of examples of user <=> agent, examples of what the resulting post metadata should look like
    ],
} as Action;

export default chooseAdventure;
