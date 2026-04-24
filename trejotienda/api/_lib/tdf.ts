import { XMLParser } from "fast-xml-parser";

function asArray<T>(v: T | T[] | null | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function buildPlayerMap(root: any) {
  const players = asArray(root?.players?.player);
  const map = new Map<string, { firstname: string; lastname: string }>();
  for (const p of players) {
    const id = p?.["@_userid"] ?? p?.["@_user"] ?? p?.userid;
    const uid = id != null ? String(id) : "";
    if (!uid) continue;
    map.set(uid, { firstname: String(p?.firstname ?? ""), lastname: String(p?.lastname ?? "") });
  }
  return map;
}

const CATEGORY_LABEL: Record<string, string> = {
  "1": "Masters",
  "2": "Seniors",
  "3": "Juniors",
};

export function parseTdf(xmlText: string, fileName: string) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  let root: any;
  try {
    root = parser.parse(xmlText)?.tournament;
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e), payload: null };
  }
  if (!root) return { ok: false as const, error: "XML sin nodo raíz tournament", payload: null };

  const tournamentName = String(root?.data?.name ?? "").trim();
  const tournamentStartDate = String(root?.data?.startdate ?? "").trim();
  const fileFormatVersion = root?.["@_version"] != null ? String(root["@_version"]) : "";
  const playerMap = buildPlayerMap(root);
  const pods = asArray(root?.standings?.pod);

  const warnings: string[] = [];
  const categories: any[] = [];
  for (const pod of pods) {
    const type = pod?.["@_type"] != null ? String(pod["@_type"]) : "";
    if (type !== "finished") continue;
    const catCode = pod?.["@_category"] != null ? String(pod["@_category"]) : "";
    const plist = asArray(pod?.player)
      .map((row) => ({
        id: row?.["@_id"] != null ? String(row["@_id"]) : "",
        place: row?.["@_place"] != null ? parseInt(String(row["@_place"]), 10) : NaN,
      }))
      .filter((r) => r.id && Number.isFinite(r.place));
    if (plist.length === 0) continue;
    plist.sort((a, b) => a.place - b.place);
    const standings = plist.map((row) => {
      const info = playerMap.get(row.id) || { firstname: "", lastname: "" };
      const name = `${info.firstname} ${info.lastname}`.trim() || row.id;
      return { place: row.place, name, playId: row.id };
    });
    const division = CATEGORY_LABEL[catCode] || `Categoría (${catCode || "?"})`;
    categories.push({ division, categoryCode: catCode, standings });
  }

  if (categories.length === 0) {
    warnings.push("No hay standings “finished” con jugadores en el .tdf (torneo sin cerrar o archivo intermedio).");
  }

  const payload = {
    source: "tdf",
    sourceFile: fileName,
    tournamentName,
    tournamentStartDate,
    fileFormatVersion,
    generatedAt: "",
    categories,
    warnings,
  };

  return { ok: true as const, error: null, payload };
}

