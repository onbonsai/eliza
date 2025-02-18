import { fetchAccount } from "@lens-protocol/client/actions";
import type { PrivateKeyAccount } from "viem";
import type { SessionClient } from "@lens-protocol/client";
import { client } from "./client";

const LENS_APP_CONTRACT = "0xe5439696f4057aF073c0FB2dc6e5e755392922e1"; // TODO: create one for bonsai

const authenticate = async (
    signer: PrivateKeyAccount,
    username: string
): Promise<SessionClient | undefined> => {
    const result = await fetchAccount(client, {
        username: {
            localName: username,
        },
    });

    if (result.isErr()) {
        console.log(
            "lens:: authenticate:: failed to fetch profile for:",
            username
        );
        return;
    }

    const account = result.value;
    const authenticated = await client.login({
        accountOwner: {
            account: account.address,
            app: LENS_APP_CONTRACT,
            owner: signer.address,
        },
        signMessage: (message) => signer.signMessage({ message }),
    });

    if (authenticated.isErr()) {
        console.log(
            "lens:: authenticate:: failed to login with error:",
            authenticated.error
        );
        return;
    }

    return authenticated.value;
};

export default authenticate;
