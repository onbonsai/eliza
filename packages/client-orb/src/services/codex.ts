
import { request, gql } from "graphql-request";

export const DEFAULT_NETWORK_EXPLORER_URL = "https://basescan.org";
const CODEX_API_URL = "https://graph.codex.io/graphql";
const DEFAULT_LIQUIDITY = 5_000; // TODO: increase once bonsai is up
const DEFAULT_MCAP = 1_000_000;
const DEFAULT_NETWORK_ID = 8453;
export const TOKEN_ID_TO_NAME = {
  8453: 'Base'
};

const FILTER_TOKENS = gql`
    query FilterTokens(
        $phrase: String!
        $networkId: Int!
        $liquidity: Float!
        $tokens: [String!]
        $marketCap: Float!
    ) {
        filterTokens(
            filters: {
                network: [$networkId]
                liquidity: { gt: $liquidity }
                marketCap: { gt: $marketCap }
            }
            tokens: $tokens
            phrase: $phrase
            limit: 10
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
    };
};
export const searchTokens = async (phrase: string, contractAddress?: string): Promise<TokenResult[]> => {
    try {
      const data = (await query(FILTER_TOKENS, {
          phrase,
          networkId: DEFAULT_NETWORK_ID,
          liquidity: contractAddress ? 0 : DEFAULT_LIQUIDITY,
          marketCap: contractAddress ? 0 : DEFAULT_MCAP,
          tokens: contractAddress
              ? [`${contractAddress}/${DEFAULT_NETWORK_ID}`]
              : undefined,
      })) as { filterTokens: { results: TokenResult[] } };

      return data.filterTokens?.results;
    } catch (error) {
      console.log(error);
      return [];
    }
};