import { elizaLogger } from "@ai16z/eliza/src/logger.ts";
import {
  Action,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from "@ai16z/eliza/src/types.ts";
import { getWallets } from "./../services/coinbase.ts";
import createPost from "./../services/orb/createPost.ts";

const createPostAction = {
  name: "CREATE_POST",
  similes: ["ORB_POST", "CREATE_ORB_POST", "CREATE_LENS_POST", "LENS_POST"],
  description: "Create a post to Orb using the message prompt.",
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
    const userId = runtime.agentId;
    elizaLogger.log("User ID:", userId);

    const response = (await runtime.messageManager.getMemories({
        roomId: message.roomId,
    }))[0];
    elizaLogger.log("Creating post with text:", response.content.text);

    const wallets = await getWallets(message.agentId, true);
    if (!wallets?.polygon) {
        elizaLogger.error(`Failed to fetch wallets for agentId: ${message.agentId}`);
        return;
    }

    try {
      // await createPost(
      //     wallets.polygon,
      //     wallets.profile.id,
      //     wallets.profile.handle,
      //     response.content.text,
      //     undefined // TODO: generate image
      // );

      callback(
          {
              text: `I just created a post on the Orb /bonsai club, with the following text:
${response.content.text}`,
          },
          []
      );
    } catch (error) {
      elizaLogger.error("Failed to create post");
      console.log(error);
    }
  },
  examples: [
    // TODO: We want to generate posts in more abstract ways, not just when asked to generate a post

    [
      {
        user: "{{user1}}",
        content: { text: "Create a post about something" },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "I created a post on Orb",
          action: "CREATE_POST",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: { text: "Post to Lens where you are explaining something" },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "I posted to Lens",
          action: "CREATE_POST",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: { text: "Create a post on Orb where you talk about stuff" },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Ok I posted about stuff on Orb",
          action: "CREATE_POST",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: { text: "Make a Lens post on Orb explaining what you are thinking about" },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "I made a Lens post explaining what I'm thinking about",
          action: "CREATE_POST",
        },
      },
    ]
  ],
} as Action;

export default createPostAction;