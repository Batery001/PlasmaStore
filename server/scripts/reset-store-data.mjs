/**
 * Limpia datos de prueba: cuentas (no admin), pedidos, carritos, mazos, etc.
 * Conserva: productos, tags, ajustes (pagos/envíos/mail/contenido) y admins.
 *
 * Uso (VPS o local):
 *   CONFIRM=YES npm run reset-store-data
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { loadProjectEnv } = await import("../src/loadProjectEnv.mjs");
loadProjectEnv(root);

if (String(process.env.CONFIRM || "").trim().toUpperCase() !== "YES") {
  console.error("Abortado. Para confirmar: CONFIRM=YES npm run reset-store-data");
  process.exit(1);
}

const { getDb } = await import("../src/db.mjs");
const { flushSqlitePersist } = await import("../src/sqliteMongo.mjs");

const db = await getDb();

/** @type {Array<{ name: string, filter?: Record<string, unknown> }>} */
const wipe = [
  { name: "cart_items" },
  { name: "store_orders" },
  { name: "event_registrations" },
  { name: "player_decks" },
  { name: "auth_tokens" },
  { name: "stock_reservations" },
  { name: "stock_movements" },
];

const summary = [];

for (const item of wipe) {
  const col = db.collection(item.name);
  const before = await col.countDocuments(item.filter || {});
  const r = await col.deleteMany(item.filter || {});
  const deleted = typeof r?.deletedCount === "number" ? r.deletedCount : before;
  summary.push({ collection: item.name, deleted });
  console.log(`· ${item.name}: ${deleted} eliminados`);
}

const users = await db.collection("store_users").find({}).toArray();
let usersDeleted = 0;
let adminsKept = 0;
for (const u of users) {
  if (u.role === "admin") {
    adminsKept += 1;
    continue;
  }
  await db.collection("store_users").deleteOne({ _id: u._id });
  usersDeleted += 1;
}
summary.push({ collection: "store_users (no admin)", deleted: usersDeleted });
console.log(`· store_users: ${usersDeleted} clientes borrados, ${adminsKept} admin(s) conservados`);

/** Reinicia contadores de pedidos / registros (no toca product). */
for (const name of ["order", "event_registration", "user"]) {
  const row = await db.collection("counters").findOne({ _id: name });
  if (!row) continue;
  if (name === "user") {
    const maxAdmin = users
      .filter((u) => u.role === "admin")
      .reduce((m, u) => Math.max(m, Number(u._id) || 0), 0);
    await db.collection("counters").updateOne({ _id: "user" }, { $set: { seq: Math.max(0, maxAdmin) } }, { upsert: true });
    console.log(`· counters.user → ${Math.max(0, maxAdmin)}`);
  } else {
    await db.collection("counters").updateOne({ _id: name }, { $set: { seq: 0 } }, { upsert: true });
    console.log(`· counters.${name} → 0`);
  }
}

try {
  flushSqlitePersist();
} catch {
  /* mongo */
}

console.log("\nListo. Se conservaron productos, tags, ajustes y admins.");
console.log("Si no hay admin: npm run create-admin");
process.exit(0);
