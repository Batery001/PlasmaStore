/** Prueba Mongo fuera de Next (misma lógica que la API). */
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { loadProjectEnv } = await import("../src/loadProjectEnv.mjs");
loadProjectEnv(root);

try {
  const { getDb } = await import("../src/mongo.mjs");
  const db = await getDb();
  const n = await db.collection("store_users").countDocuments();
  console.log("[mongo-ping] OK. store_users count:", n);
  process.exit(0);
} catch (e) {
  console.error("[mongo-ping] Fallo:", e?.message || e);
  process.exit(1);
}
