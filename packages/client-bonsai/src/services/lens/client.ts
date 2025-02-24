import { PublicClient, testnet } from "@lens-protocol/client";
import {
    StorageClient,
    testnet as storageTestnet,
} from "@lens-protocol/storage-node-client";

export const client = PublicClient.create({
    environment: testnet,
    origin: "https://eliza.bonsai.meme",
});

export const storageClient = StorageClient.create(storageTestnet);

export const LENS_APP_CONTRACT = "0xaC19aa2402b3AC3f9Fe471D4783EC68595432465"; // TODO: create one for bonsai