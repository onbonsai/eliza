import { mainnet, PublicClient, testnet } from "@lens-protocol/client";
import { StorageClient } from "@lens-chain/storage-client";
import { chains } from "@lens-chain/sdk/viem";

export const IS_PRODUCTION = process.env.LENS_ENV === "production";

export const SAGE_HANDLE = IS_PRODUCTION ? "bons_ai" : "bons_ai_testnet";

export const client = PublicClient.create({
    environment: IS_PRODUCTION ? mainnet : testnet,
    origin: "https://eliza.onbons.ai",
});

export const storageClient = StorageClient.create();

export const LENS_CHAIN_ID = IS_PRODUCTION ? chains.mainnet.id : chains.testnet.id;
export const LENS_CHAIN = IS_PRODUCTION ? chains.mainnet : chains.testnet;