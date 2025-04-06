import type { Post, PostStats } from "@lens-protocol/client";
import { fetchPosts } from "@lens-protocol/client/actions";
import { client } from "./client";

export interface LensPost {
    content: string;
    stats: PostStats;
    by: string;
}

export const searchLensForTerm = async (searchQuery: string) => {
    const result = await fetchPosts(client, {
        filter: { searchQuery },
    });

    if (result.isErr()) {
        return [];
    }

    return result.value.items.map(
        (item: Post) =>
            ({
                // @ts-ignore
                content: item.metadata.content,
                stats: item.stats,
                by: item.author.username.localName,
            }) as LensPost
    );
};
