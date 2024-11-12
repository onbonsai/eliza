import { Wallet } from "@coinbase/coinbase-sdk"
import { hashTypedData, hashMessage } from 'viem';
import { LensClient, production, LensTransactionStatusType, ChangeProfileManagerActionType } from "@lens-protocol/client"

// update profile metadata owned by the wallet
export const addDelegators = async (wallet: Wallet, profileId: string, delegators) => {
  // authenticate with api
  const client = new LensClient({ environment: production })
  const [address] = await wallet.listAddresses()
  const challenge = await client.authentication.generateChallenge({
    signedBy: address.getId(),
    for: profileId,
  })
  // @ts-ignore
  let signature = await wallet.createPayloadSignature(hashMessage(challenge.text));
  signature = await signature.wait();
  await client.authentication.authenticate({ id: challenge.id, signature: signature.getSignature() });

  console.log('authenticated?', await client.authentication.isAuthenticated()) // => true

  // create the typed data
  const typedDataResult = await client.profile.createChangeProfileManagersTypedData({
    changeManagers: delegators.map((address) => ({
      action: ChangeProfileManagerActionType.Add,
      address
    }))
  });

  // handle authentication errors
  if (typedDataResult.isFailure()) return false;

  const data = typedDataResult.unwrap();

  const signatureTyped = await wallet.createPayloadSignature(hashTypedData({
    domain: {
      ...data.typedData.domain,
      verifyingContract: data.typedData.domain.verifyingContract as `0x${string}`
    },
    types: data.typedData.types,
    // @ts-ignore
    message: data.typedData.value,
    primaryType: 'ChangeDelegatedExecutorsConfig'
  }));

  // broadcast
  const broadcastResult = await client.transaction.broadcastOnchain({
    id: data.id,
    signature: signatureTyped.getSignature()
  });

  // handle authentication errors
  if (broadcastResult.isFailure()) return false;

  const broadcastResultValue = broadcastResult.value;
  console.log('broadcastResultValue', broadcastResultValue);

  // wait for the tx to be mined and indexed
  // @ts-ignore
  const completion = await client.transaction.waitUntilComplete({ forTxId: broadcastResultValue.txId });
  return completion?.status === LensTransactionStatusType.Complete;
};
