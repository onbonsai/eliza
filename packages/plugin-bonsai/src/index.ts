import type { Plugin } from "@elizaos/core";
import { createTokenAction } from "./actions/createToken";
import { launchpadAnalyticsAction } from "./actions/launchpadAnalytics";
import { promoteTokenAction } from "./actions/promoteToken";

export * from "./helpers/contract";
export * from "./helpers/utils";

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

// ... existing code ...

// ... existing code ...
export const bonsaiPlugin: Plugin = {
    name: "bonsai",
    description: "Bonsai Plugin for Eliza: token launchpad for agentic content",
    actions: [createTokenAction, launchpadAnalyticsAction, promoteTokenAction],
    evaluators: [],
    providers: [],
};

export default bonsaiPlugin;
