import { PublicClient, testnet } from "@lens-protocol/client-canary";
import {
    StorageClient,
    testnet as storageTestnet,
} from "@lens-protocol/storage-node-client";

export const client = PublicClient.create({
    environment: testnet,
    origin: "https://eliza.bonsai.meme", // ignored on browser
});

export const storageClient = StorageClient.create(storageTestnet);
