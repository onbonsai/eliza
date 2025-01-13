import { privateKeyToAccount } from "viem/accounts";
import { http, createWalletClient, hashMessage, hashTypedData } from "viem";
import { polygon } from "viem/chains";
import { Wallet } from "@coinbase/coinbase-sdk";
import axios from "axios";
import { LensClient, production } from "@lens-protocol/client";
import { BONSAI_TOKEN_ADDRESS_POLYGON } from "../../utils/constants";
import { handleBroadcastResult } from "../../utils/utils.ts";

const ORB_API_URL =
    "https://us-central1-stellar-verve-314311.cloudfunctions.net/ORBV2-BOT-create-publication";
const ORB_BONSAI_CLUB_ID = "65e6dec26d85271723b6357c";
const ORB_BONSAI_CLUB_TREASURY_ADDRESS =
    "0xa713822097941a68ab495a2f56ba6b276775c4b7";

// post to lens from the first profile in the wallet
export default async (
    wallet: Wallet,
    profileId: string,
    handle: string,
    text: string,
    imageUrl?: string,
    videoUrl?: string,
    commentOn?: string
) => {
    if (process.env.ORB_DRY_RUN == "true") {
        console.log("Dry run: not posting to Orb");
        return;
    }

    const client = new LensClient({ environment: production });

    const [address] = await wallet.listAddresses();
    const challenge = await client.authentication.generateChallenge({
        signedBy: address.getId(),
        for: profileId,
    });
    let signature = await wallet.createPayloadSignature(
        hashMessage(challenge.text)
    );
    signature = await signature.wait();
    await client.authentication.authenticate({
        id: challenge.id,
        signature: signature.getSignature(),
    });

    // prepare orb api params
    const publicationType = videoUrl ? "video" : imageUrl ? "image" : "text";
    const content = text;
    const items = videoUrl
        ? [
              {
                  url: videoUrl,
                  type: "video/mp4",
              },
          ]
        : imageUrl
          ? [
                {
                    url: imageUrl,
                    type: "image/png",
                },
            ]
          : [];
    const communityId = ORB_BONSAI_CLUB_ID;
    const digitalCollectibleSettings =
        imageUrl || videoUrl
            ? {
                  endsAt: null,
                  followerOnly: false,
                  currency: BONSAI_TOKEN_ADDRESS_POLYGON,
                  val: "100.0",
                  collectLimit: null,
                  referralFee: null,
                  recipients: [
                      {
                          address: ORB_BONSAI_CLUB_TREASURY_ADDRESS,
                          id: ORB_BONSAI_CLUB_ID, //bonsai treasury gets a split
                          split: 10,
                      },
                      {
                          address: address.getId(),
                          id: profileId,
                          split: 90,
                      },
                  ],
              }
            : undefined;
    const isPrivate = false; // TODO: accept input param
    const accessTokenResult = await client.authentication.getAccessToken();
    const accessToken = accessTokenResult.unwrap();
    const { data } = await axios.post(
        ORB_API_URL,
        {
            publicationType,
            content,
            locale: "en-US",
            handle,
            items,
            commentOn,
            communityId,
            digitalCollectibleSettings,
            pollData: null,
            referenceSettings: null,
            pointedPublicationId: null,
            isPrivate,
            quoteOn: null,
            mirrorOn: null,
            isDecentPub: false,
            decentPubUrl: null,
            includePreviewData: true,
        },
        {
            headers: {
                "orb-access-token": `Bearer ${process.env.ORB_API_BEARER_KEY!}`,
                "orb-user": profileId,
                "x-access-token": `Bearer ${accessToken}`,
                "upload-type": "POST_METADATA",
            },
        }
    );
    console.log("orb result:", data);

    const {
        status,
        data: { contentURI, openActionModules },
        onchain,
    } = data;
    if (status !== "SUCCESS") return false;

    // TODO: only if signless is enabled for the profileId
    // const result = onchain
    //   ? await client.publication.postOnchain({ contentURI })
    //   : await client.publication.postOnMomoka({ contentURI });

    let typedDataResult;
    if (onchain) {
        typedDataResult = !commentOn
            ? await client.publication.createOnchainPostTypedData({
                  contentURI,
                  openActionModules,
              })
            : await client.publication.createOnchainCommentTypedData({
                  commentOn,
                  contentURI,
                  openActionModules,
              });
    } else {
        typedDataResult = !commentOn
            ? await client.publication.createMomokaPostTypedData({
                  contentURI,
              })
            : await client.publication.createMomokaCommentTypedData({
                  commentOn,
                  contentURI,
              });
    }

    // handle authentication errors
    if (typedDataResult.isFailure()) {
        console.error(typedDataResult.error); // CredentialsExpiredError or NotAuthenticatedError
        return;
    }

    const { id, typedData } = typedDataResult.unwrap();

    const signatureTyped = await wallet.createPayloadSignature(
        hashTypedData({
            domain: {
                ...typedData.domain,
                verifyingContract: typedData.domain
                    .verifyingContract as `0x${string}`,
            },
            types: typedData.types,
            // @ts-ignore
            message: typedData.value,
            // @ts-ignore
            primaryType: !commentOn ? "Post" : "Comment",
        })
    );

    let result;
    if (onchain) {
        result = await client.transaction.broadcastOnchain({
            id,
            signature: signatureTyped.getSignature(),
        });
    } else {
        result = await client.transaction.broadcastOnMomoka({
            id,
            signature: signatureTyped.getSignature(),
        });
    }

    return handleBroadcastResult(result);
};
