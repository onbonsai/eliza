import { fetchAccount } from "@lens-protocol/client/actions";
import type { PrivateKeyAccount } from "viem";
import type { SessionClient } from "@lens-protocol/client";
import { client } from "./client";
import { LENS_BONSAI_APP } from "../../utils/constants";

export const authenticate = async (
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
    if (!account) return;

    const authenticated = await client.login({
        accountOwner: {
            account: account.address,
            app: LENS_BONSAI_APP,
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

export const authenticateAsBuilder = async (
    signer: PrivateKeyAccount,
): Promise<SessionClient | undefined> => {
    const authenticated = await client.login({
        builder: { address: signer.address },
        signMessage: (message) => signer.signMessage({ message }),
    });

    if (authenticated.isErr()) {
        console.log(
            "lens:: authenticateAsBuilder:: failed to login with error:",
            authenticated.error
        );
        return;
    }

    return authenticated.value;
}