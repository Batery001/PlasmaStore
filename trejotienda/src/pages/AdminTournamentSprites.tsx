import { useEffect, useState } from "react";
import { parseResponseJson } from "../lib/parseResponseJson";
import { deckRowKey } from "../lib/tournamentDeckKey";
import { DeckSpriteImg } from "../lib/DeckSpriteImg";
import { DECK_SPRITE_ADMIN_TABLE_PX, DECK_SPRITE_TABLE_INNER_SCALE } from "../lib/deckSpriteSizes";
import { DeckPokemonModal } from "../admin/DeckPokemonModal";
import adminStyles from "../admin/admin.module.css";

type StandRow = { place: number; name: string; playId: string };

type CategoryBlock = {
  division: string;
  categoryCode: string;
  standings?: StandRow[];
};

type TdfPayload = {
  tournamentName?: string;
  tournamentStartDate?: string;
  categories?: CategoryBlock[];
};

type TournamentSnap = {
  fileName: string;
  mtimeMs: number;
  parseError: string | null;
  payload: TdfPayload | null;
  hasFinishedStandings: boolean;
};

type OverrideEntry = {
  sprites?: string[];
  countryCode?: string;
  listUrl?: string;
};

type RecentRes = {
  ok?: boolean;
  error?: string;
  tournaments?: TournamentSnap[];
};

type EditTarget = {
  fileName: string;
  categoryCode: string;
  row: StandRow;
};

export function AdminTournamentSprites() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tournaments, setTournaments] = useState<TournamentSnap[]>([]);
  const [overrides, setOverrides] = useState<Record<string, OverrideEntry>>({});
  const [filePick, setFilePick] = useState("");
  const [catIdx, setCatIdx] = useState(0);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  async function loadAll() {
    setErr(null);
    setLoading(true);
    try {
      const [rT, rO] = await Promise.all([
        fetch("/api/public/tournaments/recent?limit=15"),
        fetch("/api/store/admin/tournament-deck-overrides", { credentials: "include" }),
      ]);
      const dT = await parseResponseJson<RecentRes>(rT);
      const dO = await parseResponseJson<{
        ok?: boolean;
        error?: string;
        overrides?: Record<string, OverrideEntry>;
      }>(rO);
      if (!rT.ok || dT.ok === false) throw new Error(dT.error || "No se pudieron cargar los torneos.");
      if (!rO.ok) throw new Error(dO.error || "No autorizado (inicia sesión como administrador).");
      const list = Array.isArray(dT.tournaments) ? dT.tournaments : [];
      setTournaments(list);
      setOverrides(dO.overrides && typeof dO.overrides === "object" ? dO.overrides : {});
      const firstWith = list.find((t) =>
        t.payload?.categories?.some((c) => Array.isArray(c.standings) && c.standings.length > 0),
      );
      setFilePick((prev) => {
        if (prev && list.some((x) => x.fileName === prev)) return prev;
        return firstWith?.fileName || list[0]?.fileName || "";
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const selected = tournaments.find((t) => t.fileName === filePick) || null;
  const categories = selected?.payload?.categories?.filter((c) => (c.standings?.length || 0) > 0) || [];
  const cat = categories[catIdx] || null;
  const rows = cat?.standings || [];

  useEffect(() => {
    if (catIdx >= categories.length) setCatIdx(0);
  }, [filePick, categories.length, catIdx]);

  const code = cat?.categoryCode != null ? String(cat.categoryCode) : "";

  async function patchOverride(body: Record<string, unknown>) {
    const res = await fetch("/api/store/admin/tournament-deck-overrides", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = await parseResponseJson<{
      ok?: boolean;
      error?: string;
      overrides?: Record<string, OverrideEntry>;
    }>(res);
    if (!res.ok || data.ok === false) throw new Error(data.error || "Error");
    if (data.overrides) setOverrides(data.overrides);
  }

  const editKey = editTarget
    ? deckRowKey(editTarget.fileName, editTarget.categoryCode, editTarget.row.playId)
    : "";
  const editInitial = editTarget ? overrides[editKey] || {} : {};

  return (
    <div>
      <h1 className={adminStyles.pageTitle}>Torneos · sprites y listas</h1>
      <p className={adminStyles.pageLead}>
        Pulsa <strong>Editar mazo</strong> y busca por <strong>nombre de Pokémon</strong> (incluye megas y formas); se guardan iconos menú Gen 8/9. Referencia del ecosistema{" "}
        <a href="https://limitlesstcg.com/" target="_blank" rel="noreferrer">
          LimitlessTCG
        </a>
        . Los datos se guardan en el servidor (JSON de overrides).
      </p>

      {loading ? (
        <p className={adminStyles.muted}>Cargando…</p>
      ) : err ? (
        <p className={adminStyles.error}>{err}</p>
      ) : (
        <>
          <div className={adminStyles.rowActions} style={{ marginBottom: "1rem" }}>
            <label className={adminStyles.muted}>
              Torneo (.tdf)&nbsp;
              <select
                value={filePick}
                onChange={(e) => {
                  setFilePick(e.target.value);
                  setCatIdx(0);
                }}
                style={{ marginLeft: "0.35rem", minWidth: "220px" }}
              >
                {tournaments.map((t) => (
                  <option key={t.fileName} value={t.fileName}>
                    {(t.payload?.tournamentName || t.fileName) + (t.parseError ? " (error)" : "")}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className={adminStyles.btn} onClick={() => void loadAll()}>
              Recargar
            </button>
          </div>

          {!selected ? (
            <p className={adminStyles.muted}>No hay torneos en el servidor.</p>
          ) : selected.parseError ? (
            <p className={adminStyles.error}>{selected.parseError}</p>
          ) : categories.length === 0 ? (
            <p className={adminStyles.muted}>Este archivo no tiene categorías con standings terminados.</p>
          ) : (
            <>
              <div className={adminStyles.rowActions} style={{ marginBottom: "0.75rem", flexWrap: "wrap" }}>
                {categories.map((c, i) => (
                  <button
                    key={c.division}
                    type="button"
                    className={i === catIdx ? adminStyles.btnPrimary : adminStyles.btn}
                    onClick={() => setCatIdx(i)}
                  >
                    {c.division}
                  </button>
                ))}
              </div>

              <div className={adminStyles.tableWrap}>
                <table className={adminStyles.table}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Jugador</th>
                      <th>Mazo (2 Pokémon)</th>
                      <th>País</th>
                      <th>Lista</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const k = deckRowKey(selected.fileName, code, row.playId);
                      const initial = overrides[k] || {};
                      const sprites = Array.isArray(initial.sprites) ? initial.sprites.filter(Boolean).slice(0, 4) : [];
                      const busy = rowBusy === k;
                      return (
                        <tr key={k}>
                          <td>{row.place}</td>
                          <td>{row.name}</td>
                          <td>
                            <div className={adminStyles.spriteDeckRow}>
                              {sprites.slice(0, 2).map((src, i) =>
                                src ? (
                                  <DeckSpriteImg
                                    key={i}
                                    src={src}
                                    size={DECK_SPRITE_ADMIN_TABLE_PX}
                                    spriteScale={DECK_SPRITE_TABLE_INNER_SCALE}
                                    frame="plain"
                                    variant="light"
                                    alt={`Mazo de ${row.name}${sprites.length > 1 ? ` (${i + 1})` : ""}`}
                                  />
                                ) : null,
                              )}
                              <button
                                type="button"
                                className={adminStyles.btnPrimary}
                                disabled={busy}
                                onClick={() =>
                                  setEditTarget({ fileName: selected.fileName, categoryCode: code, row })
                                }
                              >
                                Editar mazo
                              </button>
                            </div>
                          </td>
                          <td>{initial.countryCode || "—"}</td>
                          <td>
                            {initial.listUrl ? (
                              <a href={initial.listUrl} target="_blank" rel="noreferrer" className={adminStyles.btnLink}>
                                Abrir
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className={adminStyles.btnDanger}
                              disabled={busy}
                              onClick={async () => {
                                setRowBusy(k);
                                try {
                                  await patchOverride({
                                    fileName: selected.fileName,
                                    categoryCode: code,
                                    playId: row.playId,
                                    remove: true,
                                  });
                                } finally {
                                  setRowBusy(null);
                                }
                              }}
                            >
                              Quitar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      <DeckPokemonModal
        key={editTarget ? `${editTarget.fileName}|${editTarget.row.playId}` : "closed"}
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        initial={{
          sprites: Array.isArray(editInitial.sprites) ? editInitial.sprites : [],
          countryCode: editInitial.countryCode || "",
          listUrl: editInitial.listUrl || "",
        }}
        onSaved={async (payload) => {
          if (!editTarget) return;
          await patchOverride({
            fileName: editTarget.fileName,
            categoryCode: editTarget.categoryCode,
            playId: editTarget.row.playId,
            sprites: payload.sprites,
            countryCode: payload.countryCode,
            listUrl: payload.listUrl,
          });
        }}
      />
    </div>
  );
}
