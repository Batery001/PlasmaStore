/**
 * Carga variables desde la raíz del proyecto (carpeta con package.json de Next).
 * Orden: .env → server/.env (rellena huecos) → .env.local (prioridad en local).
 * En Vercel no hay archivos: solo aplica el panel de Environment Variables.
 */
import path from "node:path";
import dotenv from "dotenv";

/**
 * @param {string} [projectRoot] Por defecto process.cwd()
 */
export function loadProjectEnv(projectRoot = process.cwd()) {
  const r = path.resolve(projectRoot);
  dotenv.config({ path: path.join(r, ".env") });
  dotenv.config({ path: path.join(r, "server", ".env") });
  dotenv.config({ path: path.join(r, ".env.local"), override: true });
}
