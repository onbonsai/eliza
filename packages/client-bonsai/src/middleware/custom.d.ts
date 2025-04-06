import type { JWTPayload } from 'jose';
import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    user?: JWTPayload;
  }
}