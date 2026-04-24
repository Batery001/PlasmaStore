import "dotenv/config";
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

/** Inicializa Mongo una sola vez por instancia (local o serverless). */
export function ensureServerReady() {
  if (!initPromise) {
    initPromise = (async () => {
      const db = await getDb();
      await ensureIndexes(db);
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
  const raw = req.url || "";
  const q = raw.indexOf("?");
  if (q === -1) return next();
  const pathname = raw.slice(0, q);
  if (pathname !== "/api/index" && pathname !== "/api") return next();
  const params = new URLSearchParams(raw.slice(q + 1));
  const pathSeg = params.get("path");
  if (!pathSeg || pathSeg.includes("..")) return next();
  params.delete("path");
  const rest = params.toString();
  const suffix = rest ? `?${rest}` : "";
  const tail = pathSeg.replace(/^\/+/, "");
  if (tail.startsWith("store-media/") || tail === "store-media") {
    req.url = `/${tail}${suffix}`;
  } else {
    req.url = `/api/${tail}${suffix}`;
  }
  next();
}

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);

  app.use(vercelRewriteUrlFix);

  app.use((req, res, next) => {
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
