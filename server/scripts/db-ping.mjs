/**
 * Ping de base de datos (SQLite o Mongo según DB_DRIVER).
 */
import { loadProjectEnv } from "../src/loadProjectEnv.mjs";
loadProjectEnv();

const { getDb, getDbDriver } = await import("../src/db.mjs");
const driver = getDbDriver();
const db = await getDb();
const n = await db.collection("store_users").countDocuments();
console.log(`[db-ping] driver=${driver} · store_users=${n}`);
process.exit(0);
