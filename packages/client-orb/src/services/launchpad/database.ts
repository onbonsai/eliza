import { getClient } from "../mongo";

export const createClub = async (
    clubId: string,
    { profileId, strategy, handle, token, featureStartAt, pubId }
): Promise<string | undefined> => {
    try {
        const { clubs } = await getClient();
        const result = await clubs.insertOne({
            pubId,
            clubId,
            profileId,
            strategy,
            handle,
            token,
            featureStartAt,
        });
        return result.insertedId.toString();
    } catch (error) {
        console.log(error);
    }
};
