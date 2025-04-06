import { jwtVerify, createRemoteJWKSet } from "jose";
import type { NextFunction, Request, Response } from 'express';

const jwksUri = process.env.NEXT_PUBLIC_JWKS_URI;
const JWKS = createRemoteJWKSet(new URL(jwksUri as string));

export default async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  // Check for API key first
  const apiKey = req.headers['x-api-key'];
  const issuedKeys = process.env.ISSUED_API_KEYS?.split(',') || [];

  if (apiKey && issuedKeys.includes(apiKey as string)) {
    return next();
  }

  // If no API key match, try JWT verification
  const token = (req.headers.authorization as string)?.split(" ")[1];
  if (!token) {
    res.status(401).json({ error: "Neither valid API key nor Lens id token provided" });
    return;
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;
    next();
  } catch (error) {
    console.error("Authentication failed:", error);
    res.status(401).json({ error: "Invalid credentials" });
  }
}