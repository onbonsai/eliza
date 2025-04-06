import { jwtVerify, createRemoteJWKSet } from "jose";
import type { NextFunction, Request, Response } from 'express';

const jwksUri = process.env.NEXT_PUBLIC_JWKS_URI;
const JWKS = createRemoteJWKSet(new URL(jwksUri as string));

export default async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const token = (req.headers.authorization as string)?.split(" ")[1];

  if (!token) {
    res.status(401).json({ error: "Authorization token missing" });
    return;
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);

    req.user = payload;

    next();
  } catch (error) {
    console.error("JWT verification failed:", error);
    res.status(401).json({ error: "Invalid or expired token" });
  }
}