import { loadProjectEnv } from "./loadProjectEnv.mjs";
loadProjectEnv();
import { PORT } from "./config.mjs";
import { createApp, ensureServerReady } from "./app.mjs";

async function main() {
  const app = createApp();
  await ensureServerReady();
  const port = PORT();
  app.listen(port, () => {
    console.log(`[plasma-store-api] http://127.0.0.1:${port}`);
    console.log(`[plasma-store-api] MongoDB: ${process.env.MONGODB_DB || "plasmastore"}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
