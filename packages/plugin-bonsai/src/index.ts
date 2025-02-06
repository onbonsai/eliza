import type { Plugin } from "@elizaos/core";
import { createTokenAction } from "./actions/createToken";
import { launchpadAnalyticsAction } from "./actions/launchpadAnalytics";
import { promoteTokenAction } from "./actions/promoteToken";

export * from "./helpers/contract";
export * from "./helpers/utils";

const initActions = async () => {
    const {
        SUBGRAPH_API_KEY,
        EVM_PRIVATE_KEY,
        BASE_RPC_URL,
    } = process.env;

    if (SUBGRAPH_API_KEY && EVM_PRIVATE_KEY && BASE_RPC_URL) {
        console.log("\n┌════════════════════════════════════════════════════════════════════┐");
        console.log("│                                                                    │");
        console.log("│                        @@@@@@@@@@@@@@@@@@@                         │");
        console.log("│                    @@@@@@@@            @@@@@@@                     │");
        console.log("│                  @@@@@       ( @@          @@@@@                   │");
        console.log("│                @@@@      @ #@@@@*@@@,@        @@@@                 │");
        console.log("│               @@@         . @ @@  @@           @@@@                │");
        console.log("│              @@@     @ @@@@@@   @@@@@@@@#       @@@@               │");
        console.log("│             @@         @   *      @   @@@@@      @@@               │");
        console.log("│             @                @@@    @@@  @@@@    @@@               │");
        console.log("│             @              @@                    @@@               │");
        console.log("│              @               @@@@                @@@               │");
        console.log("│               @(          @@@@@@@@@@@@@         @@@                │");
        console.log("│                ( &         @@@@@@@@@@@        @@@@                 │");
        console.log("│                  @@@                        @@@@                   │");
        console.log("│                      @.                  &@@@                      │");
        console.log("│                        @@@@@.@ .. @@@@@@@@                         │");
        console.log("│                                                                    │");
        console.log("├────────────────────────────────────────────────────────────────────┤");
        console.log("│                    Initializing Bonsai Plugin...                   │");
        console.log("│                    Version: 1.0.0                                  │");
        console.log("└════════════════════════════════════════════════════════════════════┘");

        return [createTokenAction, launchpadAnalyticsAction, promoteTokenAction];
    }

    return [];
}

export const bonsaiPlugin: Plugin = {
    name: "bonsai",
    description: "Bonsai Plugin for Eliza: token launchpad for agentic content",
    actions: await initActions(),
    evaluators: [],
    providers: [],
};

export default bonsaiPlugin;
