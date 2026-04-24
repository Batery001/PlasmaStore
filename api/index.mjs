/**
 * Entrada serverless de Vercel: misma app Express que en local.
 * Rewrites en vercel.json envían /api/* y /store-media/* aquí.
 */
import "dotenv/config";
import { createApp } from "../server/src/app.mjs";

const app = createApp();
export default app;
