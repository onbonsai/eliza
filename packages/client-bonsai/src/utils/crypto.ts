// utils/crypto.ts
import crypto from "crypto";

const algorithm = "aes-256-cbc";

export const getKeys = (): { key: Buffer; iv: Buffer } => {
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);
    console.log(bufferToString(key), bufferToString(iv));
    return { key, iv };
};

export const bufferToString = (buffer: Buffer): string => {
    return buffer.toString("hex");
};

export const stringToBuffer = (str: string): Buffer => {
    return Buffer.from(str, "hex");
};

export const encrypt = (text: string): string => {
    const key = stringToBuffer(process.env.MONGO_KEY!);
    const iv = stringToBuffer(process.env.MONGO_IV!);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return `${iv.toString("hex")}:${encrypted}`;
};

export const decrypt = (encryptedText: string): string => {
    const key = stringToBuffer(process.env.MONGO_KEY!);
    const [ivHex, encrypted] = encryptedText.split(":");
    const decipher = crypto.createDecipheriv(
        algorithm,
        key,
        Buffer.from(ivHex, "hex")
    );
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
};
