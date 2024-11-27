import {
    decodeEventLog,
    getAddress,
    TransactionReceipt,
    createPublicClient,
    http,
    Log,
    maxUint256,
    WalletClient,
    erc20Abi,
    Account,
    encodeAbiParameters,
    parseAbiParameters,
    Chain,
} from "viem";
import { base, polygon, zksync } from "viem/chains";
import { CHAIN_TO_RPC } from "./constants.ts";

interface GetEventFromReceiptProps {
  transactionReceipt: TransactionReceipt,
  contractAddress: `0x${string}`,
  abi: any,
  eventName: string
}

export const encodeAbi = (types: string[], values: any[]) => {
  return encodeAbiParameters(
    parseAbiParameters(types.join(',')),
    values
  );
};

/**
 * return a decoded event object from `transactionReceipt`
 */
export const getEventFromReceipt = ({
  transactionReceipt,
  contractAddress,
  abi,
  eventName
}: GetEventFromReceiptProps): { args?: any } => {
  const logs: any[] = contractAddress
    ? transactionReceipt.logs.filter(({ address }) => getAddress(address) === getAddress(contractAddress))
    : transactionReceipt.logs;

  return logs
    .map((l) => {
      try {
        return decodeEventLog({ abi, data: l.data, topics: l.topics });
      } catch { return {}; }
    })
    .find((event: { eventName: string, args: any}) => event.eventName === eventName);
};

export const getPublicClient = (chain: Chain) => {
  return createPublicClient({
      chain,
      transport: http(CHAIN_TO_RPC[chain.id]),
  });
}

export const approveToken = async (
  token: `0x${string}`,
  walletClient: WalletClient,
  account: Account,
  operator: `0x${string}`,
  chain: Chain
) => {
  const [user] = await walletClient.getAddresses();
  const client = getPublicClient(chain);
  const allowance = await client.readContract({
    address: token as `0x${string}`,
    abi: erc20Abi,
    functionName: "allowance",
    args: [user, operator],
  }) as unknown as bigint;

  if (allowance == 0n) {
    const hash = await walletClient.writeContract({
      account,
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [operator, maxUint256],
      chain: chain.name === "polygon" ? polygon : (chain.name === "base" ? base : zksync),
    });
    console.log(`hash: ${hash}`)
    await client.waitForTransactionReceipt({ hash });
  }
};