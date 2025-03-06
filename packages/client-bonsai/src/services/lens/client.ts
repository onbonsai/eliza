import { PublicClient, testnet } from "@lens-protocol/client";
import { StorageClient } from "@lens-chain/storage-client";

export const client = PublicClient.create({
    environment: testnet,
    origin: "https://eliza.bonsai.meme",
});

export const storageClient = StorageClient.create();

export const LENS_APP_CONTRACT = "0xaC19aa2402b3AC3f9Fe471D4783EC68595432465"; // TODO: create one for bonsai

export const LENS_CHAIN_ID = 37111; // TODO: mainnet