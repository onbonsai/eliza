import { MongoClient } from "mongodb";

let client: MongoClient;
let connecting: Promise<MongoClient> | null = null;

const _client = async () => {
    if (client) return client;
    if (connecting) return connecting;

    connecting = (async () => {
        client = new MongoClient(process.env.BONSAI_CLIENT_MONGO_URI as string);
        await client.connect();
        return client;
    })();

    return connecting;
};

export const getClient = async () => {
    const client = await _client();
    const database = client.db(process.env.MONGO_DB_BONSAI || "client-bonsai");
    const media = database.collection(process.env.MONGO_COLLECTION_MEDIA || "media");

    return { client, media };
};
