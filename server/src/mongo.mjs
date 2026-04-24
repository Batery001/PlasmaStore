import { MongoClient } from "mongodb";
import { MONGODB_DB, MONGODB_URI } from "./config.mjs";

let cached = null;

export async function getMongoClient() {
  if (cached) return cached;
  const client = new MongoClient(MONGODB_URI(), { maxPoolSize: 10 });
  await client.connect();
  cached = client;
  return client;
}

export async function getDb() {
  const client = await getMongoClient();
  return client.db(MONGODB_DB());
}

export async function ensureIndexes(db) {
  await db.collection("store_users").createIndex({ email: 1 }, { unique: true });
  await db.collection("cart_items").createIndex({ user_id: 1, product_id: 1 }, { unique: true });
  await db.collection("tournament_deck_overrides").createIndex({ k: 1 }, { unique: true });
  await db.collection("store_widgets").createIndex({ widget_id: 1 }, { unique: true });
  await db.collection("standings_snapshots").createIndex({ fileName: 1 }, { unique: true });
  await db.collection("standings_snapshots").createIndex({ effectiveDate: -1, mtimeMs: -1 });
}
