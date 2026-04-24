import { json } from "../../../_lib/http.js";
import { mongoDb } from "../../../_lib/mongo.js";

function parseYmd(s: string | null): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return t;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" });

  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "5"), 10) || 5));
  const from = parseYmd(typeof req.query.from === "string" ? req.query.from : null);
  const to = parseYmd(typeof req.query.to === "string" ? req.query.to : null);

  const db = await mongoDb();
  const match: any = {};
  if (from) match.effectiveDate = { ...(match.effectiveDate || {}), $gte: from };
  if (to) match.effectiveDate = { ...(match.effectiveDate || {}), $lte: to };

  const rows = await db
    .collection("standings_snapshots")
    .find(match)
    .sort({ effectiveDate: -1 })
    .limit(limit)
    .toArray();

  const tournaments = rows.map((r: any) => ({
    fileName: r.fileName,
    mtimeMs: r.mtimeMs,
    parseError: r.parseError ?? null,
    payload: r.payload ?? null,
    hasFinishedStandings: Boolean(r.hasFinishedStandings),
  }));

  // overrides “slim”: solo llaves que aparecen en los torneos entregados.
  const keys = new Set<string>();
  for (const t of tournaments) {
    const cats = (t.payload as any)?.categories;
    if (!Array.isArray(cats)) continue;
    for (const c of cats) {
      const code = c?.categoryCode != null ? String(c.categoryCode) : "";
      const standings = Array.isArray(c?.standings) ? c.standings : [];
      for (const row of standings) {
        const playId = row?.playId != null ? String(row.playId) : "";
        if (!playId) continue;
        // Debe coincidir con `deckRowKey` del frontend: `${fileName}|${cc}|${playId}`
        const cc = code !== "" ? code : "_";
        keys.add(`${t.fileName}|${cc}|${playId}`);
      }
    }
  }

  let overrides: Record<string, any> = {};
  if (keys.size > 0) {
    const ovs = await db
      .collection("tournament_deck_overrides")
      .find({ k: { $in: Array.from(keys).slice(0, 5000) } })
      .project({ _id: 0, k: 1, entry: 1 })
      .toArray();
    overrides = Object.fromEntries(ovs.map((r: any) => [r.k, r.entry]));
  }

  return json(res, 200, { ok: true, tournaments, overrides });
}

