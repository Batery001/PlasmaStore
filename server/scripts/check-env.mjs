/**
 * Comprueba que las variables mínimas existan (sin conectar a Mongo).
 * Uso: npm run check-env  (desde la raíz _plasma_upload)
 */
import { loadProjectEnv } from "../src/loadProjectEnv.mjs";

loadProjectEnv();

const required = ["MONGODB_URI", "APP_SESSION_SECRET"];
const missing = required.filter((k) => !process.env[k] || !String(process.env[k]).trim());

if (missing.length) {
  console.error("[check-env] Faltan variables:", missing.join(", "));
  console.error("Copia .env.example → .env.local en la raíz del proyecto y rellénalas.");
  process.exit(1);
}

const uri = String(process.env.MONGODB_URI);
if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://")) {
  console.error("[check-env] MONGODB_URI no parece un URI de MongoDB.");
  process.exit(1);
}

const secret = String(process.env.APP_SESSION_SECRET);
if (secret.length < 32) {
  console.warn("[check-env] Aviso: APP_SESSION_SECRET conviene que tenga al menos 32 caracteres.");
}

console.log("[check-env] OK: MONGODB_URI y APP_SESSION_SECRET están definidas.");
console.log("[check-env] Base de datos:", process.env.MONGODB_DB?.trim() || "plasmastore (por defecto)");
process.exit(0);
