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
import { getEventFromReceipt, encodeAbi } from "../../utils/viem";
import { toHexString } from "../../utils/utils";
import { createClub } from "./database";
import { CHAIN_TO_RPC } from "../../utils/constants";

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
export const BENEFITS_AUTO_FEATURE_HOURS = 12;

export const USDC_CONTRACT_ADDRESS = IS_PRODUCTION
    ? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    : "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const DEFAULT_HOOK_ADDRESS = IS_PRODUCTION
    ? zeroAddress // TODO: mainnet address!
    : "0xA788031C591B6824c032a0EFe74837EE5eaeC080";
export const BONSAI_TOKEN_ZKSYNC_ADDRESS =
    "0xB0588f9A9cADe7CD5f194a5fe77AcD6A58250f82";
export const BONSAI_TOKEN_BASE_ADDRESS = IS_PRODUCTION
    ? "0x474f4cb764df9da079D94052fED39625c147C12C"
    : "0x3d2bD0e15829AA5C362a4144FdF4A1112fa29B5c";
export const BONSAI_NFT_ZKSYNC_ADDRESS =
    "0x40df0F8C263885093DCCEb4698DE3580FC0C9D49";
export const BONSAI_NFT_BASE_ADDRESS = IS_PRODUCTION
    ? "0xf060fd6b66B13421c1E514e9f10BedAD52cF241e"
    : "0xE9d2FA815B95A9d087862a09079549F351DaB9bd";

export const CONTRACT_CHAIN_ID = IS_PRODUCTION ? base.id : baseSepolia.id;

export const MONEY_CLUBS_SUBGRAPH_URL = `https://gateway.thegraph.com/api/${process.env.NEXT_PUBLIC_MONEY_CLUBS_SUBGRAPH_API_KEY}/subgraphs/id/E1jXM6QybxvtA71cbiFbyyQYJwn2AHJNk7AAH1frZVyc`;
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

export const getTrendingClub = async () => {
    try {
        const trades = await getLatestTrades();
        const grouped = groupBy(trades, "club.clubId");
        const trendingClubId = Object.keys(grouped).reduce((a, b) =>
            grouped[a].length > grouped[b].length ? a : b
        );

        const club = await getRegisteredClubById(trendingClubId);
        const [name, symbol, image] = decodeAbiParameters(
            [
                { name: "name", type: "string" },
                { name: "symbol", type: "string" },
                { name: "uri", type: "string" },
            ],
            club.tokenInfo
        );
        club.marketCap = formatUnits(
            BigInt(club.supply) * BigInt(club.currentPrice),
            DECIMALS
        ).split(".")[0];

        club.token = {
            name,
            symbol,
            image,
        };

        return club;
    } catch (e) {
        console.log(e);
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

type RegistrationParams = {
    pubId: string; // webhook post
    handle: string; // creator
    profileId: string; // creator
    tokenName: string;
    tokenSymbol: string;
    tokenDescription: string;
    tokenImage: string;
    initialSupply: string;
    curveType?: number; // default to 1
    strategy?: string; // default to "lens"
    featureStartAt?: number; // if the caller has a bonsai nft, Date.now()
};
export const registerClub = async (
    wallet: Wallet,
    recipient: `0x${string}`,
    params: RegistrationParams
): Promise<{ objectId?: string; clubId?: string }> => {
    const token = encodeAbi(
        ["string", "string", "string"],
        [params.tokenName, params.tokenSymbol, params.tokenImage]
    );
    const contractInvocation = await wallet.invokeContract({
        contractAddress: LAUNCHPAD_CONTRACT_ADDRESS,
        abi: BonsaiLaunchpadAbi,
        method: "registerClub",
        args: [
            DEFAULT_HOOK_ADDRESS,
            token,
            params.initialSupply,
            params.curveType ?? 1,
            recipient,
        ],
    });
    await contractInvocation.wait();
    const hash = contractInvocation.getTransactionHash();
    console.log(`tx: ${hash}`);
    const receipt: TransactionReceipt =
        await publicClient().waitForTransactionReceipt({
            hash: hash as `0x${string}`,
        });
    const event = getEventFromReceipt({
        contractAddress: LAUNCHPAD_CONTRACT_ADDRESS,
        transactionReceipt: receipt,
        abi: BonsaiLaunchpadAbi,
        eventName: "RegisteredClub",
    });
    let clubId;
    let objectId;
    if (receipt.status === "success") {
        clubId = event.args.clubId.toString();
        objectId = await createClub(clubId, {
            pubId: params.pubId,
            handle: params.handle,
            profileId: params.profileId,
            strategy: params.strategy ?? "lens",
            token: {
                name: params.tokenName,
                symbol: params.tokenSymbol,
                image: params.tokenImage,
                description: params.tokenDescription,
            },
            featureStartAt: params.featureStartAt,
        });
    }

    return { objectId, clubId };
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
