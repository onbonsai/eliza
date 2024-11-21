import settings from "@ai16z/eliza/src/settings.ts";
import {
    IAgentRuntime,
    Memory,
    Provider,
    State,
} from "@ai16z/eliza/src/types.ts";
import {
    DexScreenerData,
    DexScreenerPair,
    HolderData,
    ProcessedTokenData,
    TokenSecurityData,
    TokenTradeData,
    Prices,
} from "../types/token.ts";
import * as fs from "fs";
import NodeCache from "node-cache";
import * as path from "path";
import { toBN } from "../bignumber.ts";

const PROVIDER_CONFIG = {
    BIRDEYE_API: "https://public-api.birdeye.so",
    MAX_RETRIES: 3,
    RETRY_DELAY: 2000,
    TOKEN_ADDRESSES: {
        SOL: "So11111111111111111111111111111111111111112",
        BTC: "qfnqNqs3nCAHjnyCgLRDbBtq4p2MtHZxw8YjSyYhPoL",
        ETH: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
        Example: "2weMjPLLybRMMva1fM3U31goWWrCpF59CHWNhnCJ9Vyh",
    },
    TOKEN_SECURITY_ENDPOINT: "/defi/token_security?address=",
    TOKEN_TRADE_DATA_ENDPOINT: "/defi/v3/token/trade-data/single?address=",
    DEX_SCREENER_API: "https://api.dexscreener.com/latest/dex/tokens/",
    MAIN_WALLET: "",
};

export class TokenProvider {
    private cache: NodeCache;
    private cacheDir: string;

    constructor(
        //  private connection: Connection,
        private readonly tokenAddress: string,
        private readonly chain: string
    ) {
        this.cache = new NodeCache({ stdTTL: 300 }); // 5 minutes cache
        const __dirname = path.resolve();

        // Find the 'eliza' folder in the filepath and adjust the cache directory path
        const elizaIndex = __dirname.indexOf("eliza");
        if (elizaIndex !== -1) {
            const pathToEliza = __dirname.slice(0, elizaIndex + 5); // include 'eliza'
            this.cacheDir = path.join(pathToEliza, "cache");
        } else {
            this.cacheDir = path.join(__dirname, "cache");
        }

        this.cacheDir = path.join(__dirname, "cache");
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir);
        }
    }

    private readCacheFromFile<T>(cacheKey: string): T | null {
        const filePath = path.join(this.cacheDir, `${cacheKey}.json`);
        console.log({ filePath });
        if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, "utf-8");
            const parsed = JSON.parse(fileContent);
            const now = Date.now();
            if (now < parsed.expiry) {
                console.log(
                    `Reading cached data from file for key: ${cacheKey}`
                );
                return parsed.data as T;
            } else {
                console.log(
                    `Cache expired for key: ${cacheKey}. Deleting file.`
                );
                fs.unlinkSync(filePath);
            }
        }
        return null;
    }

    private writeCacheToFile<T>(cacheKey: string, data: T): void {
        const filePath = path.join(this.cacheDir, `${cacheKey}.json`);
        const cacheData = {
            data: data,
            expiry: Date.now() + 300000, // 5 minutes in milliseconds
        };
        fs.writeFileSync(filePath, JSON.stringify(cacheData), "utf-8");
        console.log(`Cached data written to file for key: ${cacheKey}`);
    }

    private getCachedData<T>(cacheKey: string): T | null {
        // Check in-memory cache first
        const cachedData = this.cache.get<T>(cacheKey);
        if (cachedData) {
            return cachedData;
        }

        // Check file-based cache
        const fileCachedData = this.readCacheFromFile<T>(cacheKey);
        if (fileCachedData) {
            // Populate in-memory cache
            this.cache.set(cacheKey, fileCachedData);
            return fileCachedData;
        }

        return null;
    }

    private setCachedData<T>(cacheKey: string, data: T): void {
        // Set in-memory cache
        this.cache.set(cacheKey, data);

        // Write to file-based cache
        this.writeCacheToFile(cacheKey, data);
    }

    private async fetchWithRetry(
        url: string,
        options: RequestInit = {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any> {
        let lastError: Error;

        for (let i = 0; i < PROVIDER_CONFIG.MAX_RETRIES; i++) {
            try {
                const response = await fetch(url, {
                    ...options,
                    headers: {
                        Accept: "application/json",
                        "x-chain": this.chain,
                        "X-API-KEY": settings.BIRDEYE_API_KEY || "",
                        ...options.headers,
                    },
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(
                        `HTTP error! status: ${response.status}, message: ${errorText}`
                    );
                }

                const data = await response.json();
                return data;
            } catch (error) {
                console.error(`Attempt ${i + 1} failed:`, error);
                lastError = error as Error;
                if (i < PROVIDER_CONFIG.MAX_RETRIES - 1) {
                    const delay = PROVIDER_CONFIG.RETRY_DELAY * Math.pow(2, i);
                    console.log(`Waiting ${delay}ms before retrying...`);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    continue;
                }
            }
        }

        console.error(
            "All attempts failed. Throwing the last error:",
            lastError
        );
        throw lastError;
    }

    async fetchPrices(): Promise<Prices> {
        try {
            const cacheKey = "prices";
            const cachedData = this.getCachedData<Prices>(cacheKey);
            if (cachedData) {
                console.log("Returning cached prices.");
                return cachedData;
            }
            const { SOL, BTC, ETH } = PROVIDER_CONFIG.TOKEN_ADDRESSES;
            const tokens = [SOL, BTC, ETH];
            const prices: Prices = {
                solana: { usd: "0" },
                bitcoin: { usd: "0" },
                ethereum: { usd: "0" },
            };

            for (const token of tokens) {
                const response = await this.fetchWithRetry(
                    `${PROVIDER_CONFIG.BIRDEYE_API}/defi/price?address=${token}`,
                    {
                        headers: {
                            "x-chain": this.chain,
                        },
                    }
                );

                if (response?.data?.value) {
                    const price = response.data.value.toString();
                    prices[
                        token === SOL
                            ? "solana"
                            : token === BTC
                              ? "bitcoin"
                              : "ethereum"
                    ].usd = price;
                } else {
                    console.warn(`No price data available for token: ${token}`);
                }
            }
            this.setCachedData(cacheKey, prices);
            return prices;
        } catch (error) {
            console.error("Error fetching prices:", error);
            throw error;
        }
    }

    async fetchTokenSecurity(): Promise<TokenSecurityData> {
        const cacheKey = `tokenSecurity_${this.tokenAddress}`;
        const cachedData = this.getCachedData<TokenSecurityData>(cacheKey);
        if (cachedData) {
            console.log(
                `Returning cached token security data for ${this.tokenAddress}.`
            );
            return cachedData;
        }
        const url = `${PROVIDER_CONFIG.BIRDEYE_API}${PROVIDER_CONFIG.TOKEN_SECURITY_ENDPOINT}${this.tokenAddress}`;
        const data = await this.fetchWithRetry(url);

        if (!data?.success || !data?.data) {
            throw new Error("No token security data available");
        }

        const security: TokenSecurityData = data.data;
        this.setCachedData(cacheKey, security);
        console.log(`Token security data cached for ${this.tokenAddress}.`);

        return security;
    }

    async fetchTokenTradeData(): Promise<TokenTradeData> {
        const cacheKey = `tokenTradeData_${this.tokenAddress}`;
        const cachedData = this.getCachedData<TokenTradeData>(cacheKey);
        if (cachedData) {
            console.log(
                `Returning cached token trade data for ${this.tokenAddress}.`
            );
            return cachedData;
        }

        const url = `${PROVIDER_CONFIG.BIRDEYE_API}${PROVIDER_CONFIG.TOKEN_TRADE_DATA_ENDPOINT}${this.tokenAddress}`;
        const options = {
            method: "GET",
            headers: {
                accept: "application/json",
                "x-chain": this.chain,
                "X-API-KEY": settings.BIRDEYE_API_KEY || "",
            },
        };

        const data = await fetch(url, options)
            .then((res) => res.json())
            .catch((err) => console.error(err));

        if (!data?.success || !data?.data) {
            throw new Error("No token trade data available");
        }

        const tradeData: TokenTradeData = data.data;
        this.setCachedData(cacheKey, tradeData);
        return tradeData;
    }

    async fetchDexScreenerData(): Promise<DexScreenerData> {
        const cacheKey = `dexScreenerData_${this.tokenAddress}`;
        const cachedData = this.getCachedData<DexScreenerData>(cacheKey);
        if (cachedData) {
            console.log("Returning cached DexScreener data.");
            return cachedData;
        }

        const url = `https://api.dexscreener.com/latest/dex/search?q=${this.tokenAddress}`;
        try {
            console.log(
                `Fetching DexScreener data for token: ${this.tokenAddress}`
            );
            const data = await fetch(url)
                .then((res) => res.json())
                .catch((err) => {
                    console.error(err);
                });

            if (!data || !data.pairs) {
                throw new Error("No DexScreener data available");
            }

            const dexData: DexScreenerData = {
                schemaVersion: data.schemaVersion,
                pairs: data.pairs,
            };

            // Cache the result
            this.setCachedData(cacheKey, dexData);

            return dexData;
        } catch (error) {
            console.error(`Error fetching DexScreener data:`, error);
            return {
                schemaVersion: "1.0.0",
                pairs: [],
            };
        }
    }

    async searchDexScreenerData(
        symbol: string
    ): Promise<DexScreenerPair | null> {
        const cacheKey = `dexScreenerData_search_${symbol}`;
        const cachedData = this.getCachedData<DexScreenerData>(cacheKey);
        if (cachedData) {
            console.log("Returning cached search DexScreener data.");
            return this.getHighestLiquidityPair(cachedData);
        }

        const url = `https://api.dexscreener.com/latest/dex/search?q=${symbol}`;
        try {
            console.log(`Fetching DexScreener data for symbol: ${symbol}`);
            const data = await fetch(url)
                .then((res) => res.json())
                .catch((err) => {
                    console.error(err);
                    return null;
                });

            if (!data || !data.pairs || data.pairs.length === 0) {
                throw new Error("No DexScreener data available");
            }

            const dexData: DexScreenerData = {
                schemaVersion: data.schemaVersion,
                pairs: data.pairs,
            };

            // Cache the result
            this.setCachedData(cacheKey, dexData);

            // Return the pair with the highest liquidity and market cap
            return this.getHighestLiquidityPair(dexData);
        } catch (error) {
            console.error(`Error fetching DexScreener data:`, error);
            return null;
        }
    }

    getHighestLiquidityPair(dexData: DexScreenerData): DexScreenerPair | null {
        if (dexData.pairs.length === 0) {
            return null;
        }

        // Sort pairs by both liquidity and market cap to get the highest one
        return dexData.pairs.reduce((highestPair, currentPair) => {
            const currentLiquidity = currentPair.liquidity.usd;
            const currentMarketCap = currentPair.marketCap;
            const highestLiquidity = highestPair.liquidity.usd;
            const highestMarketCap = highestPair.marketCap;

            if (
                currentLiquidity > highestLiquidity ||
                (currentLiquidity === highestLiquidity &&
                    currentMarketCap > highestMarketCap)
            ) {
                return currentPair;
            }
            return highestPair;
        });
    }

    async analyzeHolderDistribution(
        tradeData: TokenTradeData
    ): Promise<string> {
        // Define the time intervals to consider (e.g., 30m, 1h, 2h)
        const intervals = [
            {
                period: "30m",
                change: tradeData.unique_wallet_30m_change_percent,
            },
            { period: "1h", change: tradeData.unique_wallet_1h_change_percent },
            { period: "2h", change: tradeData.unique_wallet_2h_change_percent },
            { period: "4h", change: tradeData.unique_wallet_4h_change_percent },
            { period: "8h", change: tradeData.unique_wallet_8h_change_percent },
            {
                period: "24h",
                change: tradeData.unique_wallet_24h_change_percent,
            },
        ];

        // Calculate the average change percentage
        const validChanges = intervals
            .map((interval) => interval.change)
            .filter(
                (change) => change !== null && change !== undefined
            ) as number[];

        if (validChanges.length === 0) {
            return "stable";
        }

        const averageChange =
            validChanges.reduce((acc, curr) => acc + curr, 0) /
            validChanges.length;

        const increaseThreshold = 10; // e.g., average change > 10%
        const decreaseThreshold = -10; // e.g., average change < -10%

        if (averageChange > increaseThreshold) {
            return "increasing";
        } else if (averageChange < decreaseThreshold) {
            return "decreasing";
        } else {
            return "stable";
        }
    }

    async fetchHolderList(): Promise<HolderData[]> {
        if (this.chain == "solana") return await this.fetchHolderListSolana();
        else return await this.fetchHolderListEvm();
    }

    async fetchHolderListEvm(): Promise<HolderData[]> {
        const cacheKey = `holderList_${this.tokenAddress}_${this.chain}`;
        const cachedData = this.getCachedData<HolderData[]>(cacheKey);
        if (cachedData) {
            console.log("Returning cached EVM holder list.");
            return cachedData;
        }

        const chainMap: Record<string, string> = {
            ethereum: "eth",
            base: "base",
            polygon: "polygon",
            arbitrum: "arbitrum",
            optimism: "optimism",
        };

        const chainName = chainMap[this.chain.toLowerCase()];
        if (!chainName) {
            throw new Error(`Unsupported chain: ${this.chain}`);
        }

        const moralisKey = settings.MORALIS_API_KEY;
        if (!moralisKey) {
            throw new Error("No Moralis API key provided");
        }

        try {
            const allHolders: HolderData[] = [];
            let cursor: string | undefined;
            const limit = 100; // Number of records per page
            let totalFetched = 0;
            const MAX_HOLDERS = 2500;

            do {
                console.log(
                    `Fetching EVM holders (${totalFetched}/${MAX_HOLDERS})`
                );

                const url = new URL(
                    `https://deep-index.moralis.io/api/v2.2/erc20/${this.tokenAddress}/owners`
                );
                url.searchParams.append("chain", chainName);
                url.searchParams.append("limit", limit.toString());
                url.searchParams.append("order", "DESC"); // This ensures we get the largest holders first
                if (cursor) {
                    url.searchParams.append("cursor", cursor);
                }

                const response = await fetch(url.toString(), {
                    headers: {
                        accept: "application/json",
                        "X-API-Key": moralisKey,
                    },
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(
                        `API error: ${data.message || response.statusText}`
                    );
                }

                const holders = (data.result || [])
                    .filter(
                        (holder: { balance: string }) => holder.balance !== "0"
                    )
                    .map(
                        (holder: {
                            owner_address: string;
                            balance: string;
                        }) => ({
                            address: holder.owner_address,
                            balance: holder.balance,
                        })
                    );

                if (holders.length === 0) {
                    break;
                }

                allHolders.push(...holders);
                totalFetched += holders.length;

                // Break if we've reached our maximum holders limit
                if (totalFetched >= MAX_HOLDERS) {
                    break;
                }

                cursor = data.cursor;

                // Add a small delay to avoid rate limiting
                await new Promise((resolve) => setTimeout(resolve, 200));
            } while (cursor);

            console.log(`Total EVM holders fetched: ${allHolders.length}`);

            // Cache the results
            this.setCachedData(cacheKey, allHolders);

            return allHolders;
        } catch (error) {
            console.error(
                `Error fetching EVM holder list for chain ${this.chain}:`,
                error
            );
            throw new Error(
                `Failed to fetch EVM holder list: ${error.message}`
            );
        }
    }

    async fetchHolderListSolana(): Promise<HolderData[]> {
        const cacheKey = `holderList_${this.tokenAddress}`;
        const cachedData = this.getCachedData<HolderData[]>(cacheKey);
        if (cachedData) {
            console.log("Returning cached holder list.");
            return cachedData;
        }

        const allHoldersMap = new Map<string, number>();
        let page = 1;
        const limit = 1500;
        let cursor;
        //HELIOUS_API_KEY needs to be added
        const url = `https://mainnet.helius-rpc.com/?api-key=${settings.HELIUS_API_KEY || ""}`;
        console.log({ url });

        try {
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const params = {
                    limit: limit,
                    displayOptions: {},
                    mint: this.tokenAddress,
                    cursor: cursor,
                };
                if (cursor != undefined) {
                    params.cursor = cursor;
                }
                console.log(`Fetching holders - Page ${page}`);
                if (page > 2) {
                    break;
                }
                const response = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        id: "helius-test",
                        method: "getTokenAccounts",
                        params: params,
                    }),
                });

                const data = await response.json();

                if (
                    !data ||
                    !data.result ||
                    !data.result.token_accounts ||
                    data.result.token_accounts.length === 0
                ) {
                    console.log(
                        `No more holders found. Total pages fetched: ${page - 1}`
                    );
                    break;
                }

                console.log(
                    `Processing ${data.result.token_accounts.length} holders from page ${page}`
                );

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                data.result.token_accounts.forEach((account: any) => {
                    const owner = account.owner;
                    const balance = parseFloat(account.amount);

                    if (allHoldersMap.has(owner)) {
                        allHoldersMap.set(
                            owner,
                            allHoldersMap.get(owner)! + balance
                        );
                    } else {
                        allHoldersMap.set(owner, balance);
                    }
                });
                cursor = data.result.cursor;
                page++;
            }

            const holders: HolderData[] = Array.from(
                allHoldersMap.entries()
            ).map(([address, balance]) => ({
                address,
                balance: balance.toString(),
            }));

            console.log(`Total unique holders fetched: ${holders.length}`);

            // Cache the result
            this.setCachedData(cacheKey, holders);

            return holders;
        } catch (error) {
            console.error("Error fetching holder list from Helius:", error);
            throw new Error("Failed to fetch holder list from Helius.");
        }
    }

    async filterHighValueHolders(
        tradeData: TokenTradeData
    ): Promise<Array<{ holderAddress: string; balanceUsd: string }>> {
        const holdersData = await this.fetchHolderList();

        const tokenPriceUsd = toBN(tradeData.price);

        const highValueHolders = holdersData
            .filter((holder) => {
                const balanceUsd = toBN(holder.balance).multipliedBy(
                    tokenPriceUsd
                );
                return balanceUsd.isGreaterThan(5);
            })
            .map((holder) => ({
                holderAddress: holder.address,
                balanceUsd: toBN(holder.balance)
                    .multipliedBy(tokenPriceUsd)
                    .toFixed(2),
            }));

        return highValueHolders;
    }

    async checkRecentTrades(tradeData: TokenTradeData): Promise<boolean> {
        return toBN(tradeData.volume_24h_usd).isGreaterThan(0);
    }

    async countHighSupplyHolders(
        securityData: TokenSecurityData
    ): Promise<number> {
        try {
            const ownerBalance = toBN(securityData.ownerBalance);
            const totalSupply = ownerBalance.plus(securityData.creatorBalance);

            const highSupplyHolders = await this.fetchHolderList();
            const highSupplyHoldersCount = highSupplyHolders.filter(
                (holder) => {
                    const balance = toBN(holder.balance);
                    return balance.dividedBy(totalSupply).isGreaterThan(0.02);
                }
            ).length;
            return highSupplyHoldersCount;
        } catch (error) {
            console.error("Error counting high supply holders:", error);
            return 0;
        }
    }

    async getProcessedTokenData(): Promise<ProcessedTokenData> {
        try {
            console.log(
                `Fetching security data for token: ${this.tokenAddress}`
            );
            const security = await this.fetchTokenSecurity();

            console.log(`Fetching trade data for token: ${this.tokenAddress}`);
            const tradeData = await this.fetchTokenTradeData();

            console.log(
                `Fetching DexScreener data for token: ${this.tokenAddress}`
            );
            const dexData = await this.fetchDexScreenerData();

            console.log(
                `Analyzing holder distribution for token: ${this.tokenAddress}`
            );
            const holderDistributionTrend =
                await this.analyzeHolderDistribution(tradeData);

            console.log(
                `Filtering high-value holders for token: ${this.tokenAddress}`
            );
            const highValueHolders =
                await this.filterHighValueHolders(tradeData);

            console.log(
                `Checking recent trades for token: ${this.tokenAddress}`
            );
            const recentTrades = await this.checkRecentTrades(tradeData);

            console.log(
                `Counting high-supply holders for token: ${this.tokenAddress}`
            );
            const highSupplyHoldersCount =
                await this.countHighSupplyHolders(security);

            console.log(
                `Determining DexScreener listing status for token: ${this.tokenAddress}`
            );
            const isDexScreenerListed = dexData.pairs.length > 0;
            const isDexScreenerPaid = dexData.pairs.some(
                (pair) => pair.boosts && pair.boosts.active > 0
            );

            const processedData: ProcessedTokenData = {
                security,
                tradeData,
                holderDistributionTrend,
                highValueHolders,
                recentTrades,
                highSupplyHoldersCount,
                dexScreenerData: dexData,
                isDexScreenerListed,
                isDexScreenerPaid,
            };

            // console.log("Processed token data:", processedData);
            return processedData;
        } catch (error) {
            console.error("Error processing token data:", error);
            throw error;
        }
    }

    async shouldTradeToken(): Promise<boolean> {
        try {
            const tokenData = await this.getProcessedTokenData();
            const { tradeData, security, dexScreenerData } = tokenData;
            const { ownerBalance, creatorBalance } = security;
            const { liquidity, marketCap } = dexScreenerData.pairs[0];
            const liquidityUsd = toBN(liquidity.usd);
            const marketCapUsd = toBN(marketCap);
            const totalSupply = toBN(ownerBalance).plus(creatorBalance);
            const ownerPercentage = toBN(ownerBalance).dividedBy(totalSupply);
            const creatorPercentage =
                toBN(creatorBalance).dividedBy(totalSupply);
            const top10HolderPercent = toBN(tradeData.volume_24h_usd).dividedBy(
                totalSupply
            );
            const priceChange24hPercent = toBN(
                tradeData.price_change_24h_percent
            );
            const priceChange12hPercent = toBN(
                tradeData.price_change_12h_percent
            );
            const uniqueWallet24h = tradeData.unique_wallet_24h;
            const volume24hUsd = toBN(tradeData.volume_24h_usd);
            const volume24hUsdThreshold = 1000;
            const priceChange24hPercentThreshold = 10;
            const priceChange12hPercentThreshold = 5;
            const top10HolderPercentThreshold = 0.05;
            const uniqueWallet24hThreshold = 100;
            const isTop10Holder = top10HolderPercent.gte(
                top10HolderPercentThreshold
            );
            const isVolume24h = volume24hUsd.gte(volume24hUsdThreshold);
            const isPriceChange24h = priceChange24hPercent.gte(
                priceChange24hPercentThreshold
            );
            const isPriceChange12h = priceChange12hPercent.gte(
                priceChange12hPercentThreshold
            );
            const isUniqueWallet24h =
                uniqueWallet24h >= uniqueWallet24hThreshold;
            const isLiquidityTooLow = liquidityUsd.lt(1000);
            const isMarketCapTooLow = marketCapUsd.lt(100000);
            return (
                isTop10Holder ||
                isVolume24h ||
                isPriceChange24h ||
                isPriceChange12h ||
                isUniqueWallet24h ||
                isLiquidityTooLow ||
                isMarketCapTooLow
            );
        } catch (error) {
            console.error("Error processing token data:", error);
            throw error;
        }
    }

    formatTokenData(data: ProcessedTokenData): string {
        let output = `**Token Security and Trade Report**\n`;
        output += `Token Address: ${this.tokenAddress}\n\n`;

        // Security Data
        output += `**Ownership Distribution:**\n`;
        output += `- Owner Balance: ${data.security.ownerBalance}\n`;
        output += `- Creator Balance: ${data.security.creatorBalance}\n`;
        output += `- Owner Percentage: ${data.security.ownerPercentage}%\n`;
        output += `- Creator Percentage: ${data.security.creatorPercentage}%\n`;
        output += `- Top 10 Holders Balance: ${data.security.top10HolderBalance}\n`;
        output += `- Top 10 Holders Percentage: ${data.security.top10HolderPercent}%\n\n`;

        // Trade Data
        output += `**Trade Data:**\n`;
        output += `- Holders: ${data.tradeData.holder}\n`;
        output += `- Unique Wallets (24h): ${data.tradeData.unique_wallet_24h}\n`;
        output += `- Price Change (24h): ${data.tradeData.price_change_24h_percent}%\n`;
        output += `- Price Change (12h): ${data.tradeData.price_change_12h_percent}%\n`;
        output += `- Volume (24h USD): $${toBN(data.tradeData.volume_24h_usd).toFixed(2)}\n`;
        output += `- Current Price: $${toBN(data.tradeData.price).toFixed(2)}\n\n`;

        // Holder Distribution Trend
        output += `**Holder Distribution Trend:** ${data.holderDistributionTrend}\n\n`;

        // High-Value Holders
        output += `**High-Value Holders (>$5 USD):**\n`;
        if (data.highValueHolders.length === 0) {
            output += `- No high-value holders found or data not available.\n`;
        } else {
            // data.highValueHolders.forEach((holder) => {
            //     output += `- ${holder.holderAddress}: $${holder.balanceUsd}\n`;
            // });
            output += `- There are at least ${data.highValueHolders.length} high value holders.\n`;
        }
        output += `\n`;

        // Recent Trades
        output += `**Recent Trades (Last 24h):** ${data.recentTrades ? "Yes" : "No"}\n\n`;

        // High-Supply Holders
        output += `**Holders with >2% Supply:** ${data.highSupplyHoldersCount}\n\n`;

        // DexScreener Status
        output += `**DexScreener Listing:** ${data.isDexScreenerListed ? "Yes" : "No"}\n`;
        if (data.isDexScreenerListed) {
            output += `- Listing Type: ${data.isDexScreenerPaid ? "Paid" : "Free"}\n`;
            output += `- Number of DexPairs: ${data.dexScreenerData.pairs.length}\n\n`;
            output += `**DexScreener Pairs:**\n`;
            data.dexScreenerData.pairs.forEach((pair, index) => {
                output += `\n**Pair ${index + 1}:**\n`;
                output += `- DEX: ${pair.dexId}\n`;
                output += `- URL: ${pair.url}\n`;
                output += `- Price USD: $${toBN(pair.priceUsd).toFixed(6)}\n`;
                output += `- Volume (24h USD): $${toBN(pair.volume.h24).toFixed(2)}\n`;
                output += `- Boosts Active: ${pair.boosts && pair.boosts.active}\n`;
                output += `- Liquidity USD: $${toBN(pair.liquidity.usd).toFixed(2)}\n`;
            });
        }
        output += `\n`;

        console.log("Formatted token data:", output);
        return output;
    }

    async getFormattedTokenReport(): Promise<string> {
        try {
            console.log("Generating formatted token report...");
            const processedData = await this.getProcessedTokenData();
            return this.formatTokenData(processedData);
        } catch (error) {
            console.error("Error generating token report:", error);
            return "Unable to fetch token information. Please try again later.";
        }
    }
}

const tokenAddress = PROVIDER_CONFIG.TOKEN_ADDRESSES.Example;
const chain = "base";
const tokenProvider: Provider = {
    get: async (
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        runtime: IAgentRuntime,
        _message: Memory,
        _state?: State
    ): Promise<string> => {
        try {
            const provider = new TokenProvider(tokenAddress, chain);
            return provider.getFormattedTokenReport();
        } catch (error) {
            console.error("Error fetching token data:", error);
            return "Unable to fetch token information. Please try again later.";
        }
    },
};

export { tokenProvider };
