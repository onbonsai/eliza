import { hashMessage } from "viem";
import { Wallet } from "@coinbase/coinbase-sdk"
import axios from 'axios';
import { LensClient, production } from "@lens-protocol/client";
import OrbAttestationAbi from "./abi/OrbAttestation.ts";
import { BONSAI_TOKEN_ADDRESS_POLYGON } from "../../utils/constants.ts";
import { approveToken } from "../coinbase.ts";

const ORB_API_URL = "https://us-central1-stellar-verve-314311.cloudfunctions.net/ORBV2-BOT-tipping";
const ORB_ATTESTATION_CONTRACT_ADDRES = "0xa8208529573e32b0aec07565fa8bc3cd01115449"; // polygon

// tip a publication with bonsai on polygon
export const tipPublication = async (wallet: Wallet, profileId: string, publicationId: string, amount: number, content?: string) => {
  const client = new LensClient({ environment: production });

  const [address] = await wallet.listAddresses()
  const challenge = await client.authentication.generateChallenge({
    signedBy: address.getId(),
    for: profileId,
  })
  let signature = await wallet.createPayloadSignature(hashMessage(challenge.text));
  signature = await signature.wait();
  await client.authentication.authenticate({ id: challenge.id, signature: signature.getSignature() });

  // prepare orb api params
  const [toProfileId] = publicationId.split("-");
  const orbApiParams = {
    task: "get",
    toProfileId,
    currency: {
      logo: "https://media.orb.ac/thumbnailDimension256/https://gw.ipfs-lens.dev/ipfs/QmexUB3qvejAXK9ZdGzLsotpoTUTPz1SJabAhk8HUrUXpV",
      address: "0x3d2bd0e15829aa5c362a4144fdf4a1112fa29b5c",
      symbol: "BONSAI",
      symbolLabel: null,
      chain: 0,
      isSupported: true
    },
    amount,
    type: "PUBLICATION",
    content,
    item: null,
    publicationId,
    txHash: null,
    id: null,
    channelId: null,
    messageId: null,
    parentId: null
  };

  const accessTokenResult = await client.authentication.getAccessToken();
  const accessToken = accessTokenResult.unwrap();
  const { data } = await axios.post(ORB_API_URL, orbApiParams, {
    headers: {
      'orb-access-token': `Bearer ${process.env.ORB_API_BEARER_KEY!}`,
      'orb-user': profileId,
      'x-access-token': `Bearer ${accessToken}`,
    }
  });
  console.log('transactions to send:', data);
  const { data: { args, id } } = data;

  await approveToken(BONSAI_TOKEN_ADDRESS_POLYGON, wallet, ORB_ATTESTATION_CONTRACT_ADDRES, "polygon");

  console.log("sending transfer tx");

  const contractInvocation = await wallet.invokeContract({
    contractAddress: ORB_ATTESTATION_CONTRACT_ADDRES,
    method: "transfer",
    args: [
      args.token,
      args.fromProfileId,
      args.from,
      args.toProfileId,
      args.to,
      args.amount,
      args.contentURI,
      args.erc721Id,
      args.isERC20
    ],
    abi: OrbAttestationAbi,
  });

  await contractInvocation.wait();
  const txHash = contractInvocation.getTransactionHash();
  console.log(`tx: ${txHash}`);

  const res = await axios.post(ORB_API_URL, { task: "set", id, txHash }, {
    headers: {
      'orb-access-token': `Bearer ${process.env.ORB_API_BEARER_KEY!}`,
      'orb-user': profileId,
      'x-access-token': `Bearer ${accessToken}`,
    }
  });
  console.log('set orb api', { task: "set", id, txHash });
  console.log(res.data);
};
