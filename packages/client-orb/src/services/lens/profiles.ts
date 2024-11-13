import { LensClient, production } from "@lens-protocol/client";

export const getProfileById = async (forProfileId: string) => {
  const client = new LensClient({ environment: production });
  return await client.profile.fetch({ forProfileId });
};