import { type SessionClient, uri, postId, type URI } from "@lens-protocol/client";
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
import type { WalletClient } from "viem";
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

    // TODO: uploadAsJson does exist?
    const { uri: hash } = await storageClient.uploadAsJson(metadata);

    return uri(hash);
};

export const createPost = async (
    walletClient: WalletClient,
    sessionClient: SessionClient,
    params: PostParams,
    commentOn?: `0x${string}`,
    quoteOf?: `0x${string}`
): Promise<string | undefined> => {
    const contentUri = await uploadMetadata(params);

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
