import { Post } from "@lens-protocol/client";
import type { SmartMedia } from "./types";

export const toHexString = (id: number) => {
    const profileHexValue = id.toString(16);
    return `0x${profileHexValue.length === 3 ? profileHexValue.padStart(4, "0") : profileHexValue.padStart(2, "0")}`;
};

export const bToHexString = (id: bigint) => {
    const profileHexValue = id.toString(16);
    return `0x${profileHexValue.length === 3 ? profileHexValue.padStart(4, "0") : profileHexValue.padStart(2, "0")}`;
};

export const isMediaStale = (media: SmartMedia): boolean => {
    const currentTime = Math.floor(new Date().getTime() / 1000);
    return currentTime - media.updatedAt > media.maxStaleTime;
};

export const getLatestComments = (media: SmartMedia, comments: Post[]): Post[] => (
    comments.filter((c: Post) => new Date(c.timestamp).getTime() > (media.updatedAt * 1000))
);

// collectors get 1 vote weight; > 1mil tokens is weight of 3
export const getVoteWeightFromBalance = (balance: bigint) => {
    if (balance === 0n) return 1;
    if (balance >= 1_000_000n) return 3;
    return 2;
}