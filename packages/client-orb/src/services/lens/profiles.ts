import { LensClient, production } from "@lens-protocol/client";

export const getProfileById = async (forProfileId: string) => {
    const client = new LensClient({ environment: production });
    return await client.profile.fetch({ forProfileId });
};

export const getProfilesOwned = async (ownedBy: string) => {
    const client = new LensClient({ environment: production });
    try {
        const _profiles = await client.profile.fetchAll({
            where: { ownedBy: [ownedBy] },
        });

        return _profiles?.items || [];
    } catch (error) {
        console.log(error);
    }
};
