import { getClient } from "../mongo";

export default async (symbol: string): Promise<string | undefined> => {
    try {
        const { clubs } = await getClient();
        const results = await clubs
            .aggregate([
                {
                    $search: {
                        index: "clubs-prod-token-search-index",
                        text: {
                            query: symbol,
                            path: ["token.name", "token.symbol"], // fields to search
                        },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        score: { $meta: "textScore" },
                        token: 1,
                        handle: 1,
                        clubId: 1,
                    },
                },
                // Add a sort stage to sort by the text score
                { $sort: { score: { $meta: "textScore" } } },
            ])
            .toArray();

        const res = results.find(
            ({ token }: { token: { symbol: string } }) =>
                token.symbol.toLowerCase() === symbol.toLowerCase()
        );
        return res?.clubId;
    } catch (error) {
        console.error("Error posting to API:", error);
        return;
    }
    return;
};
