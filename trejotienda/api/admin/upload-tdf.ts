import Busboy from "busboy";
import { json } from "../_lib/http";
import { mongoDb } from "../_lib/mongo";
import { parseTdf } from "../_lib/tdf";
import { parseTournamentDateString, ymd } from "../_lib/date";

async function readMultipartTdf(req: any): Promise<{ fileName: string; text: string }> {
  return await new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { fileSize: 3 * 1024 * 1024, files: 1 } });
    let fileName = "";
    let buf: Buffer[] = [];
    let sawFile = false;

    bb.on("file", (fieldname, file, info) => {
      if (fieldname !== "tdf") {
        file.resume();
        return;
      }
      sawFile = true;
      fileName = info?.filename || "upload.tdf";
      file.on("data", (d) => buf.push(d));
      file.on("limit", () => reject(new Error("Archivo demasiado grande.")));
    });
    bb.on("error", (e) => reject(e));
    bb.on("finish", () => {
      if (!sawFile) return reject(new Error("Falta el archivo .tdf (campo del formulario: tdf)."));
      const text = Buffer.concat(buf).toString("utf8");
      resolve({ fileName, text });
    });
    req.pipe(bb);
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

  try {
    const { fileName, text } = await readMultipartTdf(req);
    const base = String(fileName).split(/[\\/]/).pop() || "upload.tdf";
    const mtimeMs = Date.now();
    const parsed = parseTdf(text, base);
    const payload = parsed.ok ? parsed.payload : null;
    const parseError = parsed.ok ? null : parsed.error || "Error al parsear";
    const hasFinishedStandings = !!(
      payload &&
      Array.isArray((payload as any).categories) &&
      (payload as any).categories.some((c: any) => Array.isArray(c?.standings) && c.standings.length > 0)
    );

    const eff = payload?.tournamentStartDate ? parseTournamentDateString(String(payload.tournamentStartDate)) : null;
    const effectiveDate = ymd(eff || new Date(mtimeMs));

    const db = await mongoDb();

    await db.collection("standings_snapshots").insertOne({
      fileName: base,
      mtimeMs,
      effectiveDate,
      parseError,
      payload,
      hasFinishedStandings,
      createdAt: new Date(),
    });

    await db.collection("standings_pending").updateOne(
      { _id: 1 },
      {
        $set: {
          fileName: base,
          mtimeMs,
          parseError,
          payload,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    return json(res, 200, {
      ok: !parseError,
      pending: { fileName: base, mtimeMs, payload, parseError, hasFinishedStandings },
    });
  } catch (e) {
    return json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}

