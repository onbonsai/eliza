import { Wallet } from "@coinbase/coinbase-sdk"
import { LensClient, production, isRelaySuccess, LensTransactionStatusType } from "@lens-protocol/client"
import { hashMessage } from 'viem';
import { profile, ProfileOptions } from "@lens-protocol/metadata";

import { uploadJson } from "./ipfs.ts";

// update profile metadata owned by the wallet
export const updateProfile = async (wallet: Wallet, profileId: string, profileData: ProfileOptions, approveSignless?: boolean) => {
  // authenticate with api
  const client = new LensClient({ environment: production })
  const [address] = await wallet.listAddresses()
  const challenge = await client.authentication.generateChallenge({
    signedBy: address.getId(),
    for: profileId,
  })
  let signature = await wallet.createPayloadSignature(hashMessage(challenge.text));
  signature = await signature.wait();
  await client.authentication.authenticate({ id: challenge.id, signature: signature.getSignature() });

  // approve signless for all future txs
  if (approveSignless) {
    console.log('approving signless...');
    const typedDataResult = await client.profile.createChangeProfileManagersTypedData({
      approveSignless: true,
    });
    console.log(typedDataResult);
    const page = await client.profile.managers({
      for: profileId,
    });

    console.log(`page.items[0]?.isLensManager: ${page.items[0]?.isLensManager}`); // => true | false
    return page.items[0]?.isLensManager
  }

  const metadata = profile(profileData)
  const metadataURI = await uploadJson(metadata);
  const result = await client.profile.setProfileMetadata({ metadataURI });

  // handle authentication errors
  if (result.isFailure()) return false;

  const data = result.value;

  if (!isRelaySuccess(data)) return false;

  // wait for the tx to be mined and indexed
  const completion = await client.transaction.waitUntilComplete({ forTxId: data.txId });
  return completion?.status === LensTransactionStatusType.Complete;
};
