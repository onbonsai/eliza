import { MongoClient } from "mongodb";
import { IS_PRODUCTION } from "./launchpad/contract";

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
