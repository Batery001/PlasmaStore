import dns from "node:dns";
import { MongoClient } from "mongodb";
import { MONGODB_DB, MONGODB_URI } from "./config.mjs";

let cached = null;
let cachedPromise = null;

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function connectWithRetry(client, { uri, attempts = 6 }) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      // Re-aplicar DNS antes de cada intento (SRV puede fallar intermitente)
      applyMongoDnsForSrv(uri);
      await client.connect();
      return;
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e);
      const code = String(e?.code || "");
      const isSrv =
        msg.includes("querySrv") ||
        msg.includes("_mongodb._tcp") ||
        code === "ECONNREFUSED" ||
        code === "ENOTFOUND" ||
        code === "EAI_AGAIN" ||
        code === "ETIMEOUT";

      // backoff con jitter (más agresivo si parece SRV/DNS)
      const base = isSrv ? 650 : 350;
      const wait = Math.min(10_000, base * Math.pow(1.7, i) + Math.floor(Math.random() * 250));
      console.warn(`[mongo] connect intento ${i + 1}/${attempts} falló: ${msg}. Reintentando en ${wait}ms`);
      await sleep(wait);
    }
  }
  throw lastErr || new Error("No se pudo conectar a MongoDB.");
}

export async function getMongoClient() {
  if (cached) return cached;
  if (cachedPromise) return cachedPromise;
  const uri = MONGODB_URI();
  applyMongoDnsForSrv(uri);
  const opts = {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: parseInt(process.env.MONGODB_SERVER_SELECTION_MS || "5000", 10) || 5000,
    connectTimeoutMS: parseInt(process.env.MONGODB_CONNECT_TIMEOUT_MS || "5000", 10) || 5000,
    socketTimeoutMS: parseInt(process.env.MONGODB_SOCKET_TIMEOUT_MS || "20000", 10) || 20000,
  };
  if (process.platform === "win32" && uri.startsWith("mongodb+srv://") && process.env.MONGODB_FORCE_IPV4 !== "0") {
    opts.family = 4;
  }
  const client = new MongoClient(uri, opts);

  cachedPromise = (async () => {
    try {
      await connectWithRetry(client, { uri, attempts: parseInt(process.env.MONGODB_CONNECT_RETRIES || "6", 10) || 6 });
      cached = client;
      return client;
    } catch (e) {
      // limpiar para permitir reintento en próxima request
      cachedPromise = null;
      cached = null;
      try {
        await client.close();
      } catch {
        /* ignore */
      }
      throw e;
    }
  })();

  return cachedPromise;
}

export async function getDb() {
  const client = await getMongoClient();
  return client.db(MONGODB_DB());
}

export async function ensureIndexes(db) {
  await db.collection("store_users").createIndex({ email: 1 }, { unique: true });
  await db.collection("store_users").createIndex({ username: 1 }, { unique: true, sparse: true });
  await db.collection("cart_items").createIndex({ user_id: 1, product_id: 1 }, { unique: true });
  await db.collection("tournament_deck_overrides").createIndex({ k: 1 }, { unique: true });
  await db.collection("store_widgets").createIndex({ widget_id: 1 }, { unique: true });
  await db.collection("standings_snapshots").createIndex({ fileName: 1 }, { unique: true });
  await db.collection("standings_snapshots").createIndex({ effectiveDate: -1, mtimeMs: -1 });
  await db.collection("store_tags").createIndex({ slug: 1 }, { unique: true });
  await db.collection("store_tags").createIndex({ active: 1, order: 1, name: 1 });
  await db.collection("store_orders").createIndex({ user_id: 1, createdAt: -1 });
  await db.collection("store_orders").createIndex({ status: 1, createdAt: -1 });
  await db.collection("store_orders").createIndex({ "payment.provider": 1, "payment.token": 1 });
}
