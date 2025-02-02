// Base interface with common properties
interface BaseClub {
    id: string; // hex id
    clubId: string; // decimal id
    creator: `0x${string}`;
    initialSupply: string;
    createdAt: string;
    supply: string;
    feesEarned: string;
    currentPrice: string;
    liquidity: string;
    liquidityReleasedAt?: string;
    holders: string;
    marketCap: string;
    complete: boolean;
    token: {
        name: string;
        symbol: string;
        image: string;
    };
}

// V1-specific properties
interface ClubV1 extends BaseClub {
    v2: false;
    tokenInfo: string;
    tokenAddress?: string; // only present for graduated tokens
}

// V2-specific properties
interface ClubV2 extends BaseClub {
    v2: true;
    tokenAddress: string; // always present
    name: string;
    symbol: string;
    uri: string;
}

// Discriminated union type
export type Club = ClubV1 | ClubV2;
