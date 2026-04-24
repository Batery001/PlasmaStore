import { json } from "./_lib/http";
import { mongoDb } from "./_lib/mongo";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" });
  const db = await mongoDb();
  const doc: any = await db.collection("standings_pending").findOne({ _id: 1 });
  if (!doc?.fileName)
    return json(res, 200, {
      ok: true,
      pending: { fileName: "", mtimeMs: 0, payload: null, parseError: null, hasFinishedStandings: false },
    });
  const hasFinishedStandings = !!(
    doc.payload &&
    Array.isArray((doc.payload as any).categories) &&
    (doc.payload as any).categories.some((c: any) => Array.isArray(c?.standings) && c.standings.length > 0)
  );
  return json(res, 200, {
    ok: !doc.parseError,
    pending: {
      fileName: doc.fileName,
      mtimeMs: doc.mtimeMs,
      payload: doc.payload,
      parseError: doc.parseError,
      hasFinishedStandings,
    },
  });
}

