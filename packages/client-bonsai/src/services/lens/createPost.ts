import { type SessionClient, uri, postId, type URI } from "@lens-protocol/client";
import { post } from "@lens-protocol/client/actions";
import {
    textOnly,
    image,
    video,
    type MediaImageMimeType,
    type MediaVideoMimeType,
    MetadataLicenseType,
    MetadataAttributeType,
    TextOnlyMetadata,
    ImageMetadata,
    VideoMetadata,
} from "@lens-protocol/metadata";
import { handleOperationWith } from "@lens-protocol/client/viem";
import { createWalletClient, http, type Account } from "viem";
import { chains } from "@lens-network/sdk/viem";
import { privateKeyToAccount } from "viem/accounts";
import { walletOnly } from "@lens-chain/storage-client";
import { LENS_CHAIN_ID, storageClient } from "./client";
import { APP_ID } from "../../utils/constants";

interface PostParams {
    text: string;
    image?: {
        url: string;
        type: MediaImageMimeType;
    };
    video?: {
        url: string;
        cover?: string;
        type: MediaVideoMimeType;
    };
}

const baseMetadata = {
    appId: APP_ID,
    attributes: [
        {
            type: MetadataAttributeType.STRING,
            key: "framework",
            value: "ElizaOS"
        },
        {
            type: MetadataAttributeType.STRING,
            key: "plugin",
            value: "client_bonsai",
        },
        {
            type: MetadataAttributeType.STRING,
            key: "url",
            value: "https://eliza.bonsai.meme/post"
        }
    ],
}

export const formatMetadata = (params: PostParams): TextOnlyMetadata | ImageMetadata | VideoMetadata => {
    let metadata: unknown;

    if (!(params.image || params.video)) {
        metadata = textOnly({
            content: params.text,
            ...baseMetadata,
        });
    } else if (params.image) {
        metadata = image({
            title: params.text,
            image: {
                item: params.image.url,
                type: params.image.type,
                license: MetadataLicenseType.CCO,
            },
            ...baseMetadata,
        });
    } else if (params.video) {
        metadata = video({
            title: params.text,
            video: {
                item: params.video.url,
                cover: params.video.cover,
                type: params.video.type,
                license: MetadataLicenseType.CCO,
            },
            ...baseMetadata,
        });
    }

    return metadata;
}

export const uploadMetadata = async (params: PostParams): Promise<URI> => {
    const acl = walletOnly(process.env.LENS_STORAGE_NODE_ACCOUNT as `0x${string}`, LENS_CHAIN_ID);
    const metadata = formatMetadata(params);
    const { uri: hash } = await storageClient.uploadAsJson(metadata, { acl });
    return uri(hash);
};

export const createPost = async (
    sessionClient: SessionClient,
    signer: Account,
    params: PostParams,
    commentOn?: `0x${string}`,
    quoteOf?: `0x${string}`
): Promise<string | undefined> => {
    const walletClient = createWalletClient({
        chain: chains.testnet,
        account: signer,
        transport: http()
    });

    const contentUri = await uploadMetadata(params);
    console.log(`contentUri: ${contentUri}`);

    const result = await post(sessionClient, {
        contentUri,
        commentOn: commentOn
            ? {
                  post: postId(commentOn),
              }
            : undefined,
        quoteOf: quoteOf
            ? {
                  post: postId(quoteOf),
              }
            : undefined,
    })
        .andThen(handleOperationWith(walletClient))
        .andThen(sessionClient.waitForTransaction);

    if (result.isOk()) {
        return result.value; // postId
    }

    console.log(
        "lens:: createPost:: failed to post with error:",
        result.error
    );
};

export const editPost = async (uri: string, metadata: any): Promise<boolean> => {
    const signer = privateKeyToAccount(process.env.LENS_STORAGE_NODE_PRIVATE_KEY as `0x${string}`);
    const acl = walletOnly(signer.address, LENS_CHAIN_ID);
    await storageClient.updateJson(uri, metadata, signer, { acl });

    return true;
}