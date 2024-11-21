import { Wallet } from "@coinbase/coinbase-sdk";
import { hashMessage } from "viem";
import { LensClient, production } from "@lens-protocol/client";

export const fetchFeedHighlights = async (
    wallet: Wallet,
    profileId: string
) => {
    // authenticate with api
    const client = new LensClient({ environment: production });
    const [address] = await wallet.listAddresses();
    const challenge = await client.authentication.generateChallenge({
        signedBy: address.getId(),
        for: profileId,
    });
    // @ts-ignore
    let signature = await wallet.createPayloadSignature(
        hashMessage(challenge.text)
    );
    signature = await signature.wait();
    await client.authentication.authenticate({
        id: challenge.id,
        signature: signature.getSignature(),
    });

    const result = await client.feed.highlights({
        where: {
            for: profileId,
        },
    });

    const value = result.unwrap();
    const feed = value.items.map((item) => ({
        author: item.by.handle.suggestedFormatted,
        // @ts-ignore
        content: item.root.metadata.content,
    }));

    return feed.slice(0, 20);
};

export const fetchFeed = async (wallet: Wallet, profileId: string) => {
    // authenticate with api
    const client = new LensClient({ environment: production });
    const [address] = await wallet.listAddresses();
    const challenge = await client.authentication.generateChallenge({
        signedBy: address.getId(),
        for: profileId,
    });
    // @ts-ignore
    let signature = await wallet.createPayloadSignature(
        hashMessage(challenge.text)
    );
    signature = await signature.wait();
    await client.authentication.authenticate({
        id: challenge.id,
        signature: signature.getSignature(),
    });

    const result = await client.feed.fetch({
        where: {
            for: profileId,
        },
    });

    const value = result.unwrap();
    const feed = value.items.map((item) => ({
        author: item.root.by.handle.suggestedFormatted.localName,
        // @ts-ignore
        content: item.root.metadata.content,
    }));

    return feed.slice(0, 20);
};
