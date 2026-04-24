import type { VercelRequest, VercelResponse } from "@vercel/node";
import { json } from "../../../_lib/http";
import { supabaseAdmin } from "../../../_lib/supabase";

function parseYmd(s: string | null): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return t;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" });

  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "5"), 10) || 5));
  const from = parseYmd(typeof req.query.from === "string" ? req.query.from : null);
  const to = parseYmd(typeof req.query.to === "string" ? req.query.to : null);

  const sb = supabaseAdmin();
  let q = sb
    .from("standings_snapshots")
    .select("file_name, mtime_ms, parse_error, payload, has_finished_standings, effective_date")
    .order("effective_date", { ascending: false })
    .limit(limit);

  if (from) q = q.gte("effective_date", from);
  if (to) q = q.lte("effective_date", to);

  const { data, error } = await q;
  if (error) return json(res, 500, { ok: false, error: error.message });

  const tournaments =
    (data || []).map((r) => ({
      fileName: r.file_name,
      mtimeMs: r.mtime_ms,
      parseError: r.parse_error,
      payload: r.payload,
      hasFinishedStandings: r.has_finished_standings,
    })) ?? [];

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
    const { data: ovs, error: e2 } = await sb
      .from("tournament_deck_overrides")
      .select("k, entry")
      .in("k", Array.from(keys).slice(0, 5000));
    if (e2) return json(res, 500, { ok: false, error: e2.message });
    overrides = Object.fromEntries((ovs || []).map((r) => [r.k, r.entry]));
  }

  return json(res, 200, { ok: true, tournaments, overrides });
}

