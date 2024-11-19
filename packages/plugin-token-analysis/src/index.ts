import { Plugin } from "@ai16z/eliza/src/types.ts";
import { walletProvider } from "./providers/wallet.ts";
import { trustScoreProvider } from "./providers/trustScoreProvider.ts";
import { scoreToken } from "./actions/scoreToken.ts";

/**
 * Plugin for ingesting a ticker or contract address + chain combo, performing technical analysis
 * and scanning social for a sentiment analysis and scoring the token.
 */
export const tokenAnalysisPlugin: Plugin = {
    name: "tokenAnalysis",
    description: "Token Analysis Plugin for Eliza",
    actions: [scoreToken],
    evaluators: [],
    providers: [walletProvider, trustScoreProvider],
};

export default tokenAnalysisPlugin;
