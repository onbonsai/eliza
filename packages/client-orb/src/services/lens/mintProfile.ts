import { zeroAddress } from "viem";
import { Wallet } from "@coinbase/coinbase-sdk";
import { isValidHandle } from "@lens-protocol/client";
import PermissionlessCreatorAbi from "./abi/PermissionlessCreator.ts";
import { getEventFromReceipt, getPublicClient } from "../../utils/viem.ts";
import { LENS_HUB_PROXY } from "../../utils/constants.ts";
import EventsEbi from "./abi/Events.ts";
import { bToHexString } from "../../utils/utils.ts";

const PERMISSIONLESS_CREATOR_ADDRESS = "0x0b5e6100243f793e480DE6088dE6bA70aA9f3872";

// mint a profile and return the created profileId
export const mintProfile = async (wallet: Wallet, handle: string) => {
  if (!isValidHandle(handle)) throw new Error(`invalid handle: ${handle}`);

  const [address] = await wallet.listAddresses()
  const args = {
    createProfileParams: [address.getId(), zeroAddress, "0x"],
    handle,
    delegatedExecutors: []
  };

  const contractInvocation = await wallet.invokeContract({
    contractAddress: PERMISSIONLESS_CREATOR_ADDRESS,
    method: "createProfileWithHandle",
    args,
    abi: PermissionlessCreatorAbi,
    assetId: "pol",
    amount: 8 // 8 POL to mint profile
  });

  await contractInvocation.wait();
  const hash = contractInvocation.getTransactionHash();
  console.log(`tx: ${hash}`);
  const transactionReceipt = await getPublicClient("polygon").waitForTransactionReceipt({
    hash: hash! as `0x${string}`,
  });

  const event = getEventFromReceipt({
    transactionReceipt: transactionReceipt!,
    contractAddress: LENS_HUB_PROXY,
    abi: EventsEbi,
    eventName: "ProfileCreated"
  });

  if (!event) throw new Error("profile created event not found");

  return {
    profileId: bToHexString(event.args?.profileId),
    txHash: hash
  };
};