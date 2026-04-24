import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { FRONTEND_ORIGIN, PORT } from "./config.mjs";
import { ensureIndexes, getDb } from "./mongo.mjs";
import { mountStoreRoutes } from "./storeRoutes.mjs";
import { mountTournamentRoutes } from "./tournamentRoutes.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = path.join(__dirname, "..", "data", "store-uploads");

async function main() {
  const db = await getDb();
  await ensureIndexes(db);

  const app = express();
  app.set("trust proxy", 1);

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

  const port = PORT();
  app.listen(port, () => {
    console.log(`[plasma-store-api] http://127.0.0.1:${port}`);
    console.log(`[plasma-store-api] MongoDB: ${process.env.MONGODB_DB || "plasmastore"} · /store-media → ${uploadRoot}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
