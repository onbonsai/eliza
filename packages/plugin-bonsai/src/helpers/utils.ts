import { GraphQLClient, gql } from "graphql-request";
import { decodeAbiParameters, formatUnits, type Chain } from "viem";
import { base, baseSepolia } from "viem/chains";
import pkg from 'lodash/collection';
const { groupBy } = pkg;

export const IS_PRODUCTION = true; // NOTE: always true unless in dev mode
export const CHAIN: Chain = IS_PRODUCTION ? base : baseSepolia;

const REGISTERED_CLUB = gql`
    query Club(
        $id: Bytes!
        $twentyFourHoursAgo: Int!
        $sixHoursAgo: Int!
        $oneHourAgo: Int!
        $fiveMinutesAgo: Int!
    ) {
        club(id: $id) {
            id
            creator
            createdAt
            initialSupply
            createdAt
            supply
            feesEarned
            currentPrice
            marketCap
            liquidity
            complete
            completedAt
            tokenAddress
            tokenInfo
            name
            symbol
            uri
            v2
            creatorFees
            holders
            prevTrade24h: trades(
                where: { createdAt_gt: $twentyFourHoursAgo }
                orderBy: createdAt
                orderDirection: asc
                first: 1
            ) {
                price
                prevPrice
                createdAt
            }
            prevTrade6h: trades(
                where: { createdAt_gt: $sixHoursAgo }
                orderBy: createdAt
                orderDirection: asc
                first: 1
            ) {
                price
                prevPrice
                createdAt
            }
            prevTrade1h: trades(
                where: { createdAt_gt: $oneHourAgo }
                orderBy: createdAt
                orderDirection: asc
                first: 1
            ) {
                price
                prevPrice
                createdAt
            }
            prevTrade5m: trades(
                where: { createdAt_gt: $fiveMinutesAgo }
                orderBy: createdAt
                orderDirection: asc
                first: 1
            ) {
                price
                prevPrice
                createdAt
            }
        }
    }
`;

const CLUB_TRADES_PAGINATED = gql`
    query ClubTrades($club: Bytes!, $skip: Int!) {
        trades(
            where: { club: $club }
            orderBy: createdAt
            orderDirection: desc
            first: 50
            skip: $skip
        ) {
            isBuy
            amount
            trader {
                id
            }
            price
            txPrice
            txHash
            createdAt
        }
    }
`;

const ALL_CLUB_TRADES_PAGINATED = gql`
    query ClubTrades($skip: Int!) {
        trades(
            orderBy: createdAt
            orderDirection: desc
            first: 100
            skip: $skip
        ) {
            isBuy
            amount
            trader {
                id
            }
            club {
                clubId
                tokenInfo
                name
                symbol
                uri
                v2
            }
            price
            txPrice
            txHash
            createdAt
        }
    }
`;

const CLUB_TRADES_LATEST = gql`
    query {
        trades(
            where: { isBuy: true }
            orderBy: createdAt
            orderDirection: desc
            first: 100
        ) {
            club {
                clubId
            }
            price
            amount
            createdAt
        }
    }
`;

const REGISTERED_CLUBS = gql`
    query Clubs($skip: Int!) {
        clubs(orderBy: supply, orderDirection: desc, first: 50, skip: $skip, where:{v2: true}) {
            id
            clubId
            creator
            initialSupply
            createdAt
            supply
            feesEarned
            currentPrice
            liquidity
            holders
            marketCap
            complete
            name
            symbol
            uri
            v2
            tokenAddress
        }
    }
`;

const SEARCH_CLUBS = gql`
    query SearchClubs($query: String!) {
        clubs(
            where: {
                or: [
                    { symbol_contains_nocase: $query }
                    { name_contains_nocase: $query }
                ]
            }
        ) {
            id
            clubId
            creator
            initialSupply
            createdAt
            supply
            feesEarned
            currentPrice
            liquidity
            holders
            marketCap
            complete
            name
            symbol
            uri
            v2
            tokenAddress
        }
    }
`;

export const DECIMALS = 18;
export const USDC_DECIMALS = 6;

export const CONTRACT_CHAIN_ID = IS_PRODUCTION ? base.id : baseSepolia.id;

export const SUBGRAPH_URL = `https://gateway.thegraph.com/api/${process.env.SUBGRAPH_API_KEY}/subgraphs/id/E1jXM6QybxvtA71cbiFbyyQYJwn2AHJNk7AAH1frZVyc`;
export const SUBGRAPH_TESTNET_URL = "https://api.studio.thegraph.com/query/18207/bonsai-launchpad/version/latest";

export function baseScanUrl(txHash: string) {
    return `https://${!IS_PRODUCTION ? "sepolia." : ""}basescan.org/tx/${txHash}`;
}

export const subgraphClient = () => {
    const uri = IS_PRODUCTION ? SUBGRAPH_URL : SUBGRAPH_TESTNET_URL;
    return new GraphQLClient(uri);
};

export const getTokenAnalytics = async (symbol: string) => {
    const club = await searchToken(symbol);
    if (!club) return null;

    const price = formatUnits(BigInt(club.currentPrice), USDC_DECIMALS);
    const marketCap = formatUnits(BigInt(club.supply) * BigInt(club.currentPrice), DECIMALS * 2);
    const liquidity = formatUnits(BigInt(club.liquidity), USDC_DECIMALS);

    const priceChange24h = club["24h"]
        ? (Number.parseFloat(formatUnits(BigInt(club["24h"].price), USDC_DECIMALS)) /
              Number.parseFloat(formatUnits(BigInt(club["24h"].prevPrice), USDC_DECIMALS)) -
              1) *
          100
        : 0;

    const priceChange6h = club["6h"]
        ? (Number.parseFloat(formatUnits(BigInt(club["6h"].price), USDC_DECIMALS)) /
              Number.parseFloat(formatUnits(BigInt(club["6h"].prevPrice), USDC_DECIMALS)) -
              1) *
          100
        : 0;

    const priceChange1h = club["1h"]
        ? (Number.parseFloat(formatUnits(BigInt(club["1h"].price), USDC_DECIMALS)) /
              Number.parseFloat(formatUnits(BigInt(club["1h"].prevPrice), USDC_DECIMALS)) -
              1) *
          100
        : 0;

    const priceChange5m = club["5m"]
        ? (Number.parseFloat(formatUnits(BigInt(club["5m"].price), USDC_DECIMALS)) /
              Number.parseFloat(formatUnits(BigInt(club["5m"].prevPrice), USDC_DECIMALS)) -
              1) *
          100
        : 0;

    let { name: clubName, symbol: clubSymbol } = club;

    if ((!club.name || !club.symbol) && club.tokenInfo) {
        [clubName, clubSymbol] = decodeAbiParameters(
            [
                { name: "name", type: "string" },
                { name: "symbol", type: "string" },
            ],
            club.tokenInfo as `0x${string}`
        );
    }

    return {
        name: clubName,
        symbol: clubSymbol,
        price: Number.parseFloat(price).toFixed(6),
        priceChange24h: priceChange24h.toFixed(2),
        priceChange6h: priceChange6h.toFixed(2),
        priceChange1h: priceChange1h.toFixed(2),
        priceChange5m: priceChange5m.toFixed(2),
        marketCap: marketCap,
        liquidity: Number.parseFloat(liquidity).toFixed(2),
        holders: club.holders,
        clubId: club.clubId,
        complete: club.complete,
        tokenAddress: club.tokenAddress,
        createdAt: club.createdAt,
        v2: club.v2,
        age: Math.floor((Date.now() / 1000 - Number.parseInt(club.createdAt)) / (60 * 60 * 24)),
    };
};

export const getTrendingClub = async (count = 1) => {
    try {
        const trades = await getLatestTrades();
        const grouped = groupBy(trades, "club.clubId");

        // Calculate volume for each club
        const clubVolumes = Object.entries(grouped).map(([clubId, trades]) => {
            const volume = (trades as any[]).reduce(
                (acc, trade) =>
                    acc + Number.parseFloat(formatUnits(BigInt(trade.price), USDC_DECIMALS)),
                0
            );
            return [
                clubId,
                {
                    trades: (trades as any[]).length,
                    volume,
                },
            ];
        });

        // Sort clubs by volume in descending order and take requested number
        type ClubVolume = [string, { trades: number; volume: number }];
        const trendingClubIds = clubVolumes
            .sort(([, dataA]: ClubVolume, [, dataB]: ClubVolume) => dataB.volume - dataA.volume)
            .slice(0, count)
            .map(([clubId]) => clubId);

        // Fetch and process all trending clubs in parallel
        const trendingClubs = await Promise.all(
            trendingClubIds.map(async (clubId: string) => {
                const club = await getRegisteredClubById(clubId);
                let { name, symbol, uri: image } = club;

                if ((!club.name || !club.symbol || !club.uri) && club.tokenInfo) {
                    [name, symbol, image] = decodeAbiParameters(
                        [
                            { name: "name", type: "string" },
                            { name: "symbol", type: "string" },
                            { name: "uri", type: "string" },
                        ],
                        club.tokenInfo
                    );
                }

                const volume =
                    (clubVolumes.find(([id]) => id === clubId) as ClubVolume | undefined)?.[1]
                        .volume || 0;
                const trades =
                    (clubVolumes.find(([id]) => id === clubId) as ClubVolume | undefined)?.[1]
                        .trades || 0;

                club.marketCap = formatUnits(
                    BigInt(club.supply) * BigInt(club.currentPrice),
                    DECIMALS
                ).split(".")[0];

                club.token = {
                    name,
                    symbol,
                    image,
                };

                club.volume = volume;
                club.trades = trades;

                return club;
            })
        );

        return count === 1 ? trendingClubs[0] : trendingClubs;
    } catch (e) {
        console.log(e);
        return count === 1 ? undefined : [];
    }
};

export const getRegisteredClubById = async (clubId: string) => {
    const id = toHexString(Number.parseInt(clubId));
    const now = Date.now();
    const twentyFourHoursAgo = Math.floor(now / 1000) - 24 * 60 * 60;
    const sixHoursAgo = Math.floor(now / 1000) - 6 * 60 * 60;
    const oneHourAgo = Math.floor(now / 1000) - 60 * 60;
    const fiveMinutesAgo = Math.floor(now / 1000) - 5 * 60;

    const client = subgraphClient();
    const { club } = await client.request<{ club: any }>(REGISTERED_CLUB, {
        id,
        twentyFourHoursAgo,
        sixHoursAgo,
        oneHourAgo,
        fiveMinutesAgo,
    });

    const prevTrade24h = club?.prevTrade24h ? club?.prevTrade24h[0] : {};
    const prevTrade6h = club?.prevTrade6h ? club?.prevTrade6h[0] : {};
    const prevTrade1h = club?.prevTrade1h ? club?.prevTrade1h[0] : {};
    const prevTrade5m = club?.prevTrade5m ? club?.prevTrade5m[0] : {};

    return {
        ...club,
        "24h": prevTrade24h,
        "6h": prevTrade6h,
        "1h": prevTrade1h,
        "5m": prevTrade5m,
    };
};

export const getRegisteredClubs = async (page = 0): Promise<{ clubs: any[]; hasMore: boolean }> => {
    const client = subgraphClient();
    const limit = 50;
    const skip = page * limit;

    try {
        const { clubs } = await client.request<{ clubs: any[] }>(REGISTERED_CLUBS, { skip });

        // Process clubs to set token and marketCap
        const processedClubs = clubs?.map((club) => {
            try {
                const { name, symbol, uri: image } = club;
                return {
                    ...club,
                    token: {
                        name,
                        symbol,
                        image,
                    },
                    marketCap: formatUnits(
                        BigInt(club.supply) * BigInt(club.currentPrice),
                        DECIMALS
                    ).split(".")[0],
                };
            } catch (e) {
                console.error("Error processing club:", e);
                return club;
            }
        });

        return {
            clubs: processedClubs || [],
            hasMore: clubs?.length === limit,
        };
    } catch (e) {
        console.error("Error fetching registered clubs:", e);
        return { clubs: [], hasMore: false };
    }
};

export const getVolumeStats = async () => {
    const twentyFourHoursAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
    let page = 0;
    let hasMore = true;
    let totalVolume = 0;
    let totalTrades = 0;

    while (hasMore) {
        const { trades, hasMore: hasMoreTrades } = await getAllTrades(page); // Empty string gets all trades

        // Filter trades from last 24h and calculate volume
        const recentTrades = trades.filter((trade) => trade.createdAt >= twentyFourHoursAgo);

        // If all trades in this batch are older than 24h, we can stop
        if (recentTrades.length === 0 && trades.length > 0) {
            hasMore = false;
            continue;
        }

        totalVolume += recentTrades.reduce(
            (acc, trade) => acc + Number.parseFloat(trade.txPrice),
            0
        );
        totalTrades += recentTrades.length;

        hasMore = hasMoreTrades;
        page++;
    }

    return {
        last24hVolume: Number.parseFloat(formatUnits(BigInt(totalVolume), USDC_DECIMALS)),
        tradeCount: totalTrades,
    };
};

export const getTrades = async (
    clubId: string,
    page = 0
): Promise<{ trades: any[]; hasMore: boolean }> => {
    const id = toHexString(Number.parseInt(clubId));
    const client = subgraphClient();
    const limit = 50;
    const skip = page * limit;

    const { trades } = await client.request<{ trades: any[] }>(CLUB_TRADES_PAGINATED, {
        club: id,
        skip,
    });

    return { trades: trades || [], hasMore: trades?.length === limit };
};

export const getAllTrades = async (page = 0): Promise<{ trades: any[]; hasMore: boolean }> => {
    const client = subgraphClient();
    const limit = 50;
    const skip = page * limit;

    const { trades } = await client.request<{ trades: any[] }>(ALL_CLUB_TRADES_PAGINATED, {
        skip,
    });

    return { trades: trades || [], hasMore: trades?.length === limit };
};

export const getLatestTrades = async (): Promise<any[]> => {
    const client = subgraphClient();
    const { trades } = await client.request<{ trades: any[] }>(CLUB_TRADES_LATEST);

    return trades || [];
};

export const searchToken = async (_query: string): Promise<any | undefined> => {
    const client = subgraphClient();
    const query = _query.replace("$", "");

    const { clubs } = await client.request<{ clubs: any[] }>(SEARCH_CLUBS, { query });
    const res = clubs
        ?.map((club) => {
            const { name, symbol, uri: image } = club;
            return { token: { name, symbol, image }, ...club };
        })
        .filter((c) => c);

    return res?.length ? res[0] : undefined;
};

export const toHexString = (id: number | string, minLength: number = 2): string => {
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
    const stringId = numericId.toString(16);
    return `0x${stringId.length === 3 ? stringId.padStart(4, "0") : stringId.padStart(2, "0")}`;
}