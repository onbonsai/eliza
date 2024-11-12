import { Wallet } from "@coinbase/coinbase-sdk"
import { LensClient, development } from "@lens-protocol/client"
import { textOnly } from "@lens-protocol/metadata"

import { uploadJson } from "./ipfs"

const environment = development // TODO: production

// post to lens from the first profile in the wallet
export default async (wallet: Wallet, profileId: string, text: string, image?: string) => {
  // authenticate with api
  const client = new LensClient({
    environment,
  })
  const [address] = await wallet.listAddresses()
  const challenge = await client.authentication.generateChallenge({
    signedBy: address,
    for: profileId,
  })
  const signature = await wallet.signMessage(challenge.text)
  await client.authentication.authenticate({ id: challenge.id, signature })

  console.log(await client.authentication.isAuthenticated()) // => true

  // post
  if (image) {
    // TODO
  } else {
    const metadata = textOnly({
      content: text,
    })
    const metadataURI = await uploadJson(metadata)

    const result = await client.publication.postOnchain({
      contentURI: metadataURI,
    })
    console.log(result)
  }
}
