import { useEffect, useMemo, useRef, useState } from "react";
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

/** Filas fijas de la plantilla oficial (1 hoja Letter landscape). */
const POKEMON_SLOTS = 12;
const TRAINER_SLOTS = 16;
const ENERGY_SLOTS = 4;

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

function Check({ checked, label }: { checked: boolean; label: string }) {
  return (
    <span className="dl-check">
      <span className="dl-box">{checked ? "X" : ""}</span>
      <span>{label}</span>
    </span>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="dl-field">
      <span className="dl-field-label">{label}</span>
      <span className="dl-field-line">{value}</span>
    </div>
  );
}

function DeckTable({
  title,
  count,
  rows,
  kind,
}: {
  title: string;
  count: number;
  rows: FormRow[];
  kind: "pokemon" | "simple";
}) {
  return (
    <div className="dl-table-wrap">
      <div className="dl-table-head">
        <span>{title}</span>
        <span>
          # <b>{count || ""}</b>
        </span>
      </div>
      <table className={`dl-table ${kind === "pokemon" ? "dl-poke" : "dl-simple"}`}>
        <thead>
          <tr>
            <th className="c-qty">QTY</th>
            <th className="c-name">NAME</th>
            {kind === "pokemon" ? (
              <>
                <th className="c-set">SET</th>
                <th className="c-coll">COLL. #</th>
                <th className="c-reg">REG</th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${title}-${i}`} className={i % 2 ? "alt" : undefined}>
              <td className="c-qty">{r.qty}</td>
              <td className="c-name">{r.name}</td>
              {kind === "pokemon" ? (
                <>
                  <td className="c-set">{r.set}</td>
                  <td className="c-coll">{r.coll}</td>
                  <td className="c-reg">{r.reg}</td>
                </>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SET_LEGEND: { series: string; codes: string }[] = [
  {
    series: "Scarlet & Violet",
    codes: "SVI PAL OBF MEW PAR PAF TEF TWM SFA SCR SSP PRE JTG DRI BLK WHT SVE SVP",
  },
  {
    series: "Mega Evolution",
    codes: "MEG PFL ASC POR MEP MEE",
  },
  {
    series: "Sword & Shield",
    codes: "SSH RCL DAA VIV BST CRE EVS FST BRS ASR LOR SIT CPA SHF CEL PGO CRZ",
  },
  {
    series: "Promos",
    codes: "SVP MEP MEE PR-SW PR-SV",
  },
];

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
  const formRef = useRef<HTMLDivElement>(null);

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
      bits.push(`Pokémon: ${parsed.categories.pokemon.length} líneas (máx. ${POKEMON_SLOTS} en la hoja)`);
    }
    if ((parsed.categories.trainer?.length || 0) > TRAINER_SLOTS) {
      bits.push(`Trainer: ${parsed.categories.trainer.length} líneas (máx. ${TRAINER_SLOTS})`);
    }
    if ((parsed.categories.energy?.length || 0) > ENERGY_SLOTS) {
      bits.push(`Energy: ${parsed.categories.energy.length} líneas (máx. ${ENERGY_SLOTS})`);
    }
    return bits.length ? bits.join(" · ") : null;
  }, [parsed]);

  function handlePrint() {
    window.print();
  }

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
  const totals = parsed?.categories.totals;

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
          <button type="button" className={styles.btnPrimary} onClick={handlePrint}>
            Imprimir / guardar PDF
          </button>
        </div>
        <p className={styles.muted} style={{ fontSize: 13, margin: 0 }}>
          Una sola hoja Letter horizontal (como Substitute List). En el diálogo de impresión: orientación
          horizontal, márgenes «Ninguno» y «Guardar como PDF».
        </p>
        {overflowWarn ? (
          <p className={styles.error} style={{ fontSize: 13, margin: "0.35rem 0 0" }}>
            La lista tiene más líneas de las que caben en la plantilla: {overflowWarn}. Unificá copias o
            acortá nombres de set.
          </p>
        ) : null}
      </div>

      {!isPokemon || !parsed ? (
        <p className={styles.error}>Esta vista PDF es para mazos Pokémon.</p>
      ) : (
        <div className="dl-sheet-outer">
          <div className="decklist-form dl-sheet" ref={formRef}>
            <div className="dl-title">
              Pokémon TCG Tournament Season — Deck List
            </div>

            <div className="dl-top">
              <div className="dl-formats">
                <Check checked={format === "standard"} label="Standard" />
                <Check checked={format === "expanded"} label="Expanded" />
              </div>
              <div className="dl-player">
                <Field label="Player Name:" value={playerName} />
                <Field label="Player ID:" value={playerId} />
                <Field label="Date of Birth (MM/DD/YYYY):" value={dob} />
              </div>
              <div className="dl-age">
                <strong>Age Division:</strong>
                <Check checked={division === "junior"} label="Junior Division" />
                <Check checked={division === "senior"} label="Senior Division" />
                <Check checked={division === "masters"} label="Masters Division" />
              </div>
            </div>

            <div className="dl-body">
              <aside className="dl-legend">
                <div className="dl-legend-title">Set abbreviations</div>
                {SET_LEGEND.map((block) => (
                  <div key={block.series} className="dl-legend-block">
                    <div className="dl-legend-series">{block.series}</div>
                    <div className="dl-legend-codes">{block.codes}</div>
                  </div>
                ))}
                <div className="dl-legend-block">
                  <div className="dl-legend-series">Regulation marks</div>
                  <div className="dl-legend-codes">G H I J (Standard rotation)</div>
                </div>
                <div className="dl-admin">ADMINISTRATIVE USE ONLY</div>
              </aside>

              <div className="dl-tables">
                <DeckTable
                  title="Pokémon"
                  count={totals?.pokemon || 0}
                  rows={pokemonRows}
                  kind="pokemon"
                />
                <DeckTable
                  title="Trainer"
                  count={totals?.trainer || 0}
                  rows={trainerRows}
                  kind="simple"
                />
                <DeckTable
                  title="Energy"
                  count={totals?.energy || 0}
                  rows={energyRows}
                  kind="simple"
                />
              </div>
            </div>

            <p className="dl-footnote">
              List quantity and name of each card. Reprints with the same name from earlier expansions are
              allowed when legal. For Play! Pokémon tournament registration.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const decklistCss = `
  .dl-page { max-width: 1200px; margin: 0 auto; }
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
    width: 11in;
    height: 8.5in;
    max-height: 8.5in;
    margin: 0 auto;
    box-sizing: border-box;
    background: #fff;
    color: #111;
    border: 1.5px solid #111;
    padding: 0.12in 0.16in 0.08in;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 7.5pt;
    line-height: 1.05;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .dl-title {
    text-align: center;
    font-weight: 700;
    font-size: 10pt;
    margin: 0 0 0.05in;
    flex: 0 0 auto;
  }
  .dl-top { margin-bottom: 0.05in; flex: 0 0 auto; }
  .dl-formats { margin-bottom: 0.04in; }
  .dl-player {
    display: grid;
    grid-template-columns: 1.35fr 0.85fr 1.1fr;
    gap: 0.1in;
    margin-bottom: 0.04in;
  }
  .dl-field-label { font-weight: 700; font-size: 7pt; display: block; }
  .dl-field-line {
    display: block;
    border-bottom: 1px solid #111;
    min-height: 11px;
    padding-top: 0;
    font-size: 8pt;
    line-height: 1.1;
  }
  .dl-age { font-size: 7pt; display: flex; flex-wrap: wrap; align-items: center; gap: 1px 8px; }
  .dl-check { display: inline-flex; align-items: center; gap: 3px; margin-right: 6px; white-space: nowrap; }
  .dl-box {
    width: 9px; height: 9px; border: 1.2px solid #111;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 7px; font-weight: 700; flex: 0 0 auto;
  }
  .dl-body {
    flex: 1 1 auto;
    display: grid;
    grid-template-columns: 2in 1fr;
    gap: 0.1in;
    min-height: 0;
    overflow: hidden;
  }
  .dl-legend {
    border: 1px solid #111;
    background: #f3f3f3;
    padding: 0.05in;
    font-size: 5.5pt;
    display: flex;
    flex-direction: column;
    gap: 0.04in;
    overflow: hidden;
    min-height: 0;
  }
  .dl-legend-title { font-weight: 700; font-size: 6.5pt; margin-bottom: 1px; }
  .dl-legend-block { background: #fff; border: 1px solid #bbb; padding: 2px 3px; }
  .dl-legend-series { font-weight: 700; margin-bottom: 0; }
  .dl-legend-codes { word-spacing: 0.12em; line-height: 1.15; }
  .dl-admin {
    margin-top: auto;
    background: #333;
    color: #fff;
    font-weight: 700;
    font-size: 5.5pt;
    letter-spacing: 0.04em;
    text-align: center;
    padding: 3px 2px;
  }
  .dl-tables {
    display: flex;
    flex-direction: column;
    gap: 0.04in;
    min-height: 0;
    overflow: hidden;
  }
  .dl-table-wrap { min-height: 0; flex: 0 0 auto; }
  .dl-table-head {
    display: flex;
    justify-content: space-between;
    font-weight: 700;
    font-size: 7.5pt;
    margin-bottom: 0;
    line-height: 1.1;
  }
  .dl-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 6.5pt;
  }
  .dl-table th {
    border: 1px solid #111;
    background: #222;
    color: #fff;
    font-weight: 700;
    padding: 0 2px;
    height: 11px;
    line-height: 11px;
    text-align: center;
  }
  .dl-table td {
    border: 1px solid #111;
    height: 11px;
    max-height: 11px;
    padding: 0 2px;
    line-height: 10px;
    text-align: center;
    vertical-align: middle;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .dl-table tr.alt td { background: #f0f0f0; }
  .dl-table .c-name { text-align: left; padding-left: 3px; }
  .dl-poke .c-qty { width: 8%; }
  .dl-poke .c-name { width: 48%; }
  .dl-poke .c-set { width: 12%; }
  .dl-poke .c-coll { width: 16%; }
  .dl-poke .c-reg { width: 10%; }
  .dl-simple .c-qty { width: 10%; }
  .dl-simple .c-name { width: 90%; }
  .dl-footnote {
    margin: 0.04in 0 0;
    font-size: 5.5pt;
    color: #333;
    line-height: 1.15;
    flex: 0 0 auto;
  }

  @media print {
    @page {
      size: letter landscape;
      margin: 0;
    }
    .deck-pdf-no-print { display: none !important; }
    html, body {
      background: #fff !important;
      color: #000 !important;
      margin: 0 !important;
      padding: 0 !important;
      width: 11in !important;
      height: 8.5in !important;
      overflow: hidden !important;
    }
    body * { visibility: hidden !important; }
    .dl-sheet,
    .dl-sheet * { visibility: visible !important; }
    header, footer, nav { display: none !important; }
    .dl-page {
      max-width: none !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .dl-sheet-outer {
      background: transparent !important;
      padding: 0 !important;
      border-radius: 0 !important;
      overflow: hidden !important;
      margin: 0 !important;
    }
    .dl-sheet {
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      width: 11in !important;
      height: 8.5in !important;
      max-height: 8.5in !important;
      margin: 0 !important;
      border: 1px solid #111 !important;
      overflow: hidden !important;
      page-break-after: avoid !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
`;
