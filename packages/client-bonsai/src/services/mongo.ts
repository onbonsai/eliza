import { MongoClient, ObjectId } from "mongodb";

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

export const initCollections = async () => {
    const client = await _client();
    const dbName = process.env.MONGO_DB_BONSAI || "client-bonsai";
    const database = client.db(dbName);

    const collections = [
        process.env.MONGO_COLLECTION_MEDIA || "media",
        process.env.MONGO_COLLECTION_API_CREDITS || "api-credits"
    ];

    for (const collectionName of collections) {
        try {
            const dummyId = new ObjectId();
            await database.collection(collectionName).insertOne({ _id: dummyId });
            await database.collection(collectionName).deleteOne({ _id: dummyId });
            console.log(`Collection ${collectionName} initialized successfully`);
        } catch (error) {
            console.error(`Error initializing collection ${collectionName}:`, error);
            throw error;
        }
    }
};

export const getClient = async () => {
    const client = await _client();
    const database = client.db(process.env.MONGO_DB_BONSAI || "client-bonsai");
    const media = database.collection(process.env.MONGO_COLLECTION_MEDIA || "media");

    return { client, media };
};

export const getCreditsClient = async () => {
    const client = await _client();
    const database = client.db(process.env.MONGO_DB_BONSAI || "client-bonsai");
    const credits = database.collection("api-credits");

    return { client, credits };
};