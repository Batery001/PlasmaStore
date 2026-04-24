import { json } from "./_lib/http";
import { supabaseAdmin } from "./_lib/supabase";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" });
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("standings_pending")
    .select("file_name, mtime_ms, parse_error, payload")
    .eq("id", 1)
    .maybeSingle();
  if (error) return json(res, 500, { ok: false, error: error.message });
  if (!data?.file_name) return json(res, 200, { ok: true, pending: { fileName: "", mtimeMs: 0, payload: null, parseError: null, hasFinishedStandings: false } });
  const hasFinishedStandings = !!(
    data.payload &&
    Array.isArray((data.payload as any).categories) &&
    (data.payload as any).categories.some((c: any) => Array.isArray(c?.standings) && c.standings.length > 0)
  );
  return json(res, 200, {
    ok: !data.parse_error,
    pending: {
      fileName: data.file_name,
      mtimeMs: data.mtime_ms,
      payload: data.payload,
      parseError: data.parse_error,
      hasFinishedStandings,
    },
  });
}

