import { useEffect, useMemo, useState, type CSSProperties } from "react";
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

function padRows<T>(rows: T[], min: number, empty: () => T): T[] {
  const out = [...rows];
  while (out.length < min) out.push(empty());
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
  // Temporada tipo 2026 (ajusta años oficiales si Play! Pokémon los publica).
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

type FormRow = {
  qty: string;
  name: string;
  set: string;
  coll: string;
  reg: string;
};

function cardsToPokemonRows(cards: ParsedDeckCard[]): FormRow[] {
  return cards.map((c) => ({
    qty: String(c.qty),
    name: c.name,
    set: c.setCode || "",
    coll: c.number || "",
    reg: c.regulationMark || "",
  }));
}

function cardsToSimpleRows(cards: ParsedDeckCard[]): FormRow[] {
  return cards.map((c) => ({
    qty: String(c.qty),
    name: c.name,
    set: c.setCode || "",
    coll: c.number || "",
    reg: "",
  }));
}

function Check({ checked, label }: { checked: boolean; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 14 }}>
      <span
        style={{
          width: 12,
          height: 12,
          border: "1.5px solid #111",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          lineHeight: 1,
          flex: "0 0 auto",
        }}
      >
        {checked ? "X" : ""}
      </span>
      <span>{label}</span>
    </span>
  );
}

function DeckTable({
  title,
  count,
  rows,
  columns,
}: {
  title: string;
  count: number;
  rows: FormRow[];
  columns: "pokemon" | "simple";
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 3,
          fontWeight: 700,
          fontSize: 12,
        }}
      >
        <span>{title}</span>
        <span>
          # <span style={{ borderBottom: "1px solid #111", minWidth: 28, display: "inline-block", textAlign: "center" }}>{count || ""}</span>
        </span>
      </div>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 10,
          tableLayout: "fixed",
        }}
      >
        <thead>
          <tr>
            <th style={thStyle(7)}>QTY</th>
            <th style={thStyle(columns === "pokemon" ? 48 : 93)}>NAME</th>
            {columns === "pokemon" ? (
              <>
                <th style={thStyle(12)}>SET</th>
                <th style={thStyle(14)}>COLL. #</th>
                <th style={thStyle(10)}>REG</th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${title}-${i}`}>
              <td style={tdStyle}>{r.qty}</td>
              <td style={{ ...tdStyle, textAlign: "left", paddingLeft: 4 }}>{r.name}</td>
              {columns === "pokemon" ? (
                <>
                  <td style={tdStyle}>{r.set}</td>
                  <td style={tdStyle}>{r.coll}</td>
                  <td style={tdStyle}>{r.reg}</td>
                </>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function thStyle(pct: number): CSSProperties {
  return {
    width: `${pct}%`,
    border: "1px solid #111",
    background: "#e8e8e8",
    padding: "2px 3px",
    fontWeight: 700,
    textAlign: "center",
  };
}

const tdStyle: CSSProperties = {
  border: "1px solid #111",
  height: 16,
  padding: "1px 2px",
  textAlign: "center",
  verticalAlign: "middle",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
};

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

  const pokemonRows = useMemo(() => {
    const rows = cardsToPokemonRows(parsed?.categories.pokemon || []);
    return padRows(rows, 14, () => ({ qty: "", name: "", set: "", coll: "", reg: "" }));
  }, [parsed]);

  const trainerRows = useMemo(() => {
    const rows = cardsToSimpleRows(parsed?.categories.trainer || []);
    return padRows(rows, 14, () => ({ qty: "", name: "", set: "", coll: "", reg: "" }));
  }, [parsed]);

  const energyRows = useMemo(() => {
    const rows = cardsToSimpleRows(parsed?.categories.energy || []);
    return padRows(rows, 6, () => ({ qty: "", name: "", set: "", coll: "", reg: "" }));
  }, [parsed]);

  if (authLoading) return <p className={styles.muted}>Cargando…</p>;
  if (!user) {
    return (
      <Navigate to="/login" replace state={{ from: { pathname: `/mazos/${id}/pdf` } }} />
    );
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
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <style>{`
        @media print {
          .deck-pdf-no-print { display: none !important; }
          html, body { background: #fff !important; color: #000 !important; }
          .decklist-form {
            box-shadow: none !important;
            border: 1px solid #111 !important;
            margin: 0 !important;
            max-width: none !important;
          }
          @page { size: letter portrait; margin: 10mm; }
        }
      `}</style>

      <div className="deck-pdf-no-print" style={{ marginBottom: "1rem" }}>
        <p className={styles.muted} style={{ marginTop: 0 }}>
          <Link to="/perfil?tab=mazos">← Mis mazos</Link>
          {" · "}
          <Link to={`/mazos/${deck.id}`}>Editar</Link>
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", alignItems: "end", marginBottom: 8 }}>
          <label className={styles.label} style={{ margin: 0 }}>
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
          <label className={styles.label} style={{ margin: 0, minWidth: 180 }}>
            Player Name
            <input className={styles.input} value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
          </label>
          <label className={styles.label} style={{ margin: 0, minWidth: 120 }}>
            Player ID
            <input className={styles.input} value={playerId} onChange={(e) => setPlayerId(e.target.value)} />
          </label>
          <label className={styles.label} style={{ margin: 0, minWidth: 130 }}>
            Date of Birth
            <input
              className={styles.input}
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              placeholder="MM/DD/YYYY"
            />
          </label>
          <label className={styles.label} style={{ margin: 0 }}>
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
          Plantilla tipo lista oficial Play! Pokémon. Completá datos si faltan y usá «Guardar como PDF» en el
          diálogo de impresión. Mazo: <strong>{deck.name}</strong>
        </p>
      </div>

      {!isPokemon || !parsed ? (
        <p className={styles.error}>Esta vista PDF es para mazos Pokémon con lista válida.</p>
      ) : (
        <div
          className="decklist-form"
          style={{
            background: "#fff",
            color: "#111",
            border: "2px solid #111",
            padding: "10px 12px 8px",
            fontFamily: "Arial, Helvetica, sans-serif",
            fontSize: 11,
            lineHeight: 1.25,
          }}
        >
          <div style={{ textAlign: "center", fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
            Pokémon TCG Tournament Season — Deck List
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", marginBottom: 8, fontSize: 11 }}>
            <Check checked={format === "standard"} label="Standard" />
            <Check checked={format === "expanded"} label="Expanded" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.9fr 1fr", gap: 8, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700 }}>Player Name:</div>
              <div style={{ borderBottom: "1px solid #111", minHeight: 16, paddingTop: 2 }}>{playerName}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700 }}>Player ID:</div>
              <div style={{ borderBottom: "1px solid #111", minHeight: 16, paddingTop: 2 }}>{playerId}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700 }}>Date of Birth (MM/DD/YYYY):</div>
              <div style={{ borderBottom: "1px solid #111", minHeight: 16, paddingTop: 2 }}>{dob}</div>
            </div>
          </div>

          <div style={{ marginBottom: 10, fontSize: 10 }}>
            <strong>Age Division:</strong>{" "}
            <Check checked={division === "junior"} label="Junior" />
            <Check checked={division === "senior"} label="Senior" />
            <Check checked={division === "masters"} label="Masters" />
          </div>

          <DeckTable
            title="Pokémon"
            count={totals?.pokemon || 0}
            rows={pokemonRows}
            columns="pokemon"
          />
          <DeckTable
            title="Trainer"
            count={totals?.trainer || 0}
            rows={trainerRows}
            columns="simple"
          />
          <DeckTable
            title="Energy"
            count={totals?.energy || 0}
            rows={energyRows}
            columns="simple"
          />

          <p style={{ fontSize: 8, margin: "8px 0 4px", color: "#333" }}>
            The name of each card and the quantity must be listed. Players may use cards from previous
            expansions that share the same name as a card listed in this deck (reprints). For tournament
            use under Play! Pokémon rules.
          </p>
          <div
            style={{
              marginTop: 6,
              borderTop: "2px solid #111",
              paddingTop: 4,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 0.4,
            }}
          >
            ADMINISTRATIVE USE ONLY
          </div>
        </div>
      )}
    </div>
  );
}
