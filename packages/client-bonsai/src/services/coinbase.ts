import { Coinbase, Wallet } from "@coinbase/coinbase-sdk";
import { Chain, erc20Abi, maxUint256 } from "viem";
import { decrypt, encrypt } from "../utils/crypto.ts";
import { getClient } from "./mongo.ts";
import { getPublicClient } from "../utils/viem";

// lens profile
export type WalletProfile = { id: `0x${string}`; handle: string };
export const getWallets = async (
    agentId: string,
    create = false
): Promise<
    | {
          base: Wallet;
          polygon: Wallet;
          baseSepolia: Wallet;
          profile?: WalletProfile;
          adminProfileId: string;
      }
    | undefined
> => {
    Coinbase.configure({
        apiKeyName: process.env.COINBASE_API_NAME! as string,
        privateKey: process.env.COINBASE_API_PRIVATE_KEY!.replaceAll(
            "\\n",
            "\n"
        ) as string,
        // debugging: true
    });

    const { collection } = await getClient();

    let wallets: any;
    const walletData = await collection.findOne({ agentId });

    try {
        if (!walletData && create) {
            const [base, baseSepolia, polygon] = await Promise.all([
                Wallet.create({ networkId: Coinbase.networks.BaseMainnet }),
                Wallet.create({ networkId: Coinbase.networks.BaseSepolia }),
                Wallet.create({ networkId: Coinbase.networks.PolygonMainnet }),
            ]);

            wallets = {
                base,
                polygon,
                baseSepolia,
            };

            await collection.insertOne({
                agentId,
                wallets: {
                    base: encrypt(JSON.stringify(base.export())),
                    baseSepolia: encrypt(JSON.stringify(baseSepolia.export())),
                    polygon: encrypt(JSON.stringify(polygon.export())),
                },
            });
        } else if (walletData) {
            const [base, baseSepolia, polygon] = await Promise.all([
                Wallet.import(JSON.parse(decrypt(walletData.wallets.base))),
                Wallet.import(
                    JSON.parse(decrypt(walletData.wallets.baseSepolia))
                ),
                Wallet.import(JSON.parse(decrypt(walletData.wallets.polygon))),
            ]);

            wallets = {
                base,
                polygon,
                baseSepolia,
                profile: {
                    id: walletData.profileId,
                    handle: walletData.handle,
                },
                adminProfileId: walletData.adminProfileId,
            };
        }
    } catch (error) {
        console.log("Failed to load wallet", error);
    }

    return wallets;
};

export const approveToken = async (
    token: string,
    wallet: Wallet,
    user: `0x${string}`,
    spender: `0x${string}`,
    chain: Chain
) => {
    const client = getPublicClient(chain);
    const allowance = await client.readContract({
        address: token as `0x${string}`,
        abi: erc20Abi,
        functionName: "allowance",
        args: [user, spender],
    });

    if (allowance == 0n) {
        const contractInvocation = await wallet.invokeContract({
            contractAddress: token,
            method: "approve",
            args: { spender, amount: maxUint256.toString() },
            abi: erc20Abi,
        });

        const hash = contractInvocation.getTransactionHash();
        console.log(`tx: ${hash}`);
        await contractInvocation.wait();
    }
};
