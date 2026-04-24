import { loadProjectEnv } from "./loadProjectEnv.mjs";
loadProjectEnv();
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { FRONTEND_ORIGIN } from "./config.mjs";
import { ensureIndexes, getDb } from "./mongo.mjs";
import { mountStoreRoutes } from "./storeRoutes.mjs";
import { mountTournamentRoutes } from "./tournamentRoutes.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = path.join(__dirname, "..", "data", "store-uploads");

let initPromise = null;

/** Inicializa Mongo una sola vez por instancia (local o serverless). Si falla, se puede reintentar en la siguiente petición. */
export function ensureServerReady() {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const db = await getDb();
        await ensureIndexes(db);
      } catch (e) {
        initPromise = null;
        throw e;
      }
    })();
  }
  return initPromise;
}

/**
 * @returns {import('express').Express}
 */
/**
 * Vercel reescribe /api/store/login → /api/index?path=store/login (y /store-media/… igual).
 * Sin esto, Express no coincide con rutas /api/store/... y falla el login y el resto de la API.
 */
function vercelRewriteUrlFix(req, _res, next) {
  if (!process.env.VERCEL) return next();

  const full = String(req.originalUrl || req.url || "");
  const pathname = full.split("?")[0];

  /** Vercel a veces pone `path` solo en `req.query` y `req.url` sin `?`. */
  let pathSeg = null;
  if (req.query?.path != null) {
    const raw = Array.isArray(req.query.path) ? req.query.path[0] : req.query.path;
    if (typeof raw === "string" && raw.trim()) pathSeg = raw.trim();
  }
  if (!pathSeg) {
    const q = full.indexOf("?");
    if (q !== -1) pathSeg = new URLSearchParams(full.slice(q + 1)).get("path") || null;
  }
  if (!pathSeg || pathSeg.includes("..")) return next();

  try {
    pathSeg = decodeURIComponent(pathSeg);
  } catch {
    /* usar tal cual */
  }

  if (pathname !== "/api/index" && pathname !== "/api") return next();

  let suffix = "";
  const q = full.indexOf("?");
  if (q !== -1) {
    const params = new URLSearchParams(full.slice(q + 1));
    params.delete("path");
    const rest = params.toString();
    if (rest) suffix = `?${rest}`;
  } else if (req.query && typeof req.query === "object") {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query)) {
      if (k === "path") continue;
      const val = Array.isArray(v) ? v[0] : v;
      if (val != null && val !== "") params.append(k, String(val));
    }
    const rest = params.toString();
    if (rest) suffix = `?${rest}`;
  }

  const tail = pathSeg.replace(/^\/+/, "");
  if (tail.startsWith("store-media/") || tail === "store-media") {
    req.url = `/${tail}${suffix}`;
  } else {
    req.url = `/api/${tail}${suffix}`;
  }
  /** Express cachea la URL parseada; sin esto puede seguir enrutando a la ruta antigua. */
  delete req._parsedUrl;
  next();
}

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);

  app.use(vercelRewriteUrlFix);

  app.use((req, res, next) => {
    const pathOnly = String(req.path || "").split("?")[0];
    /** Liveness sin Mongo (el handler no usa BD). */
    if (pathOnly === "/api/health") return next();
    ensureServerReady()
      .then(() => next())
      .catch(next);
  });

  const origin = FRONTEND_ORIGIN();
  app.use(
    cors({
      origin: origin || true,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use("/store-media", express.static(uploadRoot));

  mountStoreRoutes(app, { getDb, uploadRoot });
  mountTournamentRoutes(app, { getDb });

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : "Error interno" });
  });

  return app;
}
