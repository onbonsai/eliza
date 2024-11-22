import { base, zksync, polygon } from "viem/chains";

export const AGENT_HANDLE = "bons_ai";
export const LENS_HUB_PROXY: `0x${string}` =
    "0xDb46d1Dc155634FbC732f92E853b10B288AD5a1d";
export const ASSET_ID_POL = "POL";
export const BONSAI_TOKEN_ADDRESS_POLYGON =
    "0x3d2bd0e15829aa5c362a4144fdf4a1112fa29b5c";
export const BONSAI_TOKEN_ADDRESS_BASE =
    "0x474f4cb764df9da079D94052fED39625c147C12C";
export const BONSAI_TOKEN_ADDRESS_ZKSYNC =
    "0xB0588f9A9cADe7CD5f194a5fe77AcD6A58250f82";

export const CHAIN_TO_RPC = {
    [base.id]: process.env.NEXT_PUBLIC_BASE_RPC,
    [zksync.id]: process.env.NEXT_PUBLIC_ZKSYNC_RPC,
    [polygon.id]: process.env.NEXT_PUBLIC_POLYGON_RPC,
};

export const CHAIN_TO_BONSAI = {
    [base.id]: BONSAI_TOKEN_ADDRESS_BASE,
    [zksync.id]: BONSAI_TOKEN_ADDRESS_ZKSYNC,
    [polygon.id]: BONSAI_TOKEN_ADDRESS_POLYGON,
};
