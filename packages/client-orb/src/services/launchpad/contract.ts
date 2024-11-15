import { ApolloClient, HttpLink, InMemoryCache, gql } from "@apollo/client";
import { createPublicClient, http, parseUnits, formatEther, TransactionReceipt, zeroAddress, erc20Abi, maxUint256, decodeAbiParameters } from "viem";
import { base, baseSepolia, zksync, zksyncSepoliaTestnet } from "viem/chains";
import { groupBy, reduce } from "lodash/collection";
import BonsaiLaunchpadAbi from "./BonsaiLaunchpad.ts";
import { getEventFromReceipt, encodeAbi } from "../../utils/viem.ts";
import { toHexString } from "../../utils/utils.ts";

const CHAIN_RPCS = {
  [base.id]: process.env.NEXT_PUBLIC_BASE_RPC,
  [baseSepolia.id]: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC,
  [zksync.id]: process.env.NEXT_PUBLIC_ZKSYNC_RPC,
  [zksyncSepoliaTestnet.id]: process.env.NEXT_PUBLIC_ZKSYNC_SEPOLIA_RPC,
};

export const IS_PRODUCTION = process.env.LAUNCHPAD_CHAIN_ID === "8453";
export const LAUNCHPAD_CONTRACT_ADDRESS = IS_PRODUCTION
  ? "0x924d2E0f77F692A86e48e199E4Bf348Ee2977a2c" // TODO: mainnet deployment
  : "0x924d2E0f77F692A86e48e199E4Bf348Ee2977a2c";

const REGISTERED_CLUB = gql`
  query Club($id: Bytes!, $startOfDayUTC: Int!) {
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
      complete
      completedAt
      tokenInfo
      tokenAddress
      creatorFees
      prevTrade: trades(where:{createdAt_gt: $startOfDayUTC}, orderBy: createdAt, orderDirection: asc, first: 1) {
        price
        prevPrice
        createdAt
      }
      chips {
        trader {
          id
        }
        amount
        createdAt
      }
    }
  }
`;

const REGISTERED_CLUB_INFO = gql`
  query ClubInfo($ids: [Bytes!]!) {
    clubs(where: { id_in: $ids }) {
      tokenInfo
      clubId
    }
  }
`;

const CLUB_TRADES_TODAY = gql`
  query ClubTrades($club: Bytes!, $startOfDayUTC: Int!, $skip: Int!) {
    trades(where: {club:$club,createdAt_gt: $startOfDayUTC}, orderBy: createdAt, orderDirection: desc, first: 50, skip: $skip) {
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
    trades(where: {club:$club}, orderBy: createdAt, orderDirection: desc, first: 50, skip: $skip) {
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

const REGISTERED_CLUBS = gql`
  query Clubs {
    clubs(orderBy: supply, orderDirection: desc, first: 50) {
      id
      clubId
      initialSupply
      createdAt
      supply
      feesEarned
      currentPrice
      marketCap
      complete
    }
  }
`;

const HOLDINGS_PAGINATED = gql`
  query ClubChips($trader: Bytes!, $skip: Int!, $startOfDayUTC: Int!) {
    clubChips(where:{ trader: $trader }, orderBy: amount, orderDirection: desc, first: 50, skip: $skip) {
      id
      club {
        clubId
        prevTrade: trades(where:{createdAt_gt: $startOfDayUTC}, orderBy: createdAt, orderDirection: asc, first: 1) {
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
    clubChips(where:{ club: $club }, orderBy: amount, orderDirection: desc, first: 100, skip: $skip) {
      id
      trader {
        id
      }
      amount
    }
  }
`;

export const INITIAL_CHIP_SUPPLY_CAP = 10; // with 6 decimals in the contract
export const DECIMALS = 6;
export const USDC_DECIMALS = 6;

export const USDC_CONTRACT_ADDRESS = IS_PRODUCTION
  ? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
  : "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const DEFAULT_HOOK_ADDRESS = IS_PRODUCTION
  ? ""
  : "0xA788031C591B6824c032a0EFe74837EE5eaeC080";
export const BONSAI_TOKEN_ZKSYNC_ADDRESS = "0xB0588f9A9cADe7CD5f194a5fe77AcD6A58250f82";
export const BONSAI_TOKEN_BASE_ADDRESS = IS_PRODUCTION
  ? "0x474f4cb764df9da079D94052fED39625c147C12C"
  : "0x3d2bD0e15829AA5C362a4144FdF4A1112fa29B5c"
export const BONSAI_NFT_ZKSYNC_ADDRESS = "0x40df0F8C263885093DCCEb4698DE3580FC0C9D49";
export const BONSAI_NFT_BASE_ADDRESS = IS_PRODUCTION
  ? "0xf060fd6b66B13421c1E514e9f10BedAD52cF241e"
  : "0xE9d2FA815B95A9d087862a09079549F351DaB9bd"

export const CONTRACT_CHAIN_ID = IS_PRODUCTION ? base.id : baseSepolia.id;

export const MONEY_CLUBS_SUBGRAPH_URL = `https://gateway-arbitrum.network.thegraph.com/api/${process.env.NEXT_PUBLIC_MONEY_CLUBS_SUBGRAPH_API_KEY}/subgraphs/id/ECHELoGXmU3uscig75SygTqkUhB414jNAHifd4WtpRoa`;
export const MONEY_CLUBS_SUBGRAPH_TESTNET_URL = `https://api.studio.thegraph.com/query/18207/bonsai-launchpad/version/latest`;

export function baseScanUrl(txHash: string) {
  return `https://${!IS_PRODUCTION ? "sepolia." : ""}basescan.org/tx/${txHash}`;
}

export const subgraphClient = () => {
  const uri = IS_PRODUCTION ? MONEY_CLUBS_SUBGRAPH_URL : MONEY_CLUBS_SUBGRAPH_TESTNET_URL;
  return new ApolloClient({
    ssrMode: typeof window === "undefined", // set to true for server-side rendering
    link: new HttpLink({ uri }),
    cache: new InMemoryCache(),
  });
};

// server-side
export const getRegisteredClubById = async (clubId: string) => {
  const id = toHexString(parseInt(clubId));
  const now = new Date();
  const startOfDayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0);
  const client = subgraphClient();
  const { data: { club } } = await client.query({ query: REGISTERED_CLUB, variables: { id, startOfDayUTC: Math.floor(startOfDayUTC / 1000) } })

  const prevTrade = club?.prevTrade[0] || {};

  return {
    ...club,
    prevTrade,
  };
};

export const getRegisteredClubInfo = async (ids: string[]) => {
  const client = subgraphClient();
  const { data: { clubs } } = await client.query({ query: REGISTERED_CLUB_INFO, variables: { ids } })
  return clubs?.map((club) => {
    const [name, symbol, image] = decodeAbiParameters([
      { name: 'name', type: 'string' }, { name: 'symbol', type: 'string' }, { name: 'uri', type: 'string' }
    ], club.tokenInfo);
    return { name, symbol, image, clubId: club.clubId };
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
    const { data: { trades } } = await client.query({
      query: CLUB_TRADES_TODAY,
      variables: { club: id, startOfDayUTC, skip }
    });

    if (!trades) hasMore = false;
    volume += reduce(trades, (sum, trade) => sum + BigInt(trade.txPrice), 0n);

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
  const [_, __, ___, ____, liquidity] = await client.readContract({
    address: LAUNCHPAD_CONTRACT_ADDRESS,
    abi: BonsaiLaunchpadAbi,
    functionName: "registeredClubs",
    args: [clubId],
  }) as any[];

  return liquidity;
};

export const getTrades = async (clubId: string, page = 0): Promise<{ trades: any[], hasMore: boolean }> => {
  const id = toHexString(parseInt(clubId));
  const client = subgraphClient();
  const limit = 50;
  const skip = page * limit;

  const { data: { trades } } = await client.query({
    query: CLUB_TRADES_PAGINATED,
    variables: { club: id, skip }
  });

  return { trades: trades || [], hasMore: trades?.length == limit };
};

export const getHoldings = async (account: `0x${string}`, page = 0): Promise<{ holdings: any[], hasMore: boolean }> => {
  const limit = 50;
  const skip = page * limit;
  const startOfDayUTC = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
  const client = subgraphClient();
  const { data: { clubChips } } = await client.query({
    query: HOLDINGS_PAGINATED, variables: { trader: account.toLowerCase(), startOfDayUTC, skip }
  });

  return { holdings: clubChips || [], hasMore: clubChips?.length == limit };
};

export const getClubHoldings = async (clubId: string, page = 0): Promise<{ holdings: any[], hasMore: boolean }> => {
  const id = toHexString(parseInt(clubId));
  const limit = 100;
  const skip = page * limit;
  const client = subgraphClient();
  const { data: { clubChips } } = await client.query({ query: CLUB_HOLDINGS_PAGINATED, variables: { club: id, skip } });
  return { holdings: clubChips || [], hasMore: clubChips?.length == limit };
};

// TODO: paginate, load creator profiles
export const getRegisteredClubs = async () => {
  const { data } = await subgraphClient().query({ query: REGISTERED_CLUBS });
  return data?.clubs;
};

export const publicClient = () => {
  const chain = IS_PRODUCTION ? base : baseSepolia;
  return createPublicClient({ chain, transport: http(CHAIN_RPCS[chain.id]) });
};

export const getBalance = async (clubId: string, account: `0x${string}`): Promise<bigint> => {
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
  amount: string,
): Promise<{ buyPrice: bigint; buyPriceAfterFees: bigint }> => {
  const amountWithDecimals = parseUnits(amount, DECIMALS);
  const client = publicClient();
  const [buyPrice, buyPriceAfterFees] = await Promise.all([
    client.readContract({
      address: LAUNCHPAD_CONTRACT_ADDRESS,
      abi: BonsaiLaunchpadAbi,
      functionName: "getBuyPrice",
      args: [clubId, amountWithDecimals],
      account
    }),
    client.readContract({
      address: LAUNCHPAD_CONTRACT_ADDRESS,
      abi: BonsaiLaunchpadAbi,
      functionName: "getBuyPriceAfterFees",
      args: [clubId, amountWithDecimals],
      account,
    }),
  ]);

  return {
    buyPrice: buyPrice as bigint,
    buyPriceAfterFees: buyPriceAfterFees as bigint,
  };
};

export const getSellPrice = async (
  account: `0x${string}`,
  clubId: string,
  amount: string,
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
    }),
    client.readContract({
      address: LAUNCHPAD_CONTRACT_ADDRESS,
      abi: BonsaiLaunchpadAbi,
      functionName: "getSellPriceAfterFees",
      args: [clubId, amountWithDecimals],
      account,
    }),
  ]);

  return {
    sellPrice: sellPrice as bigint,
    sellPriceAfterFees: sellPriceAfterFees as bigint,
  };
};

export const getRegistrationFee = async (
  amount: number,
  curve: number,
  account?: `0x${string}`
): Promise<bigint> => {
  const amountWithDecimals = parseUnits(amount.toString(), DECIMALS);
  const client = publicClient();
  return await client.readContract({
    address: LAUNCHPAD_CONTRACT_ADDRESS,
    abi: BonsaiLaunchpadAbi,
    functionName: "getRegistrationFee",
    args: [amountWithDecimals, curve],
    account
  }) as bigint;
};

export const calculatePriceDelta = (price: bigint, lastTradePrice: bigint): { valuePct: number; positive?: boolean } => {
  if (lastTradePrice == 0n) return { valuePct: 0 };
  const priceDelta: bigint = price > lastTradePrice ? price - lastTradePrice : lastTradePrice - price;
  const priceDeltaPercentage = parseFloat(formatEther(priceDelta)) * 100 / parseFloat(formatEther(price));
  return {
    valuePct: priceDeltaPercentage,
    positive: price > lastTradePrice,
  };
};

export const getFeesEarned = async (account: `0x${string}`): Promise<bigint> => {
  const res = await publicClient().readContract({
    address: LAUNCHPAD_CONTRACT_ADDRESS,
    abi: BonsaiLaunchpadAbi,
    functionName: "feesEarned",
    args: [account],
  });

  return res as bigint;
};

type RegistrationParams = {
  tokenName: string;
  tokenSymbol: string;
  tokenDescription: string;
  tokenImage: string;
  initialSupply: string;
  curveType: number;
  strategy: string;
  featureStartAt?: number;
};
export const registerClub = async (walletClient, params: RegistrationParams): Promise<{ objectId?: string, clubId?: string }> => {
  const token = encodeAbi(["string", "string", "string"], [params.tokenName, params.tokenSymbol, params.tokenImage]);
  const hash = await walletClient.writeContract({
    address: LAUNCHPAD_CONTRACT_ADDRESS,
    abi: BonsaiLaunchpadAbi,
    functionName: "registerClub",
    args: [DEFAULT_HOOK_ADDRESS, token, params.initialSupply, params.curveType],
    chain: IS_PRODUCTION ? base : baseSepolia,
    gas: 2_100_000
  });
  console.log(`tx: ${hash}`);

  // TODO: bring it up
  // const identityToken = await getAccessToken();
  // const response = await fetch('/api/clubs/update', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     strategy: params.strategy,
  //     identityToken,
  //     txHash: hash,
  //     token: { name: params.tokenName, symbol: params.tokenSymbol, image: params.tokenImage, description: params.tokenDescription },
  //     featureStartAt: params.featureStartAt
  //   })
  // });

  const receipt: TransactionReceipt = await publicClient().waitForTransactionReceipt({ hash });
  const event = getEventFromReceipt({
    contractAddress: LAUNCHPAD_CONTRACT_ADDRESS,
    transactionReceipt: receipt,
    abi: BonsaiLaunchpadAbi,
    eventName: "RegisteredClub",
  });
  const res = { objectId: (await response.json()).id as string, clubId: event.args.clubId.toString() };
  return receipt.status === "success" && response.ok ? res : {};
};

export const buyChips = async (walletClient: any, clubId: string, buyAmount: string) => {
  const [recipient] = await walletClient.getAddresses();
  const amountWithDecimals = parseUnits(buyAmount, DECIMALS);
  const hash = await walletClient.writeContract({
    address: LAUNCHPAD_CONTRACT_ADDRESS,
    abi: BonsaiLaunchpadAbi,
    functionName: "buyChips",
    args: [clubId, amountWithDecimals, zeroAddress, recipient],
    chain: IS_PRODUCTION ? base : baseSepolia,
  });
  console.log(`tx: ${hash}`);
  const receipt: TransactionReceipt = await publicClient().waitForTransactionReceipt({ hash });

  if (receipt.status === "reverted") throw new Error("Reverted");
};

export const sellChips = async (walletClient: any, clubId: string, sellAmount: string) => {
  const amountWithDecimals = parseUnits(sellAmount, DECIMALS);
  const hash = await walletClient.writeContract({
    address: LAUNCHPAD_CONTRACT_ADDRESS,
    abi: BonsaiLaunchpadAbi,
    functionName: "sellChips",
    args: [clubId, amountWithDecimals, zeroAddress],
    chain: IS_PRODUCTION ? base : baseSepolia,
  });
  console.log(`tx: ${hash}`);
  const receipt: TransactionReceipt = await publicClient().waitForTransactionReceipt({ hash });

  if (receipt.status === "reverted") throw new Error("Reverted");
};

export const approveToken = async (
  token: string,
  amount: bigint,
  walletClient: any,
  approveMessage = "Approving tokens...",
) => {
  const [user] = await walletClient.getAddresses();
  const client = publicClient();
  const allowance = await client.readContract({
    address: token as `0x${string}`,
    abi: erc20Abi,
    functionName: "allowance",
    args: [user, LAUNCHPAD_CONTRACT_ADDRESS],
  });

  if (allowance < amount) {
    const hash = await walletClient.writeContract({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [LAUNCHPAD_CONTRACT_ADDRESS, maxUint256],
    });
    console.log(`hash: ${hash}`)
    await client.waitForTransactionReceipt({ hash });
  }
};