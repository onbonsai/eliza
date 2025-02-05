import { decodeAbiParameters, formatEther, formatUnits } from "viem";
import {
    USDC_DECIMALS,
    getAllTrades,
    getRegisteredClubs,
    getTrendingClub,
    getVolumeStats,
} from "./utils";

export const formatActiveTokenAnalytics = (analytics: any) => {
    return (
        `${analytics.name} (${analytics.symbol}) Stats:\n` +
        `• Price: $${analytics.price}\n` +
        `• Market Cap: $${analytics.marketCap}\n` +
        `• Liquidity: $${analytics.liquidity}\n` +
        `• Holders: ${analytics.holders}\n\n` +
        `• Age: ${analytics.age} days\n` +
        `• ${analytics.priceChange24h}% 24h\n` +
        `• ${analytics.priceChange6h}% 6h\n` +
        `• ${analytics.priceChange1h}% 1h\n` +
        `• ${analytics.priceChange5m}% 5m\n` +
        `Trade now: https://launch.bonsai.meme/token/${analytics.clubId}`
    );
};

export const getTopGainersAnalytics = async () => {
    let response;
    const now = Math.floor(Date.now() / 1000);
    const twentyFourHoursAgo = now - 24 * 60 * 60;

    // Get all trades from last 24h
    let allTrades = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
        const { trades, hasMore: moreAvailable } = await getAllTrades(page);
        const recentTrades = trades.filter((trade) => trade.createdAt >= twentyFourHoursAgo);

        // If we've gone past 24h trades, stop
        if (recentTrades.length < trades.length) {
            allTrades = [...allTrades, ...recentTrades];
            break;
        }

        allTrades = [...allTrades, ...trades];
        hasMore = moreAvailable;
        page++;
    }

    // Group trades by club and find first/last prices
    const clubPrices = allTrades.reduce(
        (acc, trade) => {
            const clubId = trade.club.clubId;
            if (!acc[clubId]) {
                acc[clubId] = {
                    clubId,
                    tokenInfo: trade.club.tokenInfo,
                    name: trade.club.name,
                    symbol: trade.club.symbol,
                    uri: trade.club.uri,
                    v2: trade.club.v2,
                    firstTrade: trade,
                    lastTrade: trade,
                    complete: trade.club.complete,
                };
            } else {
                if (trade.createdAt < acc[clubId].firstTrade.createdAt) {
                    acc[clubId].firstTrade = trade;
                }
                if (trade.createdAt > acc[clubId].lastTrade.createdAt) {
                    acc[clubId].lastTrade = trade;
                }
            }
            return acc;
        },
        {} as Record<string, any>
    );

    // Calculate price changes and decode symbols
    const gainers = Object.values(clubPrices)
        .filter((club: any) => !club.complete)
        .map((club: any) => {
            let symbol = club.symbol;
            if (!symbol && club.tokenInfo) {
                [, symbol] = decodeAbiParameters(
                    [
                        { name: "name", type: "string" },
                        { name: "symbol", type: "string" },
                        { name: "uri", type: "string" },
                    ],
                    club.tokenInfo
                );
            }

            const startPrice = Number.parseFloat(
                formatUnits(BigInt(club.firstTrade.price), USDC_DECIMALS)
            );
            const endPrice = Number.parseFloat(
                formatUnits(BigInt(club.lastTrade.price), USDC_DECIMALS)
            );
            const priceChange = (endPrice / startPrice - 1) * 100;

            return {
                symbol,
                priceChange,
                currentPrice: endPrice,
            };
        })
        .sort((a, b) => b.priceChange - a.priceChange)
        .slice(0, 5);

    response = "Top gainers in the last 24h:\n";
    gainers.forEach((token, i) => {
        response += `${i + 1}. $${token.symbol}: ${token.priceChange.toFixed(2)}% ($${token.currentPrice.toFixed(6)})\n`;
    });
    return response;
};

export const getLiquidityAnalytics = async () => {
    let response;
    const { clubs } = await getRegisteredClubs();
    const liquid = clubs.sort((a, b) => Number(b.liquidity) - Number(a.liquidity)).slice(0, 5);

    response = "Tokens with highest liquidity:\n";
    liquid.forEach((club, i) => {
        const liquidity = formatUnits(BigInt(club.liquidity), USDC_DECIMALS);
        response += `${i + 1}. $${club.token.symbol}: $${kFormatter(Number.parseFloat(liquidity))}\n`;
    });
    return response;
};

export const getHoldersAnalytics = async () => {
    let response;
    const { clubs } = await getRegisteredClubs();
    const byHolders = clubs
        .filter((club) => !club.complete)
        .sort((a, b) => Number(b.holders) - Number(a.holders))
        .slice(0, 5);

    response = "Active tokens with most holders:\n";
    byHolders.forEach((club, i) => {
        response += `${i + 1}. $${club.token.symbol}: ${club.holders} holders\n`;
    });
    return response;
};

export const getDailyStatsAnalytics = async () => {
    let response;
    const stats = await getVolumeStats();
    const { clubs } = await getRegisteredClubs();
    const newTokens = clubs.filter((c) => Date.now() - c.createdAt * 1000 < 24 * 60 * 60 * 1000);

    response = `Last 24 hours on the launchpad:\n`;
    response += `• Trading Volume: $${stats.last24hVolume}\n`;
    response += `• Number of Trades: ${stats.tradeCount}\n`;
    response += `• New Tokens Created: ${newTokens.length}\n`;
    if (newTokens.length > 0) {
        response += `\nNewest tokens:\n`;
        newTokens.slice(0, 3).forEach((token) => {
            response += `• $${token.token.symbol}\n`;
        });
    }
    return response;
};

export const getVolumeAnalytics = async () => {
    const stats = await getVolumeStats();
    return `Trading volume in the last 24h: $${stats.last24hVolume} across ${stats.tradeCount} trades`;
};

export const getTrendingAnalytics = async () => {
    let response;
    const trending = await getTrendingClub(5);
    response = "Top trending tokens by volume:\n";
    trending.forEach((data, index) => {
        const symbol = data.token?.symbol || data.id;
        // Since the volume isn't in the current data structure, we'll use marketCap or liquidity
        const volume = kFormatter(
            Number.parseFloat(formatUnits(BigInt(data.liquidity), USDC_DECIMALS))
        );
        response += `${index + 1}. $${symbol}: $${volume} liquidity\n`;
    });
    return response;
};

export const getNewestTokensAnalytics = async () => {
    let response;
    const { clubs } = await getRegisteredClubs();
    const latestFive = clubs.sort((a, b) => Number(b.createdAt) - Number(a.createdAt)).slice(0, 5);

    response = "Latest tokens created:\n";
    latestFive.forEach((club, index) => {
        let { name, symbol } = club;

        if (!name && !symbol && club.tokenInfo) {
            [name, symbol] = decodeAbiParameters(
                [
                    { name: "name", type: "string" },
                    { name: "symbol", type: "string" },
                    { name: "uri", type: "string" },
                ],
                club.tokenInfo
            );
        }

        response += `${index + 1}. $${symbol}\n`;
        response += `   • Created: ${new Date(club.createdAt * 1000).toLocaleString()}\n`;
        response += `   • Initial Supply: ${kFormatter(Number.parseFloat(formatEther(BigInt(club.initialSupply))))}\n`;
    });
    return response;
};

const kFormatter = (num: number): string => {
    if (Math.abs(num) > 999_999) {
        // @ts-ignore
        return `${Math.sign(num) * (Math.abs(num) / 1_000_000).toFixed(1)}mil`;
    }

    if (Math.abs(num) > 999) {
        // @ts-ignore
        return `${Math.sign(num) * (Math.abs(num) / 1000).toFixed(1)}k`;
    }

    return `${Math.sign(num) * Math.abs(num)}`;
};
