import { evmAddress, Post } from "@lens-protocol/client-canary";
import { fetchTimeline } from "@lens-protocol/client-canary/actions";
import { client } from "./client";

export const fetchFeed = async (
    account: `0x${string}`,
    limit = 20
): Promise<any[]> => {
    const result = await fetchTimeline(client, {
        account: evmAddress(account),
    });

    if (result.isErr()) return [];

    return result.value.items.slice(0, limit).map((item) => ({
        author: item.primary.author.username.localName,
        // @ts-ignore metadata
        content: item.primary.metadata.content,
    }));
};
