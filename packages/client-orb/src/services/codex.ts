import { request, gql } from "graphql-request";
import { getAddress } from "viem";
import { BONSAI_TOKEN_ADDRESS_BASE } from "../utils/constants.ts";

export const DEFAULT_NETWORK_EXPLORER_URL = "https://basescan.org";
const CODEX_API_URL = "https://graph.codex.io/graphql";
const DEFAULT_LIQUIDITY = 100_000; // TODO: increase once bonsai is up
const DEFAULT_MCAP = 1_000_000;
const DEFAULT_NETWORK_ID = 8453;
export const TOKEN_ID_TO_NAME = {
    8453: 'Base'
};

const HARDCODED_TOKENS_PER_CHAIN = {
    8453: [getAddress(BONSAI_TOKEN_ADDRESS_BASE)],
};

const FILTER_TOKENS = gql`
    query FilterTokens(
        $phrase: String!
        $networkId: Int!
        $liquidity: Float!
        $marketCap: Float!
    ) {
        filterTokens(
            filters: {
                network: [$networkId]
                liquidity: { gt: $liquidity }
                marketCap: { gt: $marketCap }
            }
            phrase: $phrase
            limit: 1
        ) {
            results {
                buyCount1
                high1
                txnCount1
                uniqueTransactions1
                volume1
                liquidity
                marketCap
                priceUSD
                pair {
                    token0
                    token1
                }
                exchanges {
                    name
                }
                token {
                    address
                    decimals
                    name
                    networkId
                    symbol
                    info {
                        imageSmallUrl
                    }
                }
            }
        }
    }
`;

const query = async (query, variables) => {
    return await request(CODEX_API_URL, query, variables, {
        authorization: process.env.CODEX_API_KEY,
    });
};

type TokenResult = {
    buyCount1: number;
    high1: number;
    txnCount1: number;
    uniqueTransactions1: number;
    volume1: number;
    liquidity: number;
    marketCap: number;
    priceUSD: number;
    pair: {
        token0: string;
        token1: string;
    };
    exchanges: {
        name: string;
    }[];
    token: {
        address: string;
        decimals: number;
        name: string;
        networkId: number;
        symbol: string;
        networkName?: string;
        info?: {
            imageSmallUrl?: string;
        };
    };
};
export const searchTokens = async (phrase: string, contractAddress?: string): Promise<TokenResult[]> => {
    try {
      if (phrase.toLowerCase() === "bonsai") { // HACK: until we have higher mcap
        contractAddress = getAddress(BONSAI_TOKEN_ADDRESS_BASE);
      }
      const data = (await query(FILTER_TOKENS, {
          phrase: contractAddress || phrase,
          liquidity: contractAddress ? 0 : DEFAULT_LIQUIDITY,
          networkId: DEFAULT_NETWORK_ID,
          marketCap: contractAddress ? 0 : DEFAULT_MCAP,
      })) as { filterTokens: { results: TokenResult[] } };

      const res = data.filterTokens?.results;

      // filter by hardcoded tokens
      const filteredRes = res?.find((tokenResult) =>
          HARDCODED_TOKENS_PER_CHAIN[DEFAULT_NETWORK_ID].includes(
              getAddress(tokenResult.token.address)
          )
      );

      return filteredRes ? [filteredRes] : res;
    } catch (error) {
      console.log(error);
      return [];
    }
};