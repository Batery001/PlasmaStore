import type { NextApiRequest, NextApiResponse } from "next";
import type { Express } from "express";

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
    responseLimit: false,
  },
};

type CreateAppModule = { createApp: () => Express };

let cachedApp: Express | null = null;

async function getApp(): Promise<Express> {
  if (!cachedApp) {
    const mod = (await import("../../../server/src/app.mjs")) as CreateAppModule;
    cachedApp = mod.createApp();
  }
  return cachedApp;
}

/** Next optional catch-all: reconstruye la URL que Express espera. */
function rebuildUrlFromCatchAll(req: NextApiRequest): string {
  const slug = req.query.slug;
  const segments: string[] = Array.isArray(slug)
    ? slug.map(String)
    : slug != null
      ? [String(slug)]
      : [];
  const tail = segments.join("/");
  const q = new URLSearchParams();
  for (const [key, val] of Object.entries(req.query)) {
    if (key === "slug") continue;
    if (val === undefined) continue;
    if (Array.isArray(val)) val.forEach((v) => q.append(key, String(v)));
    else q.append(key, String(val));
  }
  const qs = q.toString();
  const base = tail.length === 0 ? "/api" : `/api/${tail}`;
  return qs ? `${base}?${qs}` : base;
}

/** Rewrite interno: /store-media/* → /api/store-media/* (next.config). */
function applyStoreMediaRewrite(url: string): string {
  const pathOnly = url.split("?")[0];
  const qs = url.includes("?") ? url.slice(url.indexOf("?")) : "";
  if (!pathOnly.startsWith("/api/store-media")) return url;
  const rest = pathOnly.slice("/api/store-media".length);
  const normalized = rest.startsWith("/") ? rest : `/${rest}`;
  return `/store-media${normalized === "/" ? "" : normalized}${qs}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let url = rebuildUrlFromCatchAll(req);
  url = applyStoreMediaRewrite(url);
  req.url = url;
  delete (req as { _parsedUrl?: unknown })._parsedUrl;
  const app = await getApp();
  app(req, res);
}
