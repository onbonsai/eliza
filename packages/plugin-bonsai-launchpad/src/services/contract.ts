import { parseUnits, TransactionReceipt, zeroAddress, erc20Abi } from "viem";
import { Wallet } from "@coinbase/coinbase-sdk";
import BonsaiLaunchpadAbi from "./BonsaiLaunchpad";
import { getEventFromReceipt, encodeAbi } from "../utils/viem";
import { elizaLogger } from "@elizaos/core";
import {
    DECIMALS,
    IS_PRODUCTION,
    LAUNCHPAD_CONTRACT_ADDRESS,
    publicClient,
} from "./utils";

export const USDC_CONTRACT_ADDRESS = IS_PRODUCTION
    ? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    : "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const DEFAULT_HOOK_ADDRESS = IS_PRODUCTION
    ? zeroAddress
    : "0xA788031C591B6824c032a0EFe74837EE5eaeC080";

type RegistrationParams = {
    pubId: string; // webhook post
    handle: string; // creator
    profileId: string; // creator
    tokenName: string;
    tokenSymbol: string;
    tokenDescription: string;
    tokenImage: string;
    initialSupply: string;
    strategy?: string; // default to "lens"
    cliffPercent?: number; // bps; default to 10% (1000)
    vestingDuration?: number; // seconds; default to 2 hours (7200)
};

export const registerClub = async (
    wallet: Wallet,
    creator: `0x${string}`,
    params: RegistrationParams
): Promise<{ objectId?: string; clubId?: string }> => {
    const tokenInfo = encodeAbi(
        ["string", "string", "string"],
        [params.tokenName, params.tokenSymbol, params.tokenImage]
    );
    const contractInvocation = await wallet.invokeContract({
        contractAddress: LAUNCHPAD_CONTRACT_ADDRESS,
        abi: BonsaiLaunchpadAbi,
        method: "registerClub",
        args: {
            hook: DEFAULT_HOOK_ADDRESS,
            tokenInfo,
            initialSupply: params.initialSupply,
            creator,
            cliffPercent: params.cliffPercent || 1000,
            vestingDuration: params.vestingDuration || 7200,
        },
    });
    await contractInvocation.wait();
    const hash = contractInvocation.getTransactionHash();
    console.log(`tx: ${hash}`);
    const receipt: TransactionReceipt =
        await publicClient().waitForTransactionReceipt({
            hash: hash as `0x${string}`,
        });
    let clubId;
    if (receipt.status === "success") {
        const event = getEventFromReceipt({
            contractAddress: LAUNCHPAD_CONTRACT_ADDRESS,
            transactionReceipt: receipt,
            abi: BonsaiLaunchpadAbi,
            eventName: "RegisteredClub",
        });
        clubId = event.args.clubId;
    } else {
        elizaLogger.error("contract::registerClub ERROR - TX FAILED");
    }

    return { clubId };
};

// TODO: if registration fee is turned on do something here
export const getRegistrationFee = async (
    amountEther: string,
    account?: `0x${string}`
): Promise<bigint> => {
    const amountWithDecimals = parseUnits(amountEther, DECIMALS);
    const client = publicClient();
    return (await client.readContract({
        address: LAUNCHPAD_CONTRACT_ADDRESS,
        abi: BonsaiLaunchpadAbi,
        functionName: "getBuyPrice",
        args: [amountWithDecimals, "0"],
        account,
    })) as bigint;
};

export const getTokenBalance = async (
    account: `0x${string}`,
    token = USDC_CONTRACT_ADDRESS
): Promise<bigint> => {
    const client = publicClient();
    return (await client.readContract({
        address: token as `0x${string}`,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
    })) as bigint;
};
