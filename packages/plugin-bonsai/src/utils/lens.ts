const LENS_IPFS_URL = "https://gw.ipfs-lens.dev/ipfs";

export const getLensImageURL = (uri: string): string => {
    if (!uri.includes("ipfs://")) return uri;
    return `${LENS_IPFS_URL}/${uri.split("ipfs://")[1]}`;
};
