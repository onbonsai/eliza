import { createNodeRedisClient } from "handy-redis";

const { REDIS_URL } = process.env;

// volatile-lru
const client = createNodeRedisClient(REDIS_URL);

export default client;
