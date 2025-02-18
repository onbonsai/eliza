import {
    decodeEventLog,
    getAddress,
    http,
    createWalletClient,
    encodeAbiParameters,
    parseAbiParameters,
    type TransactionReceipt,
    type Chain,
    type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

interface GetEventFromReceiptProps {
    transactionReceipt: TransactionReceipt;
    contractAddress: `0x${string}`;
    abi: any;
    eventName: string;
}

export const encodeAbi = (types: string[], values: any[]) => {
    return encodeAbiParameters(parseAbiParameters(types.join(",")), values);
};

/**
 * return a decoded event object from `transactionReceipt`
 */
export const getEventFromReceipt = ({
    transactionReceipt,
    contractAddress,
    abi,
    eventName,
}: GetEventFromReceiptProps): { args?: any } => {
    const logs: any[] = contractAddress
        ? transactionReceipt.logs.filter(
              ({ address }) => getAddress(address) === getAddress(contractAddress)
          )
        : transactionReceipt.logs;

    return logs
        .map((l) => {
            try {
                return decodeEventLog({ abi, data: l.data, topics: l.topics });
            } catch {
                return {};
            }
        })
        .find((event: { eventName: string; args: any }) => event.eventName === eventName);
};

export const getWalletClient = (
    privateKey: `0x${string}`,
    chain: Chain,
    rpc?: string
): WalletClient => {
    const account = privateKeyToAccount(privateKey);
    return createWalletClient({ account, chain, transport: http(rpc) });
};