import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { DeckCardThumb } from "../components/deck/DeckCardThumb";
import { deckGameLabel, normalizeDeckGame } from "../lib/deckGames";
import { parseResponseJson } from "../lib/parseResponseJson";
import { parsePokemonDecklist, type ParsedDeckCard } from "../lib/pokemon/deckParser";
import styles from "./pages.module.css";

type DeckDetail = {
  id: number;
  name: string;
  game?: string;
  rawText: string;
};

function Section({
  title,
  cards,
}: {
  title: string;
  cards: ParsedDeckCard[];
}) {
  if (!cards.length) return null;
  const total = cards.reduce((s, c) => s + c.qty, 0);
  return (
    <section style={{ marginBottom: "1.25rem" }}>
      <h2 style={{ fontSize: 16, margin: "0 0 0.65rem" }}>
        {title} ({total})
      </h2>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        {cards.map((c) => (
          <div key={`${c.name}|${c.setCode}|${c.number}|${c.qty}`}>
            <DeckCardThumb
              name={c.name}
              setCode={c.setCode}
              number={c.number}
              qty={c.qty}
              size={104}
            />
            <div
              style={{
                fontSize: 11,
                marginTop: 4,
                maxWidth: 104,
                lineHeight: 1.25,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {c.name}
            </div>
            <div className={styles.muted} style={{ fontSize: 10 }}>
              {c.setCode && c.number ? `${c.setCode}-${c.number}` : ""}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function DeckPdf() {
  const { id } = useParams();
  const deckId = parseInt(String(id), 10);
  const { user, loading: authLoading } = useAuth();
  const [deck, setDeck] = useState<DeckDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (authLoading) return <p className={styles.muted}>Cargando…</p>;
  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: { pathname: `/mazos/${id}/pdf` } }}
      />
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

  return (
    <div className="deck-pdf-page" style={{ maxWidth: 960, margin: "0 auto" }}>
      <style>{`
        @media print {
          .deck-pdf-no-print { display: none !important; }
          body { background: #fff !important; color: #000 !important; }
          .deck-pdf-page img { break-inside: avoid; }
        }
      `}</style>

      <div className="deck-pdf-no-print" style={{ marginBottom: "1rem" }}>
        <p className={styles.muted} style={{ marginTop: 0 }}>
          <Link to="/perfil?tab=mazos">← Mis mazos</Link>
          {" · "}
          <Link to={`/mazos/${deck.id}`}>Editar</Link>
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          <button type="button" className={styles.btnPrimary} onClick={() => window.print()}>
            Imprimir / guardar PDF
          </button>
          <span className={styles.muted} style={{ fontSize: 13 }}>
            En el diálogo del navegador elegí «Guardar como PDF».
          </span>
        </div>
        <p className={styles.muted} style={{ fontSize: 13, marginBottom: 0 }}>
          Las imágenes salen de Limitless/TCGdex. Si falta alguna, suele ser que esa impresión aún no
          está en el CDN; se actualizará cuando la API la publique.
        </p>
      </div>

      <header style={{ marginBottom: "1.25rem" }}>
        <h1 className={styles.pageTitle} style={{ marginBottom: 4 }}>
          {deck.name}
        </h1>
        <p className={styles.muted} style={{ margin: 0 }}>
          {deckGameLabel(normalizeDeckGame(deck.game))}
          {parsed ? ` · ${parsed.cardCount}/60 cartas` : null}
          {parsed?.isValid ? " · Válido" : null}
        </p>
      </header>

      {!isPokemon ? (
        <pre
          style={{
            whiteSpace: "pre-wrap",
            fontFamily: "ui-monospace, monospace",
            fontSize: 13,
            padding: "0.75rem",
            border: "1px solid var(--border)",
            borderRadius: 8,
          }}
        >
          {deck.rawText}
        </pre>
      ) : parsed ? (
        <>
          <Section title="Pokémon" cards={parsed.categories.pokemon} />
          <Section title="Entrenadores" cards={parsed.categories.trainer} />
          <Section title="Energías" cards={parsed.categories.energy} />
          {parsed.errors.length ? (
            <p className={styles.error} style={{ fontSize: 13 }}>
              {parsed.errors[0]}
            </p>
          ) : null}
        </>
      ) : (
        <p className={styles.muted}>No se pudo leer la lista.</p>
      )}
    </div>
  );
}
