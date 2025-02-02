import type { Plugin } from "@elizaos/core";
import { createTokenAction } from "./actions/createToken";
import { launchpadAnalyticsAction } from "./actions/launchpadAnalytics";
import { promoteTokenAction } from "./actions/promoteToken";

export * from "./helpers/contract";
export * from "./helpers/utils";

export const bonsaiLaunchpadPlugin: Plugin = {
    name: "bonsaiLaunchpad",
    description: "Bonsai Launchpad Plugin for Eliza",
    actions: [createTokenAction, launchpadAnalyticsAction, promoteTokenAction],
    evaluators: [],
    providers: [],
};

export default bonsaiLaunchpadPlugin;
