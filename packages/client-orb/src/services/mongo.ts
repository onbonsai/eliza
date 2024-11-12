import { MongoClient } from 'mongodb';

let client: MongoClient;

const _client = async () => {
  if (client) return client;

  client = new MongoClient(process.env.MONGO_URI!);
  await client.connect();

  return client;
};

export const getClient = async () => {
  const client = await _client();
  const database = client.db("moonshot");
  const collection = database.collection("agents");
  const tips = database.collection("user-tips");

  return { client, collection, tips };
};
