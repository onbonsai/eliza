import { elizaLogger } from "@elizaos/core";
import axios from "axios";
import FormData from "form-data";
import { File } from 'node:buffer';
import { Blob } from 'node:buffer';
import pkg from 'aws-sdk';
const { S3 } = pkg;
import { storageClient } from "../services/lens/client";

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

export const pinFile = async (file: File | {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}) => {
  const formData = new FormData();

  if (file instanceof File) {
    // Handle File object
    const buffer = Buffer.from(await file.arrayBuffer());
    formData.append("file", buffer, {
      filename: file.name,
      contentType: file.type,
      knownLength: buffer.length
    });
  } else {
    // Handle custom file object
    formData.append("file", file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
      knownLength: file.buffer.length
    });
  }

  // Perform the Axios request
  const response = await _client().post("add?cid-version=1", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
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

    let imageBuffer;
    try {
      // Convert base64 to buffer
      const base64Data = imageResponse.data[0].replace(
        /^data:image\/\w+;base64,/,
        ""
      );
      imageBuffer = Buffer.from(base64Data, "base64");

      // Create a Blob first
      const blob = new Blob([imageBuffer], { type: "image/png" });

      // Then create the File from the Blob
      const file = new File([blob], `generated_${Date.now()}.png`, {
        type: "image/png"
      });

      return file;
    } catch (error) {
      console.error("Error creating file:", error);
      // Fallback: return a Blob if File creation fails
      return new Blob([imageBuffer], { type: "image/png" }) as unknown as File;
    }
  }
  elizaLogger.error("Invalid image response:", imageResponse);
  return;
};

export const fileToBase64Image = async (file: File): Promise<string> => {
  try {
    // Read the file as an ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Convert to base64
    const base64 = buffer.toString('base64');

    // Add data URL prefix based on file type
    const mimeType = file.type || 'image/png';
    const dataUrl = `data:${mimeType};base64,${base64}`;

    return dataUrl;
  } catch (error) {
    console.error("Error converting file to base64:", error);
    throw error;
  }
};

/**
 * Converts a video buffer to a File object
 * @param buffer Video buffer to convert
 * @returns File object
 */
export function bufferToVideoFile(buffer: Buffer): File {
  // Convert buffer to base64
  const base64 = buffer.toString('base64');

  // Create a Blob from the base64 string
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: 'video/mp4' });

  // Create a File from the Blob
  return new File([blob], `video-${Date.now()}.mp4`, { type: 'video/mp4' });
}

export const defaultGatewayURL = (uriOrHash: string) => `https://ipfs.io/ipfs/${_hash(uriOrHash)}`;

export const uriToBuffer = async (uri: string): Promise<Buffer> => {
  try {
    // Handle data URIs (base64 encoded)
    if (uri.startsWith('data:')) {
      const base64Data = uri.split(',')[1];
      return Buffer.from(base64Data, 'base64');
    }

    if (uri.startsWith("lens://")) {
      uri = await storageClient.resolve(uri);
    }

    if (uri.startsWith("ipfs://")) {
      uri = defaultGatewayURL(uri);
    }
    // Handle regular URLs
    const response = await axios.get(uri, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  } catch (error) {
    elizaLogger.error('Failed to convert URI to buffer:', error);
    throw new Error('Failed to convert URI to buffer');
  }
};

interface StorjUploadParams {
  id: string;
  buffer: Buffer;
  bucket?: string;
}

interface StorjUploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

const getStorjPublicUrl = (bucket: string, key: string): string => {
  const keys = {
    "publication-history-media": "jw5fzwqqirjuu6i2aambbebh4uza",
    "publication-history-metadata": "jw3iog3dy7frukpkum5xo6tklyxq",
  }
  const endpoint = `https://link.storjshare.io/raw/${keys[bucket]}/${bucket}`;
  return `${endpoint}/${key}`;
};

export const cacheImageStorj = async ({ id, buffer, bucket = "publication-history-media" }: StorjUploadParams): Promise<StorjUploadResult> => {
  if (!process.env.STORJ_ACCESS_KEY || !process.env.STORJ_SECRET_KEY || !process.env.STORJ_ENDPOINT) {
    return {
      success: false,
      error: 'Storj credentials are not properly configured'
    };
  }

  const s3 = new S3({
    accessKeyId: process.env.STORJ_ACCESS_KEY,
    secretAccessKey: process.env.STORJ_SECRET_KEY,
    endpoint: process.env.STORJ_ENDPOINT,
    s3ForcePathStyle: true,
    signatureVersion: "v4",
  });

  const params = {
    Bucket: bucket,
    Key: id,
    Body: buffer,
    ContentType: "image/png",
  };

  try {
    await s3.upload(params).promise();
    return {
      success: true,
      url: getStorjPublicUrl(bucket, id)
    };
  } catch (error) {
    elizaLogger.error('Failed to upload image to Storj:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};

export const cacheVideoStorj = async ({ id, buffer, bucket = "publication-history-media" }: StorjUploadParams): Promise<StorjUploadResult> => {
  if (!process.env.STORJ_ACCESS_KEY || !process.env.STORJ_SECRET_KEY || !process.env.STORJ_ENDPOINT) {
    return {
      success: false,
      error: 'Storj credentials are not properly configured'
    };
  }

  const s3 = new S3({
    accessKeyId: process.env.STORJ_ACCESS_KEY,
    secretAccessKey: process.env.STORJ_SECRET_KEY,
    endpoint: process.env.STORJ_ENDPOINT,
    s3ForcePathStyle: true,
    signatureVersion: "v4",
  });

  const params = {
    Bucket: bucket,
    Key: id,
    Body: buffer,
    ContentType: "video/mp4",
  };

  try {
    await s3.upload(params).promise();
    return {
      success: true,
      url: getStorjPublicUrl(bucket, id)
    };
  } catch (error) {
    elizaLogger.error('Failed to upload video to Storj:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};

export const cacheJsonStorj = async ({ id, data, bucket = "publication-history-metadata" }: { 
  id: string; 
  data: any; 
  bucket?: string;
}): Promise<StorjUploadResult> => {
  if (!process.env.STORJ_ACCESS_KEY || !process.env.STORJ_SECRET_KEY || !process.env.STORJ_ENDPOINT) {
    return {
      success: false,
      error: 'Storj credentials are not properly configured'
    };
  }

  const s3 = new S3({
    accessKeyId: process.env.STORJ_ACCESS_KEY,
    secretAccessKey: process.env.STORJ_SECRET_KEY,
    endpoint: process.env.STORJ_ENDPOINT,
    s3ForcePathStyle: true,
    signatureVersion: "v4",
  });

  // Convert data to JSON string if it's not already
  const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
  const buffer = Buffer.from(jsonString, 'utf-8');

  const params = {
    Bucket: bucket,
    Key: id,
    Body: buffer,
    ContentType: "application/json",
  };

  try {
    await s3.upload(params).promise();
    return {
      success: true,
      url: getStorjPublicUrl(bucket, id)
    };
  } catch (error) {
    elizaLogger.error('Failed to upload JSON to Storj:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};
