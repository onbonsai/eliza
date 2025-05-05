import { base, zksync, polygon, baseSepolia } from "viem/chains";
import { TemplateName } from "./types";
import { IS_PRODUCTION } from "../services/lens/client";

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
    [baseSepolia.id]: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC,
    [zksync.id]: process.env.NEXT_PUBLIC_ZKSYNC_RPC,
    [polygon.id]: process.env.POLYGON_RPC_URL,
};

export const CHAIN_TO_BONSAI = {
    [base.id]: BONSAI_TOKEN_ADDRESS_BASE,
    [baseSepolia.id]: "0x3d2bD0e15829AA5C362a4144FdF4A1112fa29B5c",
    [zksync.id]: BONSAI_TOKEN_ADDRESS_ZKSYNC,
    [polygon.id]: BONSAI_TOKEN_ADDRESS_POLYGON,
};

export const DEFAULT_MAX_STALE_TIME = 1800; // 30min for clients to wait before fetching updated content
export const DEFAULT_FREEZE_TIME = 259200; // 72h of no updates before a post is frozen

export const APP_ID = "BONSAI"; // lens post app id
export const BONSAI_CLIENT_VERSION = "1.0.0"; // bonsai client version
export const BONSAI_PROTOCOL_FEE_RECIPIENT = "0x21aF1185734D213D45C6236146fb81E2b0E8b821";

export const FREE_GENERATIONS_PER_HOUR = 1;

// only for stakers, no free generations (generally because they are expensive)
export const PREMIUM_TEMPLATES = [
    TemplateName.ADVENTURE_TIME_VIDEO,
];

// production / testnet
export const LENS_BONSAI_APP = IS_PRODUCTION
    ? "0x640c9184b31467C84096EB2829309756DDbB3f44"
    : "0x4Abd67c2c42ff2b8003C642D0d0e562A3F900805";
export const LENS_BONSAI_DEFAULT_FEED = IS_PRODUCTION
    ? "0x075083417a0e58cE665c7E0E9970187f4053928F"
    : "0xeCb72dCabFC9288CB96aA65042b9f9cF93d10DB1";
