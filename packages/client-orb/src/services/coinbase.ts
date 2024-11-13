import { Coinbase, Wallet } from "@coinbase/coinbase-sdk";
import { erc20Abi, maxUint256 } from "viem";
import { decrypt, encrypt } from "../utils/crypto.ts";
import { getClient } from "./mongo.ts";
import { getPublicClient } from "../utils/viem.ts";

// lens profile
export type WalletProfile = { id: `0x${string}`, handle: string }
export const getWallets = async (agentId: string, create = false): Promise<{ base: Wallet, polygon: Wallet, profile?: WalletProfile, adminProfileId: string } | undefined> => {
  Coinbase.configure({
    apiKeyName: process.env.COINBASE_API_NAME! as string,
    privateKey: process.env.COINBASE_API_PRIVATE_KEY!.replaceAll("\\n", "\n") as string,
    // debugging: true
  });

  const { collection } = await getClient();

  let wallets: any;
  const walletData = await collection.findOne({ agentId });

  try {
    if (!walletData && create) {
      const [base, polygon] = await Promise.all([
        Wallet.create({ networkId: Coinbase.networks.BaseSepolia }),
        Wallet.create({ networkId: Coinbase.networks.PolygonMainnet })
      ]);

      await collection.insertOne({
        agentId,
        wallets: {
          base: encrypt(JSON.stringify(base.export())),
          polygon: encrypt(JSON.stringify(polygon.export()))
        }
      });
    } else if (walletData) {
      const [base, polygon] = await Promise.all([
        Wallet.import(JSON.parse(decrypt(walletData.wallets.base))),
        Wallet.import(JSON.parse(decrypt(walletData.wallets.polygon)))
      ]);

      wallets = {
        base,
        polygon,
        profile: { id: walletData.profileId, handle: walletData.handle },
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
  operator: `0x${string}`,
  chain: string = "polygon"
) => {
  const user = wallet.getId() as `0x${string}`;
  const client = getPublicClient(chain);
  const allowance = await client.readContract({
    address: token as `0x${string}`,
    abi: erc20Abi,
    functionName: "allowance",
    args: [user, operator],
  });

  if (allowance == 0n) {
    const contractInvocation = await wallet.invokeContract({
      contractAddress: token,
      method: "approve",
      args: [operator, maxUint256],
      abi: erc20Abi,
    });

    const hash = contractInvocation.getTransactionHash();
    console.log(`tx: ${hash}`);
    await contractInvocation.wait();
  }
};