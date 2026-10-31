/**
 * Copia el SQLite local (o dump JSON Mongo) a server/data/backups/ con rotación.
 * Uso: npm run backup-db
 * Cron VPS ejemplo (03:00): 0 3 * * * cd /ruta/app && npm run backup-db >> /var/log/plasma-backup.log 2>&1
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { loadProjectEnv } = await import("../src/loadProjectEnv.mjs");
loadProjectEnv(root);

const KEEP = Math.max(1, parseInt(String(process.env.BACKUP_KEEP || "14"), 10) || 14);
const backupDir = path.join(root, "server", "data", "backups");
fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const { getDbDriver } = await import("../src/db.mjs");
const driver = getDbDriver();

if (driver === "sqlite") {
  const { flushSqlitePersist, dbFilePath } = await import("../src/sqliteMongo.mjs");
  flushSqlitePersist();
  const src = dbFilePath();
  if (!fs.existsSync(src)) {
    console.error("SQLite no encontrado:", src);
    process.exit(1);
  }
  const dest = path.join(backupDir, `plasma-store-${stamp}.sqlite`);
  fs.copyFileSync(src, dest);
  console.log("Backup SQLite:", dest);
} else {
  const { getDb } = await import("../src/db.mjs");
  const db = await getDb();
  const collections = [
    "store_users",
    "store_orders",
    "products",
    "store_settings",
    "event_registrations",
    "store_tags",
    "cart_items",
    "store_wishlist",
    "store_coupons",
    "stock_movements",
  ];
  /** @type {Record<string, unknown[]>} */
  const dump = {};
  for (const name of collections) {
    try {
      dump[name] = await db.collection(name).find({}).limit(50000).toArray();
    } catch {
      dump[name] = [];
    }
  }
  const dest = path.join(backupDir, `plasma-store-${stamp}.json`);
  fs.writeFileSync(dest, JSON.stringify({ exported_at: new Date().toISOString(), driver, collections: dump }, null, 2));
  console.log("Backup JSON:", dest);
}

const files = fs
  .readdirSync(backupDir)
  .filter((f) => f.startsWith("plasma-store-") && (f.endsWith(".sqlite") || f.endsWith(".json")))
  .map((f) => ({ f, m: fs.statSync(path.join(backupDir, f)).mtimeMs }))
  .sort((a, b) => b.m - a.m);

for (const row of files.slice(KEEP)) {
  fs.unlinkSync(path.join(backupDir, row.f));
  console.log("Rotado (borrado):", row.f);
}

console.log(`Listo. Se conservan hasta ${KEEP} respaldos en ${backupDir}`);
process.exit(0);
