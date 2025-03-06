import { Post } from "@lens-protocol/client";
import type { LaunchpadToken, SmartMedia, SmartMediaBase, TemplateCategory, TemplateName } from "./types";
import { URI } from "@lens-protocol/metadata";
import { stringToUuid } from "@elizaos/core";
import { DEFAULT_MAX_STALE_TIME } from "./constants";

export const toHexString = (id: number) => {
    const profileHexValue = id.toString(16);
    return `0x${profileHexValue.length === 3 ? profileHexValue.padStart(4, "0") : profileHexValue.padStart(2, "0")}`;
};

export const bToHexString = (id: bigint) => {
    const profileHexValue = id.toString(16);
    return `0x${profileHexValue.length === 3 ? profileHexValue.padStart(4, "0") : profileHexValue.padStart(2, "0")}`;
};

export const isMediaStale = (media: SmartMedia): boolean => {
    const currentTime = Math.floor(new Date().getTime() / 1000);
    return currentTime - media.updatedAt > media.maxStaleTime;
};

export const getLatestComments = (media: SmartMedia, comments: Post[]): Post[] => (
    comments.filter((c: Post) => new Date(c.timestamp).getTime() > (media.updatedAt * 1000))
);

// collectors get 1 vote weight; > 1mil tokens is weight of 3
export const getVoteWeightFromBalance = (balance: bigint) => {
    if (balance === 0n) return 1;
    if (balance >= 1_000_000n) return 3;
    return 2;
}

/**
 * Formats smart media data into a consistent structure.
 *
 * @param {string} creator - Creator's wallet address
 * @param {TemplateCategory} category - Template category
 * @param {TemplateName} templateName - Name of template used
 * @param {unknown} templateData - Data for template
 * @param {string} [postId] - Optional Lens post ID
 * @param {URI} [uri] - Optional IPFS URI
 * @param {LaunchpadToken} [token] - Associated launchpad token
 * @returns {SmartMediaBase | SmartMedia} Formatted smart media object
 */
export const formatSmartMedia = (
    creator: `0x${string}`,
    category: TemplateCategory,
    templateName: TemplateName,
    templateData: unknown,
    postId ?: string,
    uri ?: URI,
    token ?: LaunchpadToken,
): SmartMediaBase | SmartMedia => {
    const ts = Math.floor(Date.now() / 1000);
    const finalAgentId = postId ? stringToUuid(postId as string) : stringToUuid(`preview-${creator}`);
    return {
        category,
        template: templateName,
        agentId: finalAgentId,
        creator,
        templateData,
        postId,
        uri,
        token,
        maxStaleTime: DEFAULT_MAX_STALE_TIME,
        createdAt: ts,
        updatedAt: ts,
    };
}