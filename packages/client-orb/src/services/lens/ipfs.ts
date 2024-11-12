import axios from "axios"
import FormData from "form-data"

const SLS_STAGE = "production"
const STORJ_API_URL = "https://www.storj-ipfs.com"
const ARWEAVE_GATEWAY_URL = "https://arweave.net"
const LENS_IPFS_URL = "https://gw.ipfs-lens.dev/ipfs";

export const uploadJson = async (json: any) => {
  const STORJ_API_PORT = process.env.STORJ_API_PORT!
  const STORJ_API_USERNAME = process.env.STORJ_API_USERNAME!
  const STORJ_API_PASSWORD = process.env.STORJ_API_PASSWORD!

  // prod service uses default port (443)
  const _baseURL = `${STORJ_API_URL}${
    SLS_STAGE === "production" ? "" : `:${STORJ_API_PORT}`
  }/api/v0`
  const _client = () =>
    axios.create({
      baseURL: _baseURL,
      auth: { username: STORJ_API_USERNAME, password: STORJ_API_PASSWORD },
    })

  if (typeof json !== "string") {
    json = JSON.stringify(json)
  }
  const formData = new FormData()
  formData.append("path", Buffer.from(json, "utf-8").toString())

  const headers = {
    "Content-Type": "multipart/form-data",
    ...formData.getHeaders(),
  }

  const { data } = await _client().post("add?cid-version=1", formData.getBuffer(), {
    headers,
  })

  return data.Hash
}

export const fetchArweaveData = async (uri: string) => {
  try {
    if (!uri.includes("ar://")) return;
    const { data } = await axios.get(`${ARWEAVE_GATEWAY_URL}/${uri.split("ar://")[1]}`);
    return data;
  } catch (error) {
    console.error("Error fetching data:", error);
    throw error;
  }
};

export const getLensImageURL = (uri: string): string => {
  try {
    if (!uri.includes("ipfs://")) return;
    return `${LENS_IPFS_URL}/${uri.split("ipfs://")[1]}`;
  } catch (error) {
    console.error("Error fetching data:", error);
    throw error;
  }
}
