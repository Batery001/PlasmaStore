import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { normalizeDeckGame } from "../lib/deckGames";
import { parseResponseJson } from "../lib/parseResponseJson";
import { parsePokemonDecklist, type ParsedDeckCard } from "../lib/pokemon/deckParser";
import styles from "./pages.module.css";

type DeckDetail = {
  id: number;
  name: string;
  game?: string;
  rawText: string;
};

type AgeDivision = "junior" | "senior" | "masters" | "";

type FormRow = {
  qty: string;
  name: string;
  set: string;
  coll: string;
  reg: string;
};

/**
 * Filas de la plantilla oficial Play! Pokémon 8.5×11 (portrait).
 * Medidas en puntos PDF (página 612×792).
 */
const PAGE_W = 612;
const PAGE_H = 792;

const POKEMON_SLOTS = 11;
const TRAINER_SLOTS = 18;
const ENERGY_SLOTS = 4;

/** Primera fila de datos (top) y alto de fila — plantilla 2026. */
const POKE_ROW0 = 195.4;
const TRAIN_ROW0 = 371.6;
const ENERGY_ROW0 = 653.5;
const ROW_H = 13.1;

const COL = {
  qty: { left: 257.7, width: 36.4 },
  namePoke: { left: 294.1, width: 171.3 },
  set: { left: 465.4, width: 37 },
  coll: { left: 502.4, width: 37.1 },
  reg: { left: 539.5, width: 36.5 },
  nameSimple: { left: 294.1, width: 281.9 },
};

function pctX(pt: number) {
  return `${(pt / PAGE_W) * 100}%`;
}
function pctY(pt: number) {
  return `${(pt / PAGE_H) * 100}%`;
}
function pctW(pt: number) {
  return `${(pt / PAGE_W) * 100}%`;
}
function pctH(pt: number) {
  return `${(pt / PAGE_H) * 100}%`;
}

function padRows(rows: FormRow[], slots: number): FormRow[] {
  const empty = (): FormRow => ({ qty: "", name: "", set: "", coll: "", reg: "" });
  const out = rows.slice(0, slots);
  while (out.length < slots) out.push(empty());
  return out;
}

function formatDob(u: {
  birth_day?: number | null;
  birth_month?: number | null;
  birth_year?: number | null;
}): string {
  const d = u.birth_day;
  const m = u.birth_month;
  const y = u.birth_year;
  if (!d || !m || !y) return "";
  return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`;
}

function ageDivisionFromYear(year: number | null | undefined): AgeDivision {
  if (!year || !Number.isFinite(year)) return "";
  if (year >= 2014) return "junior";
  if (year >= 2010 && year <= 2013) return "senior";
  if (year <= 2009) return "masters";
  return "";
}

function playerDisplayName(u: {
  first_name?: string | null;
  last_name?: string | null;
  name?: string;
}): string {
  const full = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return full || u.name || "";
}

function toPokemonRows(cards: ParsedDeckCard[]): FormRow[] {
  return cards.map((c) => ({
    qty: String(c.qty),
    name: c.name,
    set: c.setCode || "",
    coll: c.number || "",
    reg: c.regulationMark || "",
  }));
}

function toSimpleRows(cards: ParsedDeckCard[]): FormRow[] {
  return cards.map((c) => ({
    qty: String(c.qty),
    name: c.name,
    set: "",
    coll: "",
    reg: "",
  }));
}

function Cell({
  left,
  top,
  width,
  height,
  children,
  align = "center",
}: {
  left: number;
  top: number;
  width: number;
  height: number;
  children: ReactNode;
  align?: "left" | "center";
}) {
  return (
    <div
      className={`dl-cell ${align === "left" ? "left" : ""}`}
      style={{
        left: pctX(left),
        top: pctY(top),
        width: pctW(width),
        height: pctH(height),
      }}
    >
      {children}
    </div>
  );
}

function Mark({ left, top, on }: { left: number; top: number; on: boolean }) {
  if (!on) return null;
  return (
    <div className="dl-mark" style={{ left: pctX(left), top: pctY(top) }}>
      X
    </div>
  );
}

export function DeckPdf() {
  const { id } = useParams();
  const deckId = parseInt(String(id), 10);
  const { user, loading: authLoading } = useAuth();
  const [deck, setDeck] = useState<DeckDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [format, setFormat] = useState<"standard" | "expanded">("standard");
  const [playerName, setPlayerName] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [dob, setDob] = useState("");
  const [division, setDivision] = useState<AgeDivision>("");

  useEffect(() => {
    if (!user) return;
    setPlayerName(playerDisplayName(user));
    setPlayerId(String(user.popid || ""));
    setDob(formatDob(user));
    setDivision(ageDivisionFromYear(user.birth_year ?? null));
  }, [user]);

  useEffect(() => {
    if (!user || !Number.isFinite(deckId) || deckId <= 0) return;
    let alive = true;
    fetch(`/api/store/me/decks/${deckId}`, { credentials: "include" })
      .then(async (r) => {
        const j = await parseResponseJson<{ ok?: boolean; deck?: DeckDetail; error?: string }>(r);
        if (!r.ok || !j.ok || !j.deck) throw new Error(j.error || "Mazo no encontrado.");
        if (alive) {
          setDeck(j.deck);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (alive) {
          setErr(e instanceof Error ? e.message : "Error");
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [user, deckId]);

  const parsed = useMemo(() => {
    if (!deck?.rawText?.trim()) return null;
    if (normalizeDeckGame(deck.game) !== "pokemon") return null;
    return parsePokemonDecklist(deck.rawText);
  }, [deck]);

  const pokemonRows = useMemo(
    () => padRows(toPokemonRows(parsed?.categories.pokemon || []), POKEMON_SLOTS),
    [parsed]
  );
  const trainerRows = useMemo(
    () => padRows(toSimpleRows(parsed?.categories.trainer || []), TRAINER_SLOTS),
    [parsed]
  );
  const energyRows = useMemo(
    () => padRows(toSimpleRows(parsed?.categories.energy || []), ENERGY_SLOTS),
    [parsed]
  );

  const overflowWarn = useMemo(() => {
    if (!parsed) return null;
    const bits: string[] = [];
    if ((parsed.categories.pokemon?.length || 0) > POKEMON_SLOTS) {
      bits.push(`Pokémon: ${parsed.categories.pokemon.length} líneas (máx. ${POKEMON_SLOTS})`);
    }
    if ((parsed.categories.trainer?.length || 0) > TRAINER_SLOTS) {
      bits.push(`Trainer: ${parsed.categories.trainer.length} líneas (máx. ${TRAINER_SLOTS})`);
    }
    if ((parsed.categories.energy?.length || 0) > ENERGY_SLOTS) {
      bits.push(`Energy: ${parsed.categories.energy.length} líneas (máx. ${ENERGY_SLOTS})`);
    }
    return bits.length ? bits.join(" · ") : null;
  }, [parsed]);

  if (authLoading) return <p className={styles.muted}>Cargando…</p>;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: { pathname: `/mazos/${id}/pdf` } }} />;
  }
  if (!Number.isFinite(deckId) || deckId <= 0) {
    return <Navigate to="/perfil?tab=mazos" replace />;
  }
  if (loading) return <p className={styles.muted}>Cargando mazo…</p>;
  if (err || !deck) {
    return (
      <div>
        <p className={styles.error}>{err || "Mazo no encontrado."}</p>
        <Link to="/perfil?tab=mazos">← Mis mazos</Link>
      </div>
    );
  }

  const isPokemon = normalizeDeckGame(deck.game) === "pokemon";

  return (
    <div className="dl-page">
      <style>{decklistCss}</style>

      <div className="deck-pdf-no-print dl-toolbar">
        <p className={styles.muted} style={{ marginTop: 0 }}>
          <Link to="/perfil?tab=mazos">← Mis mazos</Link>
          {" · "}
          <Link to={`/mazos/${deck.id}`}>Editar</Link>
          {" · "}
          <strong>{deck.name}</strong>
        </p>
        <div className="dl-toolbar-row">
          <label className={styles.label}>
            Formato
            <select
              className={styles.input}
              value={format}
              onChange={(e) => setFormat(e.target.value as "standard" | "expanded")}
            >
              <option value="standard">Standard</option>
              <option value="expanded">Expanded</option>
            </select>
          </label>
          <label className={styles.label}>
            Player Name
            <input className={styles.input} value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
          </label>
          <label className={styles.label}>
            Player ID
            <input className={styles.input} value={playerId} onChange={(e) => setPlayerId(e.target.value)} />
          </label>
          <label className={styles.label}>
            DOB
            <input
              className={styles.input}
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              placeholder="MM/DD/YYYY"
            />
          </label>
          <label className={styles.label}>
            División
            <select
              className={styles.input}
              value={division}
              onChange={(e) => setDivision(e.target.value as AgeDivision)}
            >
              <option value="">—</option>
              <option value="junior">Junior</option>
              <option value="senior">Senior</option>
              <option value="masters">Masters</option>
            </select>
          </label>
          <button type="button" className={styles.btnPrimary} onClick={() => window.print()}>
            Imprimir / guardar PDF
          </button>
        </div>
        <p className={styles.muted} style={{ fontSize: 13, margin: 0 }}>
          Plantilla oficial Play! Pokémon (Letter 8.5×11, vertical). En el diálogo: orientación vertical,
          márgenes «Ninguno», «Guardar como PDF».
        </p>
        {overflowWarn ? (
          <p className={styles.error} style={{ fontSize: 13, margin: "0.35rem 0 0" }}>
            La lista tiene más líneas de las que caben en la plantilla: {overflowWarn}.
          </p>
        ) : null}
      </div>

      {!isPokemon || !parsed ? (
        <p className={styles.error}>Esta vista PDF es para mazos Pokémon.</p>
      ) : (
        <div className="dl-sheet-outer">
          <div className="dl-sheet" aria-label="Play Pokémon deck list">
            {/* Formato */}
            <Mark left={178} top={43.5} on={format === "standard"} />
            <Mark left={248} top={43.5} on={format === "expanded"} />

            {/* Player fields — sobre las líneas de la plantilla */}
            <Cell left={95} top={62} width={175} height={14} align="left">
              {playerName}
            </Cell>
            <Cell left={325} top={62} width={95} height={14} align="left">
              {playerId}
            </Cell>
            <Cell left={500} top={62} width={85} height={14} align="left">
              {dob}
            </Cell>

            {/* Age division */}
            <Mark left={375} top={105} on={division === "junior"} />
            <Mark left={375} top={119.5} on={division === "senior"} />
            <Mark left={375} top={133} on={division === "masters"} />

            {pokemonRows.map((r, i) => {
              const top = POKE_ROW0 + i * ROW_H;
              return (
                <span key={`p-${i}`}>
                  <Cell left={COL.qty.left} top={top} width={COL.qty.width} height={ROW_H}>
                    {r.qty}
                  </Cell>
                  <Cell left={COL.namePoke.left} top={top} width={COL.namePoke.width} height={ROW_H} align="left">
                    {r.name}
                  </Cell>
                  <Cell left={COL.set.left} top={top} width={COL.set.width} height={ROW_H}>
                    {r.set}
                  </Cell>
                  <Cell left={COL.coll.left} top={top} width={COL.coll.width} height={ROW_H}>
                    {r.coll}
                  </Cell>
                  <Cell left={COL.reg.left} top={top} width={COL.reg.width} height={ROW_H}>
                    {r.reg}
                  </Cell>
                </span>
              );
            })}

            {trainerRows.map((r, i) => {
              const top = TRAIN_ROW0 + i * ROW_H;
              return (
                <span key={`t-${i}`}>
                  <Cell left={COL.qty.left} top={top} width={COL.qty.width} height={ROW_H}>
                    {r.qty}
                  </Cell>
                  <Cell
                    left={COL.nameSimple.left}
                    top={top}
                    width={COL.nameSimple.width}
                    height={ROW_H}
                    align="left"
                  >
                    {r.name}
                  </Cell>
                </span>
              );
            })}

            {energyRows.map((r, i) => {
              const top = ENERGY_ROW0 + i * ROW_H;
              return (
                <span key={`e-${i}`}>
                  <Cell left={COL.qty.left} top={top} width={COL.qty.width} height={ROW_H}>
                    {r.qty}
                  </Cell>
                  <Cell
                    left={COL.nameSimple.left}
                    top={top}
                    width={COL.nameSimple.width}
                    height={ROW_H}
                    align="left"
                  >
                    {r.name}
                  </Cell>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const decklistCss = `
  .dl-page { max-width: 920px; margin: 0 auto; }
  .dl-toolbar { margin-bottom: 1rem; }
  .dl-toolbar-row {
    display: flex; flex-wrap: wrap; gap: 0.55rem; align-items: end; margin-bottom: 0.45rem;
  }
  .dl-toolbar-row .label { margin: 0; min-width: 110px; }
  .dl-sheet-outer {
    overflow: auto;
    background: #52525b;
    padding: 12px;
    border-radius: 8px;
  }
  .dl-sheet {
    position: relative;
    width: 8.5in;
    height: 11in;
    margin: 0 auto;
    box-sizing: border-box;
    background: #fff url("/decklist-form-bg.png") center / 100% 100% no-repeat;
    color: #111;
    overflow: hidden;
    font-family: Arial, Helvetica, sans-serif;
  }
  .dl-cell {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    padding: 0 2px;
    font-size: 7.5pt;
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 600;
  }
  .dl-cell.left { justify-content: flex-start; padding-left: 4px; }
  .dl-mark {
    position: absolute;
    width: 11px;
    height: 11px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    font-weight: 800;
    line-height: 1;
    transform: translate(-1px, -1px);
  }

  @media print {
    @page {
      size: letter portrait;
      margin: 0;
    }
    .deck-pdf-no-print { display: none !important; }
    html, body {
      background: #fff !important;
      margin: 0 !important;
      padding: 0 !important;
      width: 8.5in !important;
      height: 11in !important;
      overflow: hidden !important;
    }
    body * { visibility: hidden !important; }
    .dl-sheet,
    .dl-sheet * { visibility: visible !important; }
    header, footer, nav { display: none !important; }
    .dl-page, .dl-sheet-outer {
      max-width: none !important;
      margin: 0 !important;
      padding: 0 !important;
      background: transparent !important;
      border-radius: 0 !important;
      overflow: hidden !important;
    }
    .dl-sheet {
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      width: 8.5in !important;
      height: 11in !important;
      margin: 0 !important;
      page-break-after: avoid !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  }
`;
