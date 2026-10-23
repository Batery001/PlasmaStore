import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { deckGameLabel, normalizeDeckGame, type DeckGame } from "../lib/deckGames";
import { parseResponseJson } from "../lib/parseResponseJson";
import styles from "./profile.module.css";

type DeckRow = {
  id: number;
  name: string;
  game?: DeckGame | string;
  cardCount: number;
  isValid: boolean;
  updatedAt?: string | null;
};

function DeckSection({
  game,
  decks,
}: {
  game: DeckGame;
  decks: DeckRow[];
}) {
  const label = deckGameLabel(game);
  const isPokemon = game === "pokemon";

  return (
    <section className={styles.box}>
      <h2 className={styles.boxHead}>{label}</h2>
      <div className={styles.boxBody}>
        <p className={styles.muted} style={{ marginTop: 0 }}>
          {isPokemon
            ? "Listas PTCGL / Limitless para Challenge y Cup."
            : "Mazos de Mitos y Leyendas para ligas y torneos."}
        </p>

        <ul className={styles.orderList}>
          {decks.map((d) => (
            <li key={d.id} className={styles.orderRow}>
              <div>
                <strong>{d.name}</strong>
                <div className={styles.orderMeta}>
                  {isPokemon
                    ? `${d.cardCount}/60 cartas${d.isValid ? " · Válido" : " · Revisar lista"}`
                    : `${d.cardCount} línea${d.cardCount === 1 ? "" : "s"} guardada${d.cardCount === 1 ? "" : "s"}`}
                </div>
              </div>
              <div className={styles.orderRight} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {isPokemon ? (
                  <Link className={styles.btnGhost} to={`/mazos/${d.id}/pdf`}>
                    Ver PDF
                  </Link>
                ) : null}
                <Link className={styles.btnGhost} to={`/mazos/${d.id}`}>
                  Editar
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Lista de mazos embebible en el perfil (Pokémon + MyL). */
export function MyDecksPanel() {
  const { user } = useAuth();
  const [decks, setDecks] = useState<DeckRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetch("/api/store/me/decks", { credentials: "include" })
      .then(async (r) => {
        const j = await parseResponseJson<{ ok?: boolean; decks?: DeckRow[]; error?: string }>(r);
        if (!r.ok || !j.ok) throw new Error(j.error || "No se pudieron cargar los mazos.");
        if (alive) setDecks(j.decks || []);
      })
      .catch((e) => {
        if (alive) setErr(e instanceof Error ? e.message : "Error");
      });
    return () => {
      alive = false;
    };
  }, [user]);

  const { pokemon, myl } = useMemo(() => {
    const list = decks || [];
    return {
      pokemon: list.filter((d) => normalizeDeckGame(d.game) === "pokemon"),
      myl: list.filter((d) => normalizeDeckGame(d.game) === "mitos-y-leyendas"),
    };
  }, [decks]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
      <section className={styles.box}>
        <h2 className={styles.boxHead}>Crear mazo</h2>
        <div className={styles.boxBody}>
          <p className={styles.muted} style={{ marginTop: 0 }}>
            Guarda listas de Pokémon para Challenge y Cup. MyL vuelve pronto.
          </p>
          <Link to="/mazos/nuevo" className={styles.btnPrimary} style={{ textDecoration: "none", display: "inline-block" }}>
            Crear mazo
          </Link>
        </div>
      </section>

      {err ? <p className={`${styles.flash} ${styles.flashErr}`}>{err}</p> : null}
      {decks == null && !err ? <p className={styles.muted}>Cargando mazos…</p> : null}
      {decks && pokemon.length > 0 ? <DeckSection game="pokemon" decks={pokemon} /> : null}
      {decks && myl.length > 0 ? <DeckSection game="mitos-y-leyendas" decks={myl} /> : null}
    </div>
  );
}

/** /mazos redirige al perfil (pestaña mazos). */
export function MyDecks() {
  return <Navigate to="/perfil?tab=mazos" replace />;
}

export default MyDecks;
