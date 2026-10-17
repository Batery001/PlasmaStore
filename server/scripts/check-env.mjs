/**
 * Comprueba variables mínimas según el driver (SQLite local o Mongo).
 * Uso: npm run check-env
 */
import { loadProjectEnv } from "../src/loadProjectEnv.mjs";

loadProjectEnv();

const driver = String(process.env.DB_DRIVER || "").trim().toLowerCase() || (process.env.MONGODB_URI ? "mongo" : "sqlite");
const effective = driver === "sql" ? "sqlite" : driver === "mongo" ? "mongo" : "sqlite";

const secret = process.env.APP_SESSION_SECRET ? String(process.env.APP_SESSION_SECRET).trim() : "";
if (!secret) {
  console.error("[check-env] Falta APP_SESSION_SECRET.");
  console.error("Copia .env.example → .env.local y rellénalo.");
  process.exit(1);
}
if (secret.length < 16) {
  console.warn("[check-env] Aviso: APP_SESSION_SECRET conviene que sea más largo.");
}

if (effective === "mongo") {
  const uri = process.env.MONGODB_URI ? String(process.env.MONGODB_URI).trim() : "";
  if (!uri) {
    console.error("[check-env] DB_DRIVER=mongo pero falta MONGODB_URI.");
    process.exit(1);
  }
  if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://")) {
    console.error("[check-env] MONGODB_URI no parece un URI de MongoDB.");
    process.exit(1);
  }
  console.log("[check-env] OK · driver=mongo · db=", process.env.MONGODB_DB?.trim() || "plasmastore");
} else {
  console.log("[check-env] OK · driver=sqlite · archivo=server/data/local.sqlite (o SQLITE_PATH)");
}

process.exit(0);
