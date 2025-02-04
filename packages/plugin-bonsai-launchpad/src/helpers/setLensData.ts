const LAUNCHPAD_API_URL = "https://launch.bonsai.meme/api";

interface SetLensDataParams {
    txHash: `0x${string}`;
    pubId: string;
    profileId?: string;
    handle?: string;
}

export default async (data: SetLensDataParams): Promise<boolean> => {
    try {
        const response = await fetch(`${LAUNCHPAD_API_URL}/clubs/set-lens-data`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
        });

        return response.ok;
    } catch {
        return false;
    }
};
