import { MongoClient } from "mongodb";
import { MONGODB_DB, MONGODB_URI } from "./env";

let cached: { client: MongoClient; promise: Promise<MongoClient> } | null = null;

export async function mongoClient(): Promise<MongoClient> {
  if (cached) return cached.promise;
  const client = new MongoClient(MONGODB_URI(), {
    maxPoolSize: 10,
  });
  const promise = client.connect().then(() => client);
  cached = { client, promise };
  return promise;
}

export async function mongoDb() {
  const client = await mongoClient();
  return client.db(MONGODB_DB());
}

