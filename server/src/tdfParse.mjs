import { XMLParser } from "fast-xml-parser";

const CATEGORY_LABEL = {
  "0": "Categoría Junior",
  "1": "Categoría Senior",
  "2": "Categoría Máster",
};

function asArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function buildPlayerMap(root) {
  const players = asArray(root?.players?.player);
  const map = new Map();
  for (const p of players) {
    const id = p["@_userid"] ?? p["@_user"] ?? p.userid;
    const uid = id != null ? String(id) : null;
    if (!uid) continue;
    map.set(uid, {
      firstname: String(p.firstname ?? ""),
      lastname: String(p.lastname ?? ""),
    });
  }
  return map;
}

/**
 * @param {string} xmlText
 * @param {string} fileName
 */
export function parseTdf(xmlText, fileName) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });
  let root;
  try {
    root = parser.parse(xmlText).tournament;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      payload: null,
    };
  }

  if (!root) {
    return { ok: false, error: "XML sin nodo raíz tournament", payload: null };
  }

  const tournamentName = String(root.data?.name ?? "").trim();
  const tournamentStartDate = String(root.data?.startdate ?? "").trim();
  const fileFormatVersion = root["@_version"] != null ? String(root["@_version"]) : "";
  const playerMap = buildPlayerMap(root);

  const pods = asArray(root.standings?.pod);
  const warnings = [];

  const categories = [];
  for (const pod of pods) {
    const type = pod["@_type"] != null ? String(pod["@_type"]) : "";
    if (type !== "finished") continue;

    const catCode = pod["@_category"] != null ? String(pod["@_category"]) : "";
    const plist = asArray(pod.player)
      .map((row) => ({
        id: row["@_id"] != null ? String(row["@_id"]) : "",
        place: row["@_place"] != null ? parseInt(String(row["@_place"]), 10) : NaN,
      }))
      .filter((r) => r.id && Number.isFinite(r.place));

    if (plist.length === 0) continue;

    plist.sort((a, b) => a.place - b.place);
    const standings = plist.map((row) => {
      const info = playerMap.get(row.id) || { firstname: "", lastname: "" };
      const name = `${info.firstname} ${info.lastname}`.trim() || row.id;
      return {
        place: row.place,
        name,
        playId: row.id,
      };
    });
    const top4 = standings.slice(0, 4).map((row) => ({
      Clasificación: String(row.place),
      Nombre: row.name,
      "Play! ID": row.playId,
    }));

    const division = CATEGORY_LABEL[catCode] || `Categoría (${catCode || "?"})`;

    categories.push({
      division,
      categoryCode: catCode,
      headers: ["Clasificación", "Nombre", "Play! ID"],
      rows: top4,
      standings,
    });
  }

  if (categories.length === 0) {
    warnings.push(
      "No hay standings “finished” con jugadores en el .tdf (torneo sin cerrar o archivo intermedio)."
    );
  }

  let roundCount = 0;
  const podNode = root.pods?.pod;
  const firstPod = Array.isArray(podNode) ? podNode[0] : podNode;
  if (firstPod?.rounds?.round != null) {
    roundCount = asArray(firstPod.rounds.round).length;
  }

  const payload = {
    source: "tdf",
    sourceFile: fileName,
    tournamentName,
    tournamentStartDate,
    fileFormatVersion,
    roundCurrent: roundCount || null,
    roundTotal: roundCount || null,
    roundLabel: roundCount ? `Rondas en archivo: ${roundCount}` : "",
    generatedAt: "",
    categories: categories.map((c) => ({
      division: c.division,
      categoryCode: c.categoryCode,
      top4: c.rows,
      standings: c.standings,
    })),
    warnings: [...warnings],
  };

  return { ok: true, error: null, payload };
}
