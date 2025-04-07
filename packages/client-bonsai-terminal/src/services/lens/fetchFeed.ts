import { evmAddress } from "@lens-protocol/client";
import { fetchTimeline } from "@lens-protocol/client/actions";
import { client } from "./client";

export const fetchFeed = async (
    account: `0x${string}`,
    limit = 20
): Promise<any[]> => {
    // TODO: how to pass along limit
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
