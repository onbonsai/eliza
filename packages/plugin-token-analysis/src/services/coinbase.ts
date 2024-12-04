import { Coinbase, TransactionStatus, Wallet } from "@coinbase/coinbase-sdk";
import { Decimal } from "decimal.js";
import { decrypt, encrypt } from "../utils/crypto.ts";
import { getClient } from "./mongo.ts";

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

// swap and return transaction link
export const executeTrade = async (
    wallet: Wallet,
    tokenIn: string,
    tokenOut: string,
    amount: any
): Promise<{ link: string; toAmount: Decimal; txHash: string } | undefined> => {
    try {
        console.log("executeTrade", {
            amount,
            fromAssetId: tokenIn,
            toAssetId: tokenOut,
        });
        const trade = await wallet.createTrade({
            amount,
            fromAssetId: tokenIn,
            toAssetId: tokenOut,
        });
        console.log(`trade: ${trade.getId()}`);
        await trade.wait();

        const status = await trade.getStatus();
        if (status === TransactionStatus.COMPLETE) {
            const tx = await trade.getTransaction();
            const toAmount = await trade.getToAmount();
            return {
                link: tx.getTransactionLink(),
                toAmount,
                txHash: tx.getTransactionHash(),
            };
        }
    } catch (error) {
        console.log(error);
    }
};
