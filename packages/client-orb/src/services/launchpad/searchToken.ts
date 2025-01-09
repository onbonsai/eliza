const BONSAI_LAUNCHPAD_API_URL = "https://launch.bonsai.meme/api";

// TODO: launchpad api url needs to be opened up with cors or change subgraph to index token info in string

export default async (symbol: string): Promise<string | undefined> => {
    try {
        console.log({ query: symbol });
        const response = await fetch(
            `${BONSAI_LAUNCHPAD_API_URL}/clubs/search`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ query: symbol }),
            }
        );

        if (!response.ok) {
            console.error("Failed to post to API:", response.statusText);
            return;
        }

        const data = await response.json();
        const { results } = data;

        const res = results.find(
            ({ token }: { token: { symbol: string } }) =>
                token.symbol === symbol
        );
        return res?.clubId;
    } catch (error) {
        console.error("Error posting to API:", error);
        return;
    }
    return;
};
