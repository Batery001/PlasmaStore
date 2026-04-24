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
export function createApp() {
  const app = express();
  app.set("trust proxy", 1);

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
