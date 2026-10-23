/**
 * Quita RUT de todas las cuentas (y pedidos) para poder reasignarlos.
 * Compatible con SQLite (sql.js) y Mongo.
 *
 * Uso (VPS o local):
 *   CONFIRM=YES npm run clear-all-ruts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { loadProjectEnv } = await import("../src/loadProjectEnv.mjs");
loadProjectEnv(root);

if (String(process.env.CONFIRM || "").trim().toUpperCase() !== "YES") {
  console.error("Abortado. Para confirmar: CONFIRM=YES npm run clear-all-ruts");
  process.exit(1);
}

const { getDb } = await import("../src/db.mjs");
const { flushSqlitePersist } = await import("../src/sqliteMongo.mjs");

const db = await getDb();

async function clearCollection(name, patch) {
  const col = db.collection(name);
  const rows = await col.find({}).toArray();
  let cleared = 0;
  for (const row of rows) {
    const hasRut =
      row.rut != null ||
      row.rut_normalized != null ||
      row.buyer_rut != null ||
      row.buyer_rut_normalized != null ||
      row.fulfillment?.rut != null;
    if (!hasRut && name === "store_users") {
      // Igual limpiamos por si hay string vacío
      if (!row.rut && !row.rut_normalized) continue;
    }
    await col.updateOne({ _id: row._id }, { $set: patch });
    cleared += 1;
  }
  return { total: rows.length, cleared };
}

const users = await clearCollection("store_users", { rut: null, rut_normalized: null });
const orders = await clearCollection("store_orders", {
  buyer_rut: null,
  buyer_rut_normalized: null,
  "fulfillment.rut": null,
});

try {
  flushSqlitePersist();
} catch {
  /* mongo */
}

console.log(
  JSON.stringify(
    {
      ok: true,
      users_total: users.total,
      users_cleared: users.cleared,
      orders_total: orders.total,
      orders_cleared: orders.cleared,
    },
    null,
    2
  )
);
console.log("Listo: todos los RUT quedaron vacíos. Ya podés guardar el tuyo en Mi cuenta.");
