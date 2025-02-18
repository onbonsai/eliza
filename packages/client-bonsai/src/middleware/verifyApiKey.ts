import type { NextFunction, Request, Response } from 'express';

const ISSUED_API_KEYS = process.env.ISSUED_API_KEYS.split(",");

export default async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey) {
    res.status(401).json({ error: "x-api-key missing" });
    return;
  }

  try {
    if (!ISSUED_API_KEYS.includes(apiKey as string)) throw new Error();

    next();
  } catch (error) {
    console.error("api key verification failed:", error);
    res.status(401).json({ error: "Invalid x-api-key" });
  }
}