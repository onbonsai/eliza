import axios from "axios";
import FormData from "form-data";

const STORJ_API_URL = "https://www.storj-ipfs.com";
const STORJ_API_USERNAME = process.env.STORJ_API_USERNAME;
const STORJ_API_PASSWORD = process.env.STORJ_API_PASSWORD;
const _baseURL = `${STORJ_API_URL}/api/v0`;
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

const pinFile = async (file: {
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
    maxContentLength: Number.POSITIVE_INFINITY,
    maxBodyLength: Number.POSITIVE_INFINITY,
  });

  return storjGatewayURL(response.data.Hash);
};

export const parseAndUploadBase64Image = async (imageResponse) => {
  if (imageResponse.success && imageResponse.data?.[0]) {
    if (!imageResponse.data[0].includes("base64")) {
      console.error("Image response does not contain base64 data");
      return;
    }
    // Convert base64 to buffer
    const base64Data = imageResponse.data[0].replace(
      /^data:image\/\w+;base64,/,
      ""
    );
    const imageBuffer = Buffer.from(base64Data, "base64");

    // Create a file object that can be used with FormData
    const file = {
      buffer: imageBuffer,
      originalname: `generated_${Date.now()}.png`,
      mimetype: "image/png",
    };

    // Upload to your hosting service
    return await pinFile(file);
  }

  console.error("No image response");
};

export const parseBase64Image = (imageResponse): File | undefined => {
  if (imageResponse.success && imageResponse.data?.[0]) {
    if (!imageResponse.data[0].includes("base64")) {
      console.error("Image response does not contain base64 data");
      return;
    }
    // Convert base64 to buffer
    const base64Data = imageResponse.data[0].replace(
      /^data:image\/\w+;base64,/,
      ""
    );
    const imageBuffer = Buffer.from(base64Data, "base64");

    // Create a file object that can be used with FormData
    return new File([imageBuffer], `generated_${Date.now()}.png`, {
      type: "image/png"
    });
  }
};
