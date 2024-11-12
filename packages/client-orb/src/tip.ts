import { privateKeyToAccount } from "viem/accounts";
import { http, createWalletClient } from "viem";
import { polygon } from "viem/chains";
import { Wallet } from "@coinbase/coinbase-sdk"
import axios from 'axios';
import { LensClient, production } from "@lens-protocol/client";
import { approveToken } from "./utils/viem.ts";
import { BONSAI_TOKEN_ADDRESS_POLYGON } from "./utils/constants.ts";
import OrbAttestationAbi from "./abi/OrbAttestation.ts";
// import { approveToken } from "../../core/coinbase.ts";

const ORB_API_URL = "https://us-central1-stellar-verve-314311.cloudfunctions.net/ORBV2-BOT-tipping";
const ORB_ATTESTATION_CONTRACT_ADDRES = "0xa8208529573e32b0aec07565fa8bc3cd01115449"; // polygon

// tip a publication with bonsai on polygon
export const tipPublication = async (_wallet: Wallet, publicationId: string, amount: number, content?: string) => {
  const client = new LensClient({ environment: production });

  // TODO: testing with personal wallet for posting
  // const [address] = await wallet.listAddresses()
  const { profileId, privateKey } = {
    profileId: "0x05144b",
    privateKey: process.env.TEST_PERSONAL_PRIVATE_KEY!,
  };
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const wallet = createWalletClient({
    account,
    chain: polygon,
    transport: http(process.env.POLYGON_RPC_URL!)
  });
  const challenge = await client.authentication.generateChallenge({
    signedBy: account.address,
    for: profileId,
  })
  const signature = await wallet.signMessage({ account, message: challenge.text });
  await client.authentication.authenticate({ id: challenge.id, signature });

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

  await approveToken(BONSAI_TOKEN_ADDRESS_POLYGON, wallet, account, ORB_ATTESTATION_CONTRACT_ADDRES, "polygon");
  // coinbase tx
  // await approveToken(BONSAI_TOKEN_ADDRESS_POLYGON, _wallet, ORB_ATTESTATION_CONTRACT_ADDRES, "polygon");

  console.log("sending transfer tx");
  const txHash = await wallet.writeContract({
    account,
    address: ORB_ATTESTATION_CONTRACT_ADDRES,
    abi: OrbAttestationAbi,
    functionName: "transfer",
    chain: polygon,
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
    ]
  });
  console.log(`tx: ${txHash}`);

  // coinbase tx
  // const contractInvocation = await _wallet.invokeContract({
  //   contractAddress: ORB_ATTESTATION_CONTRACT_ADDRES,
  //   method: "transfer",
  //   args: [
  //     args.token,
  //     args.fromProfileId,
  //     args.from,
  //     args.toProfileId,
  //     args.to,
  //     args.amount,
  //     args.contentURI,
  //     args.erc721Id,
  //     args.isERC20
  //   ],
  //   abi: OrbAttestationAbi,
  // });

  // await contractInvocation.wait();
  // const txHash = contractInvocation.getTransactionHash();

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