/**
 * Quita RUT de todas las cuentas (y pedidos) para poder reasignarlos.
 * No borra usuarios ni pedidos: solo limpia campos de RUT.
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

const usersBefore = await db.collection("store_users").countDocuments({
  $or: [{ rut: { $ne: null } }, { rut_normalized: { $ne: null } }, { rut: { $exists: true } }],
});

const usersRes = await db.collection("store_users").updateMany(
  {},
  { $set: { rut: null, rut_normalized: null } }
);

const ordersRes = await db.collection("store_orders").updateMany(
  {},
  {
    $set: {
      buyer_rut: null,
      buyer_rut_normalized: null,
      "fulfillment.rut": null,
    },
  }
);

try {
  flushSqlitePersist();
} catch {
  /* mongo */
}

console.log(
  JSON.stringify(
    {
      ok: true,
      users_with_rut_before: usersBefore,
      users_cleared: usersRes.modifiedCount ?? usersRes.matchedCount ?? 0,
      orders_touched: ordersRes.modifiedCount ?? ordersRes.matchedCount ?? 0,
    },
    null,
    2
  )
);
console.log("Listo: todos los RUT quedaron vacíos. Ya podés guardar el tuyo en Mi cuenta.");
