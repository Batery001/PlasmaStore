import { useCallback, useEffect, useState } from "react";
import { parseResponseJson } from "../lib/parseResponseJson";
import { deckRowKey } from "../lib/tournamentDeckKey";
import { DeckSpriteImg } from "../lib/DeckSpriteImg";
import {
  DECK_SPRITE_TORNEOS_TABLE_INNER_SCALE,
  DECK_SPRITE_TORNEOS_TABLE_PX,
} from "../lib/deckSpriteSizes";
import styles from "./pages.module.css";
import tstyles from "./torneos.module.css";

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
  tournaments?: TournamentSnap[];
  overrides?: Record<string, OverrideEntry>;
};

/** Código ISO 3166-1 alpha-2 → bandera emoji (p. ej. JP → 🇯🇵). */
function countryCodeToFlagEmoji(code: string | undefined): string {
  if (!code || typeof code !== "string") return "";
  const s = code.trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (s.length !== 2) return "";
  const base = 0x1f1e6; // regional indicator symbol letter A
  const a = "A".charCodeAt(0);
  try {
    return String.fromCodePoint(base + (s.charCodeAt(0) - a), base + (s.charCodeAt(1) - a));
  } catch {
    return "";
  }
}

export function Torneos() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [tournaments, setTournaments] = useState<TournamentSnap[]>([]);
  const [overrides, setOverrides] = useState<Record<string, OverrideEntry>>({});
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "5" });
      if (dateFrom.trim()) params.set("from", dateFrom.trim());
      if (dateTo.trim()) params.set("to", dateTo.trim());
      const res = await fetch(`/api/public/tournaments/recent?${params.toString()}`);
      const data = await parseResponseJson<RecentRes & { error?: string }>(res);
      if (!res.ok || data.ok === false) throw new Error(data.error || "Error al cargar torneos.");
      setTournaments(Array.isArray(data.tournaments) ? data.tournaments : []);
      setOverrides(data.overrides && typeof data.overrides === "object" ? data.overrides : {});
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al cargar.");
      setTournaments([]);
      setOverrides({});
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className={styles.pageTitle}>Torneos</h1>
      <p className={styles.muted}>
        Standings de los últimos <strong>.tdf subidos</strong> al servidor (pod terminado). Los iconos de mazo los configura un
        administrador desde el panel.
      </p>

      <div className={tstyles.filters}>
        <div className={tstyles.filterField}>
          <label htmlFor="tor-from">Desde</label>
          <input id="tor-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className={tstyles.filterField}>
          <label htmlFor="tor-to">Hasta</label>
          <input id="tor-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <button type="button" className={styles.btnGhost} onClick={() => load()} disabled={loading}>
          {loading ? "Cargando…" : "Aplicar filtro"}
        </button>
      </div>

      {err && <p className={styles.error}>{err}</p>}

      {loading && !tournaments.length ? (
        <p className={styles.muted}>Cargando standings…</p>
      ) : tournaments.length === 0 ? (
        <p className={styles.muted}>No hay torneos que coincidan con el filtro (o aún no se ha subido ningún .tdf).</p>
      ) : (
        tournaments.map((t) => (
          <section key={t.fileName} className={tstyles.tBlock}>
            <h2 className={tstyles.tTitle}>
              {t.payload?.tournamentName?.trim() || t.fileName.replace(/\.tdf$/i, "")}
            </h2>
            <div className={tstyles.tMeta}>
              <span>
                <strong>Archivo:</strong> {t.fileName}
              </span>
              <span>
                <strong>Fecha del evento:</strong> {t.payload?.tournamentStartDate || "—"}
              </span>
              <span>
                <strong>Actualizado:</strong> {new Date(t.mtimeMs).toLocaleString()}
              </span>
            </div>

            {t.parseError ? (
              <p className={styles.error}>{t.parseError}</p>
            ) : !t.hasFinishedStandings || !t.payload?.categories?.length ? (
              <p className={styles.muted}>Sin standings terminados en este archivo.</p>
            ) : (
              t.payload.categories.map((cat) => {
                const rows = Array.isArray(cat.standings) ? cat.standings : [];
                if (rows.length === 0) return null;
                const code = cat.categoryCode != null ? String(cat.categoryCode) : "";
                return (
                  <div key={`${t.fileName}-${cat.division}`} style={{ marginTop: "1.25rem" }}>
                    <h3 className={styles.subTitle} style={{ marginTop: 0 }}>
                      {cat.division}
                    </h3>
                    <div className={tstyles.leaderboardZone}>
                      <div className={tstyles.tableWrap}>
                        <table className={tstyles.table}>
                        <thead>
                          <tr>
                            <th className={tstyles.colPlace} scope="col">
                              #
                            </th>
                            <th className={tstyles.colPlayer} scope="col">
                              Jugador
                            </th>
                            <th className={tstyles.colDeck} scope="col">
                              Mazo
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => {
                            const k = deckRowKey(t.fileName, code, row.playId);
                            const ov = overrides[k] || {};
                            const sprites = Array.isArray(ov.sprites) ? ov.sprites.filter(Boolean).slice(0, 4) : [];
                            const flag = countryCodeToFlagEmoji(ov.countryCode);
                            const listUrl = typeof ov.listUrl === "string" ? ov.listUrl.trim() : "";
                            const nameEl =
                              listUrl ? (
                                <a className={tstyles.playerLink} href={listUrl} target="_blank" rel="noreferrer">
                                  {row.name}
                                </a>
                              ) : (
                                row.name
                              );
                            return (
                              <tr key={k}>
                                <td className={tstyles.placeCell}>
                                  <div className={tstyles.cellVCenter}>{row.place}</div>
                                </td>
                                <td
                                  className={`${tstyles.playerCell}${row.place === 1 ? ` ${tstyles.playerCellLeader}` : ""}`}
                                >
                                  <div className={tstyles.cellVCenter}>
                                    <span className={tstyles.playerCellInner}>
                                      {nameEl}
                                      {row.place === 1 ? (
                                        <span className={tstyles.crown} title="1.º lugar" aria-hidden>
                                          👑
                                        </span>
                                      ) : null}
                                      {flag ? (
                                        <span
                                          className={tstyles.flagInline}
                                          title={ov.countryCode?.trim() || "País"}
                                          aria-hidden
                                        >
                                          {flag}
                                        </span>
                                      ) : null}
                                    </span>
                                  </div>
                                </td>
                                <td className={tstyles.deckCell}>
                                  <div className={tstyles.deckCellInner}>
                                    {sprites.length > 0 ? (
                                      <span className={tstyles.spriteRow}>
                                        {sprites.map((src, i) => (
                                          <DeckSpriteImg
                                            key={i}
                                            src={src}
                                            size={DECK_SPRITE_TORNEOS_TABLE_PX}
                                            spriteScale={DECK_SPRITE_TORNEOS_TABLE_INNER_SCALE}
                                            frame="plain"
                                            plainFit="square-cover"
                                            plainSquareCoverShavePx={14}
                                            plainSquareCoverWidthScale={0.5}
                                            variant="dark"
                                            alt={`Pokémon ${i + 1} en el mazo de ${row.name}`}
                                          />
                                        ))}
                                      </span>
                                    ) : (
                                      <span
                                        className={tstyles.emptyDeck}
                                        title="Sin iconos de mazo configurados para este jugador"
                                      >
                                        SIN MAZO
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </section>
        ))
      )}
    </div>
  );
}
