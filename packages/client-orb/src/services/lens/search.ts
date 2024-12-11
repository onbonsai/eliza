import { LensClient, production } from "@lens-protocol/client";

export const searchLensForTerm = async (query: string) => {
    const client = new LensClient({ environment: production });

    const result = await client.search.publications({ query });

    return result.items.map((item) => ({
        // @ts-ignore
        content: item.metadata.content,
        stats: item.stats,
        by: item.by.handle.localName,
    }));
};
