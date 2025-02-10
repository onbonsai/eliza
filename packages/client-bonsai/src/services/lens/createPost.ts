import { SessionClient, uri, postId } from "@lens-protocol/client-canary";
import { post } from "@lens-protocol/client-canary/actions";
import {
    textOnly,
    image,
    video,
    MediaImageMimeType,
    MediaVideoMimeType,
    MetadataLicenseType,
} from "@lens-protocol/metadata-next";
import { handleOperationWith } from "@lens-protocol/client-canary/viem";
import { WalletClient } from "viem";
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

export default async (
    walletClient: WalletClient,
    sessionClient: SessionClient,
    params: PostParams,
    commentOn?: `0x${string}`,
    quoteOf?: `0x${string}`
): Promise<string | undefined> => {
    let metadata;
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

    const { uri: hash } = await storageClient.uploadAsJson(metadata);

    const result = await post(sessionClient, {
        contentUri: uri(hash),
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
    } else {
        console.log(
            "lens:: createPost:: failed to post with error:",
            result.error
        );
    }
};
