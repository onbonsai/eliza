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
import { storageClient } from "./client";
import { uploadJson } from "./../../utils/ipfs";
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
    const metadata = formatMetadata(params);

    // TODO: not working?
    // const { uri: hash } = await storageClient.uploadAsJson(metadata);
    // return uri(hash);

    const response = await fetch('https://storage-api.testnet.lens.dev/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata)
    });

    if (!response.ok) {
        throw new Error(`Storage API error: ${response.status} ${response.statusText}`);
    }

    const res = await response.json();

    return uri(res[0].uri);
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

export const editPost = async (uri: string, metadata: any, signer: Account): Promise<boolean> => {
    // TODO: need new sdk version
    // return await storageClient.editJson()

    return true;
}