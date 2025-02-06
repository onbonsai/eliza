import { type Client, type IAgentRuntime, elizaLogger } from "@elizaos/core";
import { privateKeyToAccount } from "viem/accounts";
import { LensClient } from "./client";
import { LensPostManager } from "./post";
import { LensInteractionManager } from "./interactions";
import StorjProvider from "./providers/StorjProvider";

class LensManager {
    client: LensClient;
    posts: LensPostManager;
    interactions: LensInteractionManager;

    constructor(public runtime: IAgentRuntime) {
        const cache = new Map<string, any>();

        const privateKey = runtime.getSetting(
            "EVM_PRIVATE_KEY"
        ) as `0x${string}`;
        if (!privateKey) {
            throw new Error("EVM_PRIVATE_KEY is missing");
        }
        const account = privateKeyToAccount(privateKey);

        const profileId = runtime.getSetting(
            "LENS_PROFILE_ID"
        )! as `0x${string}`;

        this.client = new LensClient({
            runtime: this.runtime,
            account,
            cache,
            profileId,
        });

        elizaLogger.info("Lens client initialized.");

        const ipfs = new StorjProvider(runtime)

        this.posts = new LensPostManager(
            this.client,
            this.runtime,
            profileId,
            cache,
            ipfs,
        );

        this.interactions = new LensInteractionManager(
            this.client,
            this.runtime,
            profileId,
            cache,
            ipfs,
        );
    }
}

export const LensAgentClientInterface: Client = {
    async start(runtime: IAgentRuntime) {
        const manager = new LensManager(runtime);

        // start services
        await Promise.all([manager.posts.start(), manager.interactions.start()]);

        return manager;
    },

    async stop(runtime: IAgentRuntime) {
        try {
            // stop it
            elizaLogger.log("Stopping lens client", runtime.agentId);
            const manager = runtime.clients?.lens;
            if (manager) {
                await Promise.all([manager.posts.stop(), manager.interactions.stop()]);
            }
        } catch (e) {
            elizaLogger.error("client-lens interface stop error", e);
        }

    }
};

export default LensAgentClientInterface;