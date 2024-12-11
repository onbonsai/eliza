import axios from "axios";
import FormData from "form-data";

const SLS_STAGE = "production";
const STORJ_API_URL = "https://www.storj-ipfs.com";
const ARWEAVE_GATEWAY_URL = "https://arweave.net";
const LENS_IPFS_URL = "https://gw.ipfs-lens.dev/ipfs";
const STORJ_API_PORT = process.env.STORJ_API_PORT!;
const STORJ_API_USERNAME = process.env.STORJ_API_USERNAME!;
const STORJ_API_PASSWORD = process.env.STORJ_API_PASSWORD!;
const _baseURL = `${STORJ_API_URL}${SLS_STAGE === "production" ? "" : `:${STORJ_API_PORT}`}/api/v0`;
const _client = () =>
    axios.create({
        baseURL: _baseURL,
        auth: {
            username: STORJ_API_USERNAME,
            password: STORJ_API_PASSWORD,
        },
    });

export const _hash = (uriOrHash: string) =>
    typeof uriOrHash === "string" && uriOrHash.startsWith("ipfs://")
        ? uriOrHash.split("ipfs://")[1]
        : uriOrHash;

export const storjGatewayURL = (uriOrHash: string) =>
    `${STORJ_API_URL}/ipfs/${_hash(uriOrHash)}`;

export const uploadJson = async (json: any) => {
    if (typeof json !== "string") {
        json = JSON.stringify(json);
    }
    const formData = new FormData();
    formData.append("path", Buffer.from(json, "utf-8").toString());

    const headers = {
        "Content-Type": "multipart/form-data",
        ...formData.getHeaders(),
    };

    const { data } = await _client().post(
        "add?cid-version=1",
        formData.getBuffer(),
        {
            headers,
        }
    );

    return storjGatewayURL(data.Hash);
};

export const pinFile = async (file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
}) => {
    // Create a FormData instance for the Axios request
    const formData = new FormData();

    // Append the buffer as a file to the FormData
    formData.append("file", file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
    });

    // Perform the Axios request
    const response = await _client().post("add?cid-version=1", formData, {
        headers: {
            "Content-Type": `multipart/form-data; boundary=${formData.getBoundary()}`,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
    });

    return storjGatewayURL(response.data.Hash);
};

export const fetchArweaveData = async (uri: string) => {
    try {
        if (!uri.includes("ar://")) return;
        const { data } = await axios.get(
            `${ARWEAVE_GATEWAY_URL}/${uri.split("ar://")[1]}`
        );
        return data;
    } catch (error) {
        console.error("Error fetching data:", error);
        throw error;
    }
};

export const getLensImageURL = (uri: string): string => {
    try {
        if (!uri.includes("ipfs://")) return uri;
        return `${LENS_IPFS_URL}/${uri.split("ipfs://")[1]}`;
    } catch (error) {
        console.error("Error fetching data:", error);
        throw error;
    }
};

// First, create a function to download the video buffer
export async function downloadVideoBuffer(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download video: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
