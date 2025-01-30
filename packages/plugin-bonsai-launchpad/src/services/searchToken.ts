import { searchClubs } from "./utils";

interface Club {
    id: string;
    clubId: string;
    creator: `0x${string}`;
    initialSupply: string;
    createdAt: string;
    supply: string;
    feesEarned: string;
    currentPrice: string;
    liquidity: string;
    holders: string;
    marketCap: string;
    complete: boolean;
    token: {
        name: string;
        symbol: string;
        image: string;
    };
    v2: boolean;
    tokenAddress: string;
}
export const searchToken = async (
    symbol: string
): Promise<Club | undefined> => {
    try {
        symbol = symbol.replace("$", "");
        const clubs = await searchClubs(symbol);
        return clubs?.length ? clubs[0] : undefined;
    } catch (error) {
        console.error("Error posting to API:", error);
        return;
    }
};
