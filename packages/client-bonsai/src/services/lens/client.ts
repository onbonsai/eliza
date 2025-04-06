import { mainnet, PublicClient, testnet } from "@lens-protocol/client";
import { StorageClient } from "@lens-chain/storage-client";

const IS_PRODUCTION = process.env.LENS_ENV === "production";

export const SAGE_HANDLE = IS_PRODUCTION ? "bons_ai" : "bons_ai_testnet";

export const client = PublicClient.create({
    environment: IS_PRODUCTION ? mainnet : testnet,
    origin: "https://eliza.bonsai.meme",
});

export const storageClient = StorageClient.create();

export const LENS_CHAIN_ID = 37111; // TODO: mainnet
