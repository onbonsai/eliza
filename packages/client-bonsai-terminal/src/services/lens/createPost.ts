import { type SessionClient, uri, postId, type URI, evmAddress } from "@lens-protocol/client";
import { post } from "@lens-protocol/client/actions";
import {
    textOnly,
    image,
    video,
    type MediaImageMimeType,
    type MediaVideoMimeType,
    MetadataLicenseType,
    MetadataAttributeType,
    type TextOnlyMetadata,
    type ImageMetadata,
    type VideoMetadata,
    type MetadataAttribute,
} from "@lens-protocol/metadata";
import { handleOperationWith } from "@lens-protocol/client/viem";
import { createWalletClient, http, type Account } from "viem";
import { chains } from "@lens-chain/sdk/viem";
import { privateKeyToAccount } from "viem/accounts";
import { walletOnly } from "@lens-chain/storage-client";
import { LENS_CHAIN, LENS_CHAIN_ID, storageClient } from "./client";
import type { TemplateCategory, TemplateName } from "../../utils/types";
import { LENS_BONSAI_DEFAULT_FEED } from "../../utils/constants";

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
    attributes?: MetadataAttribute[];
    media?: {
        category: TemplateCategory;
        name: TemplateName
    }
}

const baseMetadata = {
    attributes: ({ apiUrl, category, name }: { apiUrl: string; category: string; name: string }) => [
        {
            type: MetadataAttributeType.STRING as const,
            key: "templateCategory",
            value: category
        },
        {
            type: MetadataAttributeType.STRING as const,
            key: "template",
            value: name,
        },
        {
            type: MetadataAttributeType.STRING as const,
            key: "apiUrl",
            value: apiUrl
        }
    ],
}

export const formatMetadata = (params: PostParams): TextOnlyMetadata | ImageMetadata | VideoMetadata => {
    let attributes;
    if (params.attributes) {
        attributes = params.attributes;
    } else if (params.media) {
        attributes = baseMetadata.attributes({
            apiUrl: process.env.DOMAIN as string,
            ...params.media
        })
    }

    if (!(params.image || params.video)) {
        return textOnly({
            content: params.text,
            attributes,
        });
    }

    if (params.image) {
        return image({
            content: params.text,
            image: {
                item: params.image.url,
                type: params.image.type,
                altTag: params.text?.substring(0, 10),
                license: MetadataLicenseType.CCO,
            },
            attributes,
        });
    }

    if (params.video) {
        return video({
            content: params.text,
            video: {
                item: params.video.url,
                cover: params.video.cover,
                type: params.video.type,
                license: MetadataLicenseType.CCO,
            },
            attributes,
        });
    }

    throw new Error("formatMetadata:: Missing property for metadata");
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
    commentOn?: string,
    quoteOf?: string
): Promise<string | undefined> => {
    const walletClient = createWalletClient({
        chain: LENS_CHAIN,
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
        feed: evmAddress(LENS_BONSAI_DEFAULT_FEED),
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