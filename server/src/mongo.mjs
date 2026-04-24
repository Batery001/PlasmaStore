import dns from "node:dns";
import { MongoClient } from "mongodb";
import { MONGODB_DB, MONGODB_URI } from "./config.mjs";

let cached = null;

/**
 * Atlas `mongodb+srv://` usa consultas DNS SRV; algunos DNS del ISP fallan → querySrv ECONNREFUSED.
 * Forzamos resolutores públicos en este proceso justo antes de conectar (salvo MONGODB_NODE_PUBLIC_DNS=0).
 */
function applyMongoDnsForSrv(uri) {
  if (!uri.startsWith("mongodb+srv://")) return;
  if (process.env.MONGODB_NODE_PUBLIC_DNS === "0") return;
  try {
    const custom = process.env.MONGODB_DNS_SERVERS?.trim();
    if (custom) {
      dns.setServers(custom.split(/[\s,]+/).filter(Boolean));
    } else {
      dns.setServers(["8.8.8.8", "8.8.4.4"]);
    }
  } catch (e) {
    console.warn("[mongo] dns.setServers:", e?.message || e);
  }
  try {
    if (process.platform === "win32" && process.env.MONGODB_IPV4_FIRST !== "0") {
      dns.setDefaultResultOrder("ipv4first");
    }
  } catch {
    /* Node muy antiguo */
  }
}

export async function getMongoClient() {
  if (cached) return cached;
  const uri = MONGODB_URI();
  applyMongoDnsForSrv(uri);
  const opts = { maxPoolSize: 10 };
  if (process.platform === "win32" && uri.startsWith("mongodb+srv://") && process.env.MONGODB_FORCE_IPV4 !== "0") {
    opts.family = 4;
  }
  const client = new MongoClient(uri, opts);
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
