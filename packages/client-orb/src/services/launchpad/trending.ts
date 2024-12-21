import { formatUnits } from "viem";
import { DECIMALS, getTrades, getTrendingClub } from "./utils";
import { getProfilesOwned } from "../lens/profiles";
import { LensPost, searchLensForTerm } from "../lens/search";

export const formatTrendingClubReport = (report: {
    trendingClub: any;
    analysis: TradeAnalysis;
    socialAnalysis: SocialAnalysis;
    creatorFollowers: number;
}) => {
    const { trendingClub, analysis, socialAnalysis, creatorFollowers } = report;

    const price = formatUnits(BigInt(trendingClub.currentPrice), DECIMALS);
    const marketCap = formatUnits(BigInt(trendingClub.marketCap), DECIMALS);
    const liquidity = formatUnits(BigInt(trendingClub.liquidity), DECIMALS);

    const priceChange24h = trendingClub["24h"]
        ? (parseFloat(
              formatUnits(BigInt(trendingClub["24h"].price), DECIMALS)
          ) /
              parseFloat(
                  formatUnits(BigInt(trendingClub["24h"].prevPrice), DECIMALS)
              ) -
              1) *
          100
        : 0;

    return `
🏆 Trending Bonsai Launchpad Token Report: ${trendingClub.token.name} ($${trendingClub.token.symbol})

📊 Market Stats
• Price: $${parseFloat(price).toFixed(6)} (${priceChange24h.toFixed(2)}% 24h)
• Market Cap: $${parseFloat(marketCap).toFixed(2)}
• Liquidity: $${parseFloat(liquidity).toFixed(2)}
• Holders: ${trendingClub.holders}

📈 Trading Activity (Last 200 trades)
• Buys: ${analysis.buyCount} ($${analysis.buyValueUSD.toFixed(2)})
• Sells: ${analysis.sellCount} ($${analysis.sellValueUSD.toFixed(2)})
• Buy Ratio: ${(analysis.buyProportion * 100).toFixed(1)}%

🗣 Social Activity
• ${socialAnalysis.postCount} posts with ${socialAnalysis.totalEngagement} total engagements
• Sentiment: ${socialAnalysis.sentiment}
• Creator Followers: ${creatorFollowers}
• Top Post: "${socialAnalysis.topPosts[0].content.replace(/https?:\/\/[^\s]+/g, "")}" - @${socialAnalysis.topPosts[0].by}
`;
};

export const createTrendingClubReport = async () => {
    const trendingClub = await getTrendingClub();

    if (!trendingClub) throw new Error("trending club could not be found");

    let allTrades = [];
    let hasMore = true;
    let page = 0;

    while (hasMore && page < 4) {
        // Fetch up to 200 trades (50 per page * 4 pages)
        const { trades, hasMore: moreAvailable } = await getTrades(
            trendingClub.id,
            page
        );
        allTrades = [...allTrades, ...trades];
        hasMore = moreAvailable;
        page++;
    }

    const analysis = analyzeTrades(allTrades);

    let creatorFollowers = 0;
    const profilesOwned = await getProfilesOwned(trendingClub.creator);
    if (profilesOwned && profilesOwned.length > 0) {
        for (const profile of profilesOwned) {
            creatorFollowers += profile.stats.followers;
        }
    }

    const symbolPosts = await searchLensForTerm(trendingClub.token.symbol);
    const namePosts = await searchLensForTerm(trendingClub.token.name);

    // Combine and deduplicate posts
    const allPosts = [...symbolPosts, ...namePosts].filter(
        (post, index, self) =>
            index === self.findIndex((p) => p.content === post.content)
    );

    const socialAnalysis = analyzeSocialEngagement(allPosts);

    return {
        trendingClub,
        analysis,
        socialAnalysis,
        creatorFollowers,
    };
};

interface Trade {
    isBuy: boolean;
    amount: string;
    price: string;
    txPrice: string;
    createdAt: string;
}

interface TradeAnalysis {
    buyCount: number;
    sellCount: number;
    buyVolume: number;
    sellVolume: number;
    buyValueUSD: number;
    sellValueUSD: number;
    buyProportion: number;
    sellProportion: number;
}

const analyzeTrades = (trades: Trade[]): TradeAnalysis => {
    const initial = {
        buyCount: 0,
        sellCount: 0,
        buyVolume: 0,
        sellVolume: 0,
        buyValueUSD: 0,
        sellValueUSD: 0,
    };

    const analysis = trades.reduce((acc, trade) => {
        const amount = parseInt(trade.amount);
        const valueUSD = parseInt(trade.txPrice);

        if (trade.isBuy) {
            acc.buyCount++;
            acc.buyVolume += amount;
            acc.buyValueUSD += valueUSD;
        } else {
            acc.sellCount++;
            acc.sellVolume += amount;
            acc.sellValueUSD += valueUSD;
        }

        return acc;
    }, initial);

    analysis.buyValueUSD = Number(
        formatUnits(BigInt(analysis.buyValueUSD), DECIMALS)
    );
    analysis.sellValueUSD = Number(
        formatUnits(BigInt(analysis.sellValueUSD), DECIMALS)
    );

    analysis.buyVolume = Number(
        formatUnits(BigInt(analysis.buyVolume), DECIMALS)
    );
    analysis.sellVolume = Number(
        formatUnits(BigInt(analysis.sellVolume), DECIMALS)
    );

    const totalTrades = analysis.buyCount + analysis.sellCount;

    return {
        ...analysis,
        buyProportion: totalTrades > 0 ? analysis.buyCount / totalTrades : 0,
        sellProportion: totalTrades > 0 ? analysis.sellCount / totalTrades : 0,
    };
};

interface SocialAnalysis {
    postCount: number;
    uniqueAuthors: number;
    totalEngagement: number;
    averageEngagementPerPost: number;
    sentiment: "Positive" | "Negative" | "Neutral";
    topPosts: {
        content: string;
        by: string;
        engagement: number;
    }[];
    summary: string;
}

const analyzeSocialEngagement = (posts: LensPost[]): SocialAnalysis => {
    // Get unique authors
    const uniqueAuthors = new Set(posts.map((post) => post.by)).size;

    // Calculate engagement metrics
    const postsWithEngagement = posts.map((post) => {
        const totalEngagement =
            post.stats.mirrors +
            post.stats.collects +
            post.stats.comments +
            post.stats.upvotes;

        return {
            ...post,
            totalEngagement,
        };
    });

    // Sort by engagement for top posts
    const topPosts = [...postsWithEngagement]
        .sort((a, b) => b.totalEngagement - a.totalEngagement)
        .slice(0, 3)
        .map((post) => ({
            content: post.content,
            by: post.by,
            engagement: post.totalEngagement,
        }));

    // Calculate total engagement
    const totalEngagement = postsWithEngagement.reduce(
        (sum, post) => sum + post.totalEngagement,
        0
    );

    // Simple sentiment analysis (you might want to use a proper NLP library in production)
    const positivePhrases = [
        "bullish",
        "moon",
        "gem",
        "great",
        "good",
        "up",
        "🚀",
        "💎",
    ];
    const negativePhrases = [
        "bearish",
        "scam",
        "dump",
        "bad",
        "down",
        "avoid",
        "⚠️",
        "🔻",
    ];

    let positiveCount = 0;
    let negativeCount = 0;

    posts.forEach((post) => {
        const lowerContent = post.content.toLowerCase();
        positivePhrases.forEach((phrase) => {
            if (lowerContent.includes(phrase.toLowerCase())) positiveCount++;
        });
        negativePhrases.forEach((phrase) => {
            if (lowerContent.includes(phrase.toLowerCase())) negativeCount++;
        });
    });

    const sentiment =
        positiveCount > negativeCount
            ? "Positive"
            : negativeCount > positiveCount
              ? "Negative"
              : "Neutral";

    return {
        postCount: posts.length,
        uniqueAuthors,
        totalEngagement,
        averageEngagementPerPost: totalEngagement / posts.length || 0,
        sentiment,
        topPosts,
        summary: `${posts.length} posts from ${uniqueAuthors} unique authors with ${totalEngagement} total engagements. Overall sentiment is ${sentiment.toLowerCase()}.`,
    };
};
