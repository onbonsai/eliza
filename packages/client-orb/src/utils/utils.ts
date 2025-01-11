export const toHexString = (id: number) => {
    const profileHexValue = id.toString(16);
    return `0x${profileHexValue.length === 3 ? profileHexValue.padStart(4, "0") : profileHexValue.padStart(2, "0")}`;
};

export const bToHexString = (id: bigint) => {
    const profileHexValue = id.toString(16);
    return `0x${profileHexValue.length === 3 ? profileHexValue.padStart(4, "0") : profileHexValue.padStart(2, "0")}`;
};

// lens v2
export const handleBroadcastResult = (broadcastResult: any) => {
    const broadcastValue = broadcastResult.unwrap();

    if ("id" in broadcastValue || "txId" in broadcastValue) {
        // TODO: success?
        console.log(broadcastValue);
        return broadcastValue;
    } else {
        console.log(broadcastValue);
        throw new Error();
    }
};

export function tweetIntentTokenReferral({ url, text }) {
    return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURI(`${url}`)}`;
}

export function castIntentTokenReferral({ text, url }) {
    return `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURI(`${url}`)}`;
}

export function orbIntentTokenReferral({ text }) {
    const params = { text };
    return `https://orb.club/create-post?${new URLSearchParams(params).toString()}`;
}
