const BONSAI_LAUNCHPAD_API_URL = "https://eliza.bonsai.meme";

export const searchToken = async (
    symbol: string
): Promise<string | undefined> => {
    try {
        symbol = symbol.replace("$", "");
        const response = await fetch(
            `${BONSAI_LAUNCHPAD_API_URL}/bonsai-launchpad/search-token?q=${symbol}`
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
};
