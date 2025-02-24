import { uri } from "@lens-protocol/client";
import { createAccountWithUsername, fetchAccount } from "@lens-protocol/client/actions";
import { account } from "@lens-protocol/metadata";
import { handleOperationWith } from "@lens-protocol/client/viem";
import type { Account } from "viem";
import { createWalletClient, http } from "viem";
import { client, LENS_APP_CONTRACT, storageClient } from "./client";
import { chains } from "@lens-network/sdk/viem";

interface MetadataParams {
  name: string;
  bio?: string;
}

const createProfile = async (signer: Account, username: string, _metadata: MetadataParams): Promise<`0x${string}`| undefined> => {
  console.log("client.login");
  const authenticated = await client.login({
    onboardingUser: {
      app: LENS_APP_CONTRACT,
      wallet: signer.address,
    },
    // @ts-ignore
    signMessage: (message) => signer.signMessage({ message }),
  });

  if (authenticated.isErr()) {
    console.error(authenticated.error);
    return;
  }

  const sessionClient = authenticated.value;
  const metadata = account(_metadata);

  const { uri: hash } = await storageClient.uploadAsJson(metadata);
  const walletClient = createWalletClient({
    chain: chains.testnet,
    account: signer,
    transport: http()
  });
  console.log("createAccountWithUsername");
  const result = await createAccountWithUsername(sessionClient, {
    username: { localName: username },
    metadataUri: uri(hash),
  }).andThen(handleOperationWith(walletClient));

  if (result.isOk()) {
    const result2 = await fetchAccount(client, {
      username: {
        localName: username,
      },
    });
    if (result2.isErr()) {
      console.log(
        "lens:: authenticate:: failed to fetch profile for:",
        username
      );
      return;
    }

    const account = result2.value;
    return account?.address;
  }

  console.error("createProfile:: failed:", result.error);
}

export default createProfile