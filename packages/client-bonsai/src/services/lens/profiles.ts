import {
    type Account,
    type AccountManaged,
    evmAddress,
} from "@lens-protocol/client";
import {
    fetchAccount,
    fetchAccountsAvailable,
} from "@lens-protocol/client/actions";
import { client } from "./client";

export const getProfileById = async (
    legacyProfileId: string
): Promise<Account | undefined> => {
    const result = await fetchAccount(client, { legacyProfileId });
    if (!result.isErr()) return result.value as Account;
};

export const getProfileByUsername = async (
    username: string,
    namespace?: `0x${string}`
): Promise<Account | undefined> => {
    const result = await fetchAccount(client, {
        username: {
            localName: username,
            namespace: namespace ? evmAddress(namespace) : undefined,
        },
    });
    if (!result.isErr()) return result.value as Account;
};

export const getProfilesOwned = async (
    ownedBy: `0x${string}`
): Promise<AccountManaged[]> => {
    const result = await fetchAccountsAvailable(client, {
        managedBy: evmAddress(ownedBy),
        includeOwned: true,
    });

    if (!result.isErr()) return result.value.items as AccountManaged[];

    return [];
};
