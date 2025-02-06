import { elizaLogger } from "@elizaos/core";
import {
    createPublicClient,
    http,
    parseUnits,
    type TransactionReceipt,
    zeroAddress,
    erc20Abi,
    maxUint256,
    Chain,
    type WalletClient,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import BonsaiLaunchpadAbi from "../utils/BonsaiLaunchpadAbi";
import { getEventFromReceipt, encodeAbi } from "../utils/viem";
import { DECIMALS, IS_PRODUCTION, CHAIN } from "./utils";

export const LAUNCHPAD_CONTRACT_ADDRESS = IS_PRODUCTION
    ? "0xb43a85C7369FA6535abCbBB9Da71f8eDCE067E03"
    : "0x717138EbACFbbD9787b84c220E7BDA230C93dfB8";
export const USDC_CONTRACT_ADDRESS = IS_PRODUCTION
    ? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    : "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const DEFAULT_HOOK_ADDRESS = IS_PRODUCTION
    ? "0x8dd4c756F183513850e874F7d1ffd0d7Cb498080"
    : "0xA788031C591B6824c032a0EFe74837EE5eaeC080";
export const BONSAI_TOKEN_ADDRESS_BASE = IS_PRODUCTION
    ? "0x474f4cb764df9da079D94052fED39625c147C12C"
    : "0x3d2bD0e15829AA5C362a4144FdF4A1112fa29B5c";

export const publicClient = () => {
    const chain = IS_PRODUCTION ? base : baseSepolia;
    // TODO: fetch from runtime
    const url = IS_PRODUCTION ? process.env.BASE_RPC_URL : process.env.BASE_SEPOLIA_RPC_URL;
    return createPublicClient({
        chain,
        transport: http(url),
    });
};

type CreateTokenParams = {
    tokenName: string;
    tokenSymbol: string;
    tokenImage: string;
    initialSupplyWei: string;
    hook?: `0x${string}`; // uni v4 hook to init the pool with
    cliffPercent?: number; // bps; default to 10% (1000)
    vestingDuration?: number; // seconds; default to 2 hours (7200)
};

export const createToken = async (
    walletClient: WalletClient,
    creator: `0x${string}`,
    params: CreateTokenParams
): Promise<{ txHash?: `0x${string}`; id?: string }> => {
    const tokenInfo = encodeAbi(
        ["string", "string", "string"],
        [params.tokenName, params.tokenSymbol, params.tokenImage]
    );
    const hash = await walletClient.writeContract({
        account: walletClient.account,
        address: LAUNCHPAD_CONTRACT_ADDRESS,
        abi: BonsaiLaunchpadAbi,
        functionName: "registerClub",
        args: [
            params.hook || DEFAULT_HOOK_ADDRESS,
            tokenInfo,
            params.initialSupplyWei,
            creator,
            (params.cliffPercent || 1000).toString(),
            (params.vestingDuration || 7200).toString(),
        ],
        chain: CHAIN,
    });
    console.log(`tx: ${hash}`);
    const receipt: TransactionReceipt = await publicClient().waitForTransactionReceipt({ hash });
    let id;
    if (receipt.status === "success") {
        const event = getEventFromReceipt({
            contractAddress: LAUNCHPAD_CONTRACT_ADDRESS,
            transactionReceipt: receipt,
            abi: BonsaiLaunchpadAbi,
            eventName: "RegisteredClub",
        });
        id = event.args.clubId;
    } else {
        elizaLogger.error("plugin-bonsai:: createToken:: ERROR - TX REVERTED");
    }

    return { id, txHash: hash };
};

// TODO: if registration cost is turned on, do something here (ie read value from subgraph)
export const getRegistrationFee = async (initialSupplyWei: string): Promise<bigint> => {
    const client = publicClient();
    return (await client.readContract({
        address: LAUNCHPAD_CONTRACT_ADDRESS,
        abi: BonsaiLaunchpadAbi,
        functionName: "getBuyPrice",
        args: [0n, initialSupplyWei],
    })) as bigint;
};

export const getBuyPrice = async (id: string, buyAmountWei: string): Promise<bigint> => {
    const client = publicClient();
    return (await client.readContract({
        address: LAUNCHPAD_CONTRACT_ADDRESS,
        abi: BonsaiLaunchpadAbi,
        functionName: "getBuyPriceByClub",
        args: [id, buyAmountWei],
    })) as bigint;
};

export const getTokenBalance = async (
    account: `0x${string}`,
    token: `0x${string}` = USDC_CONTRACT_ADDRESS
): Promise<bigint> => {
    const client = publicClient();
    return (await client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
    })) as bigint;
};

export const buyTokens = async (
    walletClient: WalletClient,
    recipient: `0x${string}`,
    id: string,
    buyAmountWei: string,
    maxPrice: string,
    clientAddress: `0x${string}` = zeroAddress,
    referral: `0x${string}` = zeroAddress
) => {
    const hash = await walletClient.writeContract({
        account: walletClient.account,
        address: LAUNCHPAD_CONTRACT_ADDRESS,
        abi: BonsaiLaunchpadAbi,
        functionName: "buyChips",
        args: [id, buyAmountWei, maxPrice, clientAddress, recipient, referral],
        chain: CHAIN,
    });
    console.log(`tx: ${hash}`);
    const receipt: TransactionReceipt = await publicClient().waitForTransactionReceipt({
        hash: hash as `0x${string}`,
    });

    if (receipt.status === "reverted") {
        elizaLogger.error("plugin-bonsai:: buyTokens:: ERROR - TX REVERTED");
    }
};

export const sellTokens = async (
    walletClient: WalletClient,
    id: string,
    sellAmount: string,
    minAmountOut: string
) => {
    const amountWithDecimals = parseUnits(sellAmount, DECIMALS);
    const hash = await walletClient.writeContract({
        account: walletClient.account,
        address: LAUNCHPAD_CONTRACT_ADDRESS,
        abi: BonsaiLaunchpadAbi,
        functionName: "sellChips",
        args: [id, amountWithDecimals, minAmountOut, zeroAddress],
        chain: CHAIN,
    });
    console.log(`tx: ${hash}`);
    const receipt: TransactionReceipt = await publicClient().waitForTransactionReceipt({
        hash: hash as `0x${string}`,
    });

    if (receipt.status === "reverted") {
        elizaLogger.error("plugin-bonsai:: sellTokens:: ERROR - TX REVERTED");
    }
};

export const approveToken = async (
    walletClient: WalletClient,
    token: `0x${string}`,
    amountWei?: bigint
) => {
    const [account] = await walletClient.getAddresses();
    const allowance = await publicClient().readContract({
        address: token as `0x${string}`,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account, LAUNCHPAD_CONTRACT_ADDRESS],
    });

    if (allowance === 0n) {
        const hash = await walletClient.writeContract({
            account,
            address: token,
            functionName: "approve",
            args: [LAUNCHPAD_CONTRACT_ADDRESS, amountWei || maxUint256],
            abi: erc20Abi,
            chain: CHAIN,
        });

        const receipt: TransactionReceipt = await publicClient().waitForTransactionReceipt({
            hash: hash as `0x${string}`,
        });

        if (receipt.status === "reverted") {
            elizaLogger.error("plugin-bonsai:: approveToken:: ERROR - TX REVERTED");
        }
    }
};
