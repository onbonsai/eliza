import { Redis } from "ioredis";

// volatile-lru
const client = new Redis(`${process.env.REDIS_URL as string}?family=0`);

export default client;
