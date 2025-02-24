import { type SessionClient, uri, postId, type URI, MetadataAttributeType } from "@lens-protocol/client";
import { post } from "@lens-protocol/client/actions";
import {
    textOnly,
    image,
    video,
    type MediaImageMimeType,
    type MediaVideoMimeType,
    MetadataLicenseType,
} from "@lens-protocol/metadata";
import { handleOperationWith } from "@lens-protocol/client/viem";
import { createWalletClient, http, type Account } from "viem";
import { chains } from "@lens-network/sdk/viem";
import { storageClient } from "./client";

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

export const uploadMetadata = async (params: PostParams): Promise<URI> => {
    let metadata: unknown;

    if (!(params.image || params.video)) {
        metadata = textOnly({
            content: params.text,
            attributes: [
                {
                    type: MetadataAttributeType.String,
                    value: "ElizaOS",
                    key: "framework"
                },
                {
                    type: MetadataAttributeType.String,
                    value: "client-bonsai",
                    key: "plugin"
                },
                {
                    type: MetadataAttributeType.String,
                    value: "post_url",
                    key: "https://eliza.bonsai.meme/post"
                }
            ]
        });
    } else if (params.image) {
        metadata = image({
            title: params.text,
            image: {
                item: params.image.url,
                type: params.image.type,
                license: MetadataLicenseType.CCO,
            },
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
        });
    }

    const { uri: hash } = await storageClient.uploadAsJson(metadata);

    return uri(hash);
};

// TODO: josh fix: lens storage testnet not working, so need to prod version
export const createPost = async (
    sessionClient: SessionClient,
    signer: Account,
    params: PostParams,
    commentOn?: `0x${string}`,
    quoteOf?: `0x${string}`
): Promise<{ postId?: string, txHash?: string } | undefined> => {
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
        // .andThen(sessionClient.waitForTransaction);

    if (result.isOk()) {
        return { txHash: result.value }; // txHash or postId
    }

    console.log(
        "lens:: createPost:: failed to post with error:",
        result.error
    );
};
