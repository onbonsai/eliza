import { GraphQLClient, gql } from "graphql-request";
import {
    createPublicClient,
    http,
    parseUnits,
    formatEther,
    TransactionReceipt,
    zeroAddress,
    erc20Abi,
    maxUint256,
    decodeAbiParameters,
    formatUnits,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import pkg from "lodash/collection";
const { groupBy, reduce } = pkg;
import { Wallet } from "@coinbase/coinbase-sdk";
import BonsaiLaunchpadAbi from "./BonsaiLaunchpad";
import { toHexString } from "../../utils/utils";
import { CHAIN_TO_RPC } from "../../utils/constants";
import searchToken from "./searchToken";

export const IS_PRODUCTION = true; // NOTE: always true
export const CHAIN = IS_PRODUCTION ? base : baseSepolia;
export const LAUNCHPAD_CONTRACT_ADDRESS = IS_PRODUCTION
    ? "0xA44dD13Bd66C4C4aDF8F70c3DFA26334764C1d64"
    : "0x60aaa60eb9a11f3e82e2ca87631d4b37e1b88891";

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
            tokenInfo
            tokenAddress
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

const REGISTERED_CLUB_INFO = gql`
    query ClubInfo($ids: [Bytes!]!) {
        clubs(where: { id_in: $ids }) {
            id
            tokenInfo
            clubId
        }
    }
`;

const CLUB_TRADES_TODAY = gql`
    query ClubTrades($club: Bytes!, $startOfDayUTC: Int!, $skip: Int!) {
        trades(
            where: { club: $club, createdAt_gt: $startOfDayUTC }
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
        clubs(orderBy: supply, orderDirection: desc, first: 50, skip: $skip) {
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
            tokenInfo
            tokenAddress
        }
    }
`;

const HOLDINGS_PAGINATED = gql`
    query ClubChips($trader: Bytes!, $skip: Int!, $startOfDayUTC: Int!) {
        clubChips(
            where: { trader: $trader }
            orderBy: amount
            orderDirection: desc
            first: 50
            skip: $skip
        ) {
            id
            club {
                clubId
                prevTrade24Hr: trades(
                    where: { createdAt_gt: $startOfDayUTC }
                    orderBy: createdAt
                    orderDirection: asc
                    first: 1
                ) {
                    price
                    createdAt
                }
                complete
                tokenAddress
                tokenInfo
                currentPrice
            }
            amount
            createdAt
        }
    }
`;

const CLUB_HOLDINGS_PAGINATED = gql`
    query ClubChips($club: Bytes!, $skip: Int!) {
        clubChips(
            where: { club: $club }
            orderBy: amount
            orderDirection: desc
            first: 100
            skip: $skip
        ) {
            id
            club {
                clubId
            }
            trader {
                id
            }
            amount
            createdAt
        }
    }
`;

export const INITIAL_CHIP_SUPPLY_CAP = 10; // with 6 decimals in the contract
export const DECIMALS = 6;
export const USDC_DECIMALS = 6;
// this isn't likely to change
export const MIN_LIQUIDITY_THRESHOLD = IS_PRODUCTION
    ? BigInt(23005)
    : BigInt(10);

export const CONTRACT_CHAIN_ID = IS_PRODUCTION ? base.id : baseSepolia.id;

export const MONEY_CLUBS_SUBGRAPH_URL = `https://gateway.thegraph.com/api/${process.env.MONEY_CLUBS_SUBGRAPH_API_KEY}/subgraphs/id/E1jXM6QybxvtA71cbiFbyyQYJwn2AHJNk7AAH1frZVyc`;
// export const MONEY_CLUBS_SUBGRAPH_URL = "https://api.studio.thegraph.com/query/18207/bonsai-launchpad-base/version/latest"; // DEV URL
export const MONEY_CLUBS_SUBGRAPH_TESTNET_URL = `https://api.studio.thegraph.com/query/18207/bonsai-launchpad/version/latest`;

export function baseScanUrl(txHash: string) {
    return `https://${!IS_PRODUCTION ? "sepolia." : ""}basescan.org/tx/${txHash}`;
}

export const subgraphClient = () => {
    const uri = IS_PRODUCTION
        ? MONEY_CLUBS_SUBGRAPH_URL
        : MONEY_CLUBS_SUBGRAPH_TESTNET_URL;
    return new GraphQLClient(uri);
};

export const getTokenAnalytics = async (symbol: string) => {
    const clubId = await searchToken(symbol.replace("$", ""));
    if (!clubId) return null;

    const club = await getRegisteredClubById(clubId);
    if (!club) return null;

    const price = formatUnits(BigInt(club.currentPrice), DECIMALS);
    const marketCap = formatUnits(BigInt(club.marketCap), DECIMALS);
    const liquidity = formatUnits(BigInt(club.liquidity), DECIMALS);

    const priceChange24h = club["24h"]
        ? (parseFloat(formatUnits(BigInt(club["24h"].price), DECIMALS)) /
              parseFloat(formatUnits(BigInt(club["24h"].prevPrice), DECIMALS)) -
              1) *
          100
        : 0;

    return {
        name: club.token.name,
        symbol: club.token.symbol,
        price: parseFloat(price).toFixed(6),
        priceChange24h: priceChange24h.toFixed(2),
        marketCap: parseFloat(marketCap).toFixed(2),
        liquidity: parseFloat(liquidity).toFixed(2),
        holders: club.holders,
        clubId,
        complete: club.complete,
    };
};

export const getTrendingClub = async (count: number = 1) => {
    try {
        const trades = await getLatestTrades();
        const grouped = groupBy(trades, "club.clubId");

        // Calculate volume for each club
        const clubVolumes = Object.entries(grouped).map(([clubId, trades]) => {
            const volume = trades.reduce(
                (acc, trade) =>
                    acc +
                    parseFloat(formatUnits(BigInt(trade.price), DECIMALS)),
                0
            );
            return [
                clubId,
                {
                    trades: trades.length,
                    volume,
                },
            ];
        });

        // Sort clubs by volume in descending order and take requested number
        const trendingClubIds = clubVolumes
            .sort(([, dataA], [, dataB]) => dataB.volume - dataA.volume)
            .slice(0, count)
            .map(([clubId]) => clubId);

        // Fetch and process all trending clubs in parallel
        const trendingClubs = await Promise.all(
            trendingClubIds.map(async (clubId) => {
                const club = await getRegisteredClubById(clubId);
                const [name, symbol, image] = decodeAbiParameters(
                    [
                        { name: "name", type: "string" },
                        { name: "symbol", type: "string" },
                        { name: "uri", type: "string" },
                    ],
                    club.tokenInfo
                );

                const volume =
                    clubVolumes.find(([id]) => id === clubId)?.[1].volume || 0;
                const trades =
                    clubVolumes.find(([id]) => id === clubId)?.[1].trades || 0;

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
    const id = toHexString(parseInt(clubId));
    const now = Date.now();
    const twentyFourHoursAgo = Math.floor(now / 1000) - 24 * 60 * 60;
    const sixHoursAgo = Math.floor(now / 1000) - 6 * 60 * 60;
    const oneHourAgo = Math.floor(now / 1000) - 60 * 60;
    const fiveMinutesAgo = Math.floor(now / 1000) - 5 * 60;

    const client = subgraphClient();
    const { club } = await client.request(REGISTERED_CLUB, {
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

export const getRegisteredClubInfo = async (ids: string[]) => {
    const client = subgraphClient();
    const { clubs } = await client.request(REGISTERED_CLUB_INFO, { ids });

    return clubs?.map((club) => {
        const [name, symbol, image] = decodeAbiParameters(
            [
                { name: "name", type: "string" },
                { name: "symbol", type: "string" },
                { name: "uri", type: "string" },
            ],
            club.tokenInfo
        );
        return { name, symbol, image, clubId: club.clubId, id: club.id };
    });
};

export const getRegisteredClubs = async (
    page = 0
): Promise<{ clubs: any[]; hasMore: boolean }> => {
    const client = subgraphClient();
    const limit = 50;
    const skip = page * limit;

    try {
        const { clubs } = await client.request(REGISTERED_CLUBS, { skip });

        // Process clubs to decode tokenInfo
        const processedClubs = clubs?.map((club) => {
            try {
                const [name, symbol, image] = decodeAbiParameters(
                    [
                        { name: "name", type: "string" },
                        { name: "symbol", type: "string" },
                        { name: "uri", type: "string" },
                    ],
                    club.tokenInfo
                );

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
    const twentyFourHoursAgo = Math.floor(
        (Date.now() - 24 * 60 * 60 * 1000) / 1000
    );
    let page = 0;
    let hasMore = true;
    let totalVolume = 0;
    let totalTrades = 0;

    while (hasMore) {
        const { trades, hasMore: hasMoreTrades } = await getAllTrades(page); // Empty string gets all trades

        // Filter trades from last 24h and calculate volume
        const recentTrades = trades.filter(
            (trade) => trade.createdAt >= twentyFourHoursAgo
        );

        // If all trades in this batch are older than 24h, we can stop
        if (recentTrades.length === 0 && trades.length > 0) {
            hasMore = false;
            continue;
        }

        totalVolume += recentTrades.reduce(
            (acc, trade) => acc + parseFloat(trade.txPrice),
            0
        );
        totalTrades += recentTrades.length;

        hasMore = hasMoreTrades;
        page++;
    }

    return {
        last24hVolume: parseFloat(formatUnits(totalVolume, DECIMALS)),
        tradeCount: totalTrades,
    };
};

export const getVolume = async (clubId: string): Promise<bigint> => {
    const id = toHexString(parseInt(clubId));
    const startOfDayUTC = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
    const client = subgraphClient();
    const limit = 50;
    let skip = 0;
    let volume = 0n;
    let hasMore = true;

    while (hasMore) {
        const { trades } = await client.request(CLUB_TRADES_TODAY, {
            club: id,
            startOfDayUTC,
            skip,
        });

        if (!trades) hasMore = false;
        volume += reduce(
            trades,
            (sum, trade) => sum + BigInt(trade.txPrice),
            0n
        );

        if (trades.length < limit) {
            hasMore = false;
        } else {
            skip += limit;
        }
    }
    return volume;
};

export const getLiquidity = async (clubId: string) => {
    const client = publicClient();
    const [_, __, ___, ____, liquidity] = (await client.readContract({
        address: LAUNCHPAD_CONTRACT_ADDRESS,
        abi: BonsaiLaunchpadAbi,
        functionName: "registeredClubs",
        args: [clubId],
    })) as any[];

    return liquidity;
};

export const getTrades = async (
    clubId: string,
    page = 0
): Promise<{ trades: any[]; hasMore: boolean }> => {
    const id = toHexString(parseInt(clubId));
    const client = subgraphClient();
    const limit = 50;
    const skip = page * limit;

    const { trades } = await client.request(CLUB_TRADES_PAGINATED, {
        club: id,
        skip,
    });

    return { trades: trades || [], hasMore: trades?.length == limit };
};

export const getAllTrades = async (
    page = 0
): Promise<{ trades: any[]; hasMore: boolean }> => {
    const client = subgraphClient();
    const limit = 50;
    const skip = page * limit;

    const { trades } = await client.request(ALL_CLUB_TRADES_PAGINATED, {
        skip,
    });

    return { trades: trades || [], hasMore: trades?.length == limit };
};

export const getLatestTrades = async (): Promise<any[]> => {
    const client = subgraphClient();
    const { trades } = await client.request(CLUB_TRADES_LATEST);

    return trades || [];
};

export const getHoldings = async (
    account: `0x${string}`,
    page = 0
): Promise<{ holdings: any[]; hasMore: boolean }> => {
    const limit = 50;
    const skip = page * limit;
    const startOfDayUTC = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
    const client = subgraphClient();
    const { clubChips } = await client.request(HOLDINGS_PAGINATED, {
        trader: account.toLowerCase(),
        startOfDayUTC,
        skip,
    });

    const holdings =
        clubChips?.map((chips) => {
            const balance =
                parseFloat(formatUnits(chips.amount, DECIMALS)) *
                parseFloat(formatUnits(chips.club.currentPrice, USDC_DECIMALS));
            return { ...chips, balance };
        }) || [];

    return {
        holdings,
        hasMore: clubChips?.length == limit,
    };
};

export const getClubHoldings = async (
    clubId: string,
    page = 0
): Promise<{ holdings: any[]; hasMore: boolean }> => {
    const id = toHexString(parseInt(clubId));
    const limit = 100;
    const skip = page * limit;
    const client = subgraphClient();
    const { clubChips } = await client.request(CLUB_HOLDINGS_PAGINATED, {
        club: id,
        skip,
    });

    return {
        holdings: clubChips || [],
        hasMore: clubChips?.length == limit,
    };
};

export const publicClient = () => {
    const chain = IS_PRODUCTION ? base : baseSepolia;
    return createPublicClient({
        chain,
        transport: http(CHAIN_TO_RPC[chain.id]),
    });
};

export const getBalance = async (
    clubId: string,
    account: `0x${string}`
): Promise<bigint> => {
    const res = await publicClient().readContract({
        address: LAUNCHPAD_CONTRACT_ADDRESS,
        abi: BonsaiLaunchpadAbi,
        functionName: "balances",
        args: [clubId, account],
    });

    return res as bigint;
};

export const getBuyPrice = async (
    account: `0x${string}`,
    clubId: string,
    amount: string
): Promise<{ buyPrice: bigint; buyPriceAfterFees: bigint }> => {
    const amountWithDecimals = parseUnits(amount, DECIMALS);
    const client = publicClient();
    const buyPrice = await client.readContract({
        address: LAUNCHPAD_CONTRACT_ADDRESS,
        abi: BonsaiLaunchpadAbi,
        functionName: "getBuyPrice",
        args: [clubId, amountWithDecimals],
        account,
    });

    return {
        buyPrice: buyPrice as bigint,
        buyPriceAfterFees: 0n, // HACK
    };
};

export const getMarketCap = async (
    supply: string,
    curve: number | string
): Promise<bigint> => {
    console.log(supply, curve);
    const client = publicClient();
    const marketCap = await client.readContract({
        address: LAUNCHPAD_CONTRACT_ADDRESS,
        abi: BonsaiLaunchpadAbi,
        functionName: "getMcap",
        args: [supply, curve],
    });

    return marketCap as bigint;
};

const PROTOCOL_FEE = 0.03; // 3% total fees for non-NFT holders

export const getBuyAmount = async (
    account: `0x${string}`,
    clubId: string,
    spendAmount: string, // Amount in USDC user wants to spend
    hasNft = false
): Promise<{
    maxAllowed: bigint;
    buyAmount: bigint;
    excess: bigint;
    effectiveSpend: string;
}> => {
    const client = publicClient();

    // Convert spend amount to proper decimals
    const spendAmountBigInt = parseUnits(spendAmount, DECIMALS);

    // Get maximum allowed purchase and excess amount
    const [maxAllowed, excess] = (await client.readContract({
        address: LAUNCHPAD_CONTRACT_ADDRESS,
        abi: BonsaiLaunchpadAbi,
        functionName: "calculatePurchaseAllocation",
        args: [spendAmountBigInt, clubId],
        account,
    })) as [bigint, bigint];

    // Calculate effective spend (maxAllowed or full amount if no excess)
    const effectiveSpendBigInt = excess > 0n ? maxAllowed : spendAmountBigInt;

    // If user has NFT, use full amount. If not, reduce by fees
    const spendAfterFees = hasNft
        ? effectiveSpendBigInt
        : (effectiveSpendBigInt *
              BigInt(Math.floor((1 - PROTOCOL_FEE) * 10000))) /
          10000n;

    // Get token amount for the effective spend
    const buyAmount = (await client.readContract({
        address: LAUNCHPAD_CONTRACT_ADDRESS,
        abi: BonsaiLaunchpadAbi,
        functionName: "getTokensForSpend",
        args: [clubId, spendAfterFees],
        account,
    })) as bigint;

    return {
        maxAllowed,
        buyAmount,
        excess,
        effectiveSpend: formatUnits(effectiveSpendBigInt, DECIMALS),
    };
};

export const getSellPrice = async (
    account: `0x${string}`,
    clubId: string,
    amount: string
): Promise<{ sellPrice: bigint; sellPriceAfterFees: bigint }> => {
    const amountWithDecimals = parseUnits(amount, DECIMALS);
    const client = publicClient();

    const [sellPrice, sellPriceAfterFees] = await Promise.all([
        client.readContract({
            address: LAUNCHPAD_CONTRACT_ADDRESS,
            abi: BonsaiLaunchpadAbi,
            functionName: "getSellPrice",
            args: [clubId, amountWithDecimals],
            account,
        }) as Promise<bigint>,
        client.readContract({
            address: LAUNCHPAD_CONTRACT_ADDRESS,
            abi: BonsaiLaunchpadAbi,
            functionName: "getSellPriceAfterFees",
            args: [clubId, amountWithDecimals],
            account,
        }) as Promise<bigint>,
    ]);

    return {
        sellPrice,
        sellPriceAfterFees,
    };
};

export const calculatePriceDelta = (
    price: bigint,
    lastTradePrice: bigint
): { valuePct: number; positive?: boolean } => {
    if (lastTradePrice == 0n) return { valuePct: 0 };
    const priceDelta: bigint =
        price > lastTradePrice
            ? price - lastTradePrice
            : lastTradePrice - price;
    const priceDeltaPercentage =
        (parseFloat(formatEther(priceDelta)) * 100) /
        parseFloat(formatEther(lastTradePrice));
    return {
        valuePct: parseFloat(roundedToFixed(priceDeltaPercentage, 2)),
        positive: price > lastTradePrice,
    };
};

export const getFeesEarned = async (
    account: `0x${string}`
): Promise<bigint> => {
    const res = await publicClient().readContract({
        address: LAUNCHPAD_CONTRACT_ADDRESS,
        abi: BonsaiLaunchpadAbi,
        functionName: "feesEarned",
        args: [account],
    });

    return res as bigint;
};

export const buyChips = async (
    wallet: Wallet,
    recipient: `0x${string}`,
    clubId: string,
    buyAmount: string,
    clientAddress: `0x${string}` = zeroAddress
) => {
    const amountWithDecimals = parseUnits(buyAmount, DECIMALS);
    const contractInvocation = await wallet.invokeContract({
        contractAddress: LAUNCHPAD_CONTRACT_ADDRESS,
        abi: BonsaiLaunchpadAbi,
        method: "buyChips",
        args: [clubId, amountWithDecimals, clientAddress, recipient],
    });
    await contractInvocation.wait();
    const hash = contractInvocation.getTransactionHash();
    console.log(`tx: ${hash}`);
    const receipt: TransactionReceipt =
        await publicClient().waitForTransactionReceipt({
            hash: hash as `0x${string}`,
        });

    if (receipt.status === "reverted") throw new Error("Reverted");
};

export const sellChips = async (
    wallet: Wallet,
    clubId: string,
    sellAmount: string
) => {
    const amountWithDecimals = parseUnits(sellAmount, DECIMALS);
    const contractInvocation = await wallet.invokeContract({
        contractAddress: LAUNCHPAD_CONTRACT_ADDRESS,
        abi: BonsaiLaunchpadAbi,
        method: "sellChips",
        args: [clubId, amountWithDecimals, zeroAddress],
    });
    await contractInvocation.wait();
    const hash = contractInvocation.getTransactionHash();
    console.log(`tx: ${hash}`);
    const receipt: TransactionReceipt =
        await publicClient().waitForTransactionReceipt({
            hash: hash as `0x${string}`,
        });

    if (receipt.status === "reverted") throw new Error("Reverted");
};

export const approveToken = async (token: string, wallet: Wallet) => {
    const [address] = await wallet.listAddresses();
    const user = address.getId() as `0x${string}`;
    const allowance = await publicClient().readContract({
        address: token as `0x${string}`,
        abi: erc20Abi,
        functionName: "allowance",
        args: [user, LAUNCHPAD_CONTRACT_ADDRESS],
    });

    if (allowance == 0n) {
        const contractInvocation = await wallet.invokeContract({
            contractAddress: token,
            method: "approve",
            args: {
                spender: LAUNCHPAD_CONTRACT_ADDRESS,
                amount: maxUint256.toString(),
            },
            abi: erc20Abi,
        });

        const hash = contractInvocation.getTransactionHash();
        console.log(`tx: ${hash}`);
        await contractInvocation.wait();
    }
};

export const roundedToFixed = (input: number, digits = 4): string => {
    const rounder = Math.pow(10, digits);
    const value = Math.round(input * rounder) / rounder;
    return value.toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
};
