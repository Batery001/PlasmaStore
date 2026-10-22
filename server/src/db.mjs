/**
 * Selector de base de datos:
 * - DB_DRIVER=sqlite (recomendado en local) → SQLite en server/data/local.sqlite
 * - DB_DRIVER=mongo → MongoDB Atlas / local
 *
 * Si no hay DB_DRIVER y falta MONGODB_URI, usa SQLite automáticamente.
 */
import { loadProjectEnv } from "./loadProjectEnv.mjs";
loadProjectEnv();

function resolveDriver() {
  const forced = String(process.env.DB_DRIVER || "").trim().toLowerCase();
  if (forced === "sqlite" || forced === "sql" || forced === "mongo") {
    return forced === "sql" ? "sqlite" : forced;
  }
  const uri = process.env.MONGODB_URI ? String(process.env.MONGODB_URI).trim() : "";
  if (!uri) return "sqlite";
  return "mongo";
}

export function getDbDriver() {
  return resolveDriver();
}

export async function getDb() {
  const driver = resolveDriver();
  if (driver === "sqlite") {
    const { ensureSqliteReady } = await import("./sqliteMongo.mjs");
    return ensureSqliteReady();
  }
  const { getDb: getMongoDb } = await import("./mongo.mjs");
  return getMongoDb();
}

export async function ensureIndexes(db) {
  const driver = resolveDriver();
  if (driver === "sqlite") return;
  const mongo = await import("./mongo.mjs");
  return mongo.ensureIndexes(db);
}
