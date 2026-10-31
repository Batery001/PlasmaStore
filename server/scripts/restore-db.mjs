/**
 * Restaura un backup SQLite sobre local.sqlite.
 * ¡Detén el servidor antes!
 *
 * Uso:
 *   CONFIRM=YES npm run restore-db -- server/data/backups/plasma-store-XXXX.sqlite
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { loadProjectEnv } = await import("../src/loadProjectEnv.mjs");
loadProjectEnv(root);

if (String(process.env.CONFIRM || "").toUpperCase() !== "YES") {
  console.error('Abortado. Define CONFIRM=YES y pasa la ruta del .sqlite');
  console.error("Ejemplo: CONFIRM=YES npm run restore-db -- server/data/backups/archivo.sqlite");
  process.exit(1);
}

const arg = process.argv[2];
if (!arg) {
  console.error("Falta ruta del backup .sqlite");
  process.exit(1);
}

const src = path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), arg);
if (!fs.existsSync(src) || !src.endsWith(".sqlite")) {
  console.error("Archivo inválido:", src);
  process.exit(1);
}

const { dbFilePath } = await import("../src/sqliteMongo.mjs");
const dest = dbFilePath();
fs.mkdirSync(path.dirname(dest), { recursive: true });

const safety = `${dest}.pre-restore-${Date.now()}.bak`;
if (fs.existsSync(dest)) {
  fs.copyFileSync(dest, safety);
  console.log("Copia de seguridad previa:", safety);
}

fs.copyFileSync(src, dest);
console.log("Restaurado:", src, "→", dest);
console.log("Reinicia el servidor (npm run dev / start).");
process.exit(0);
