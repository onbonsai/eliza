import { base, zksync, polygon, baseSepolia } from "viem/chains";
import { IS_PRODUCTION } from "../services/utils";

export const BONSAI_TOKEN_ADDRESS_POLYGON =
    "0x3d2bd0e15829aa5c362a4144fdf4a1112fa29b5c";
export const BONSAI_TOKEN_ADDRESS_ZKSYNC =
    "0xB0588f9A9cADe7CD5f194a5fe77AcD6A58250f82";

export const BONSAI_TOKEN_ADDRESS_BASE = IS_PRODUCTION
    ? "0x474f4cb764df9da079D94052fED39625c147C12C"
    : "0x3d2bD0e15829AA5C362a4144FdF4A1112fa29B5c";

export const CHAIN_TO_RPC = {
    [base.id]: process.env.NEXT_PUBLIC_BASE_RPC,
    [baseSepolia.id]: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC,
    [zksync.id]: process.env.NEXT_PUBLIC_ZKSYNC_RPC,
    [polygon.id]: process.env.POLYGON_RPC_URL,
};
