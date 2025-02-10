import { MongoClient } from "mongodb";

const IS_PRODUCTION = process.env.LAUNCHPAD_CHAIN_ID === "8453";
let client: MongoClient;
let connecting: Promise<MongoClient> | null = null;

const _client = async () => {
    if (client) return client;
    if (connecting) return connecting;

    connecting = (async () => {
        client = new MongoClient(process.env.MONGO_URI!);
        await client.connect();
        return client;
    })();

    return connecting;
};

export const getClient = async () => {
    const client = await _client();
    const database = client.db("moonshot");
    const collection = database.collection("agents");
    const tips = database.collection("user-tips");
    const tickers = database.collection("tickers");
    const clubs = database.collection(IS_PRODUCTION ? "clubs-prod" : "clubs");

    return { client, collection, tips, tickers, clubs };
};
