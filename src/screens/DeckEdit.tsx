import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { DeckBuilder } from "../components/deck/DeckBuilder";
import { MylDeckBuilder } from "../components/deck/MylDeckBuilder";
import { DeckTour, clearDeckTourDone, shouldStartDeckTour } from "../components/DeckTour";
import { deckGameLabel, normalizeDeckGame, type DeckGame } from "../lib/deckGames";
import { parsePokemonDecklist } from "../lib/pokemon/deckParser";
import { parseResponseJson } from "../lib/parseResponseJson";
import styles from "./pages.module.css";

type DeckDetail = {
  id: number;
  name: string;
  game?: DeckGame | string;
  rawText: string;
  validation?: { cardCount?: number; errorMessages?: string[]; warnings?: string[] };
};

export function DeckEdit() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const isNew = !id || id === "nuevo";
  const deckId = isNew ? null : parseInt(String(id), 10);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const gameHint = search.get("game");
  const forceTour = search.get("tour") === "1";
  const [game, setGame] = useState<DeckGame | null>(() =>
    isNew ? (gameHint ? normalizeDeckGame(gameHint) : null) : "pokemon",
  );
  const [name, setName] = useState("");
  const [rawText, setRawText] = useState("");
  const [mode, setMode] = useState<"paste" | "build">("paste");
  const [buildKey, setBuildKey] = useState(0);
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [serverWarnings, setServerWarnings] = useState<string[]>([]);
  const [deckTourActive, setDeckTourActive] = useState(false);
  const [tourKey, setTourKey] = useState(0);

  const isPokemon = game === "pokemon";
  const isMyl = game === "mitos-y-leyendas";
  const localParse = isPokemon && rawText.trim() ? parsePokemonDecklist(rawText) : null;
  const needsGamePick = isNew && game == null;

  useEffect(() => {
    if (isNew || !user || !Number.isFinite(deckId)) return;
    let alive = true;
    fetch(`/api/store/me/decks/${deckId}`, { credentials: "include" })
      .then(async (r) => {
        const j = await parseResponseJson<{ ok?: boolean; deck?: DeckDetail; error?: string }>(r);
        if (!r.ok || !j.ok || !j.deck) throw new Error(j.error || "Mazo no encontrado.");
        if (!alive) return;
        setGame(normalizeDeckGame(j.deck.game));
        setName(j.deck.name);
        setRawText(j.deck.rawText || "");
        setServerErrors(j.deck.validation?.errorMessages || []);
        setServerWarnings(j.deck.validation?.warnings || []);
        setLoading(false);
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
  }, [isNew, user, deckId]);

  useEffect(() => {
    if (!isNew || !gameHint) return;
    setGame(normalizeDeckGame(gameHint));
  }, [isNew, gameHint]);

  useEffect(() => {
    if (!isNew || !user || game !== "pokemon") return;
    if (forceTour) {
      clearDeckTourDone(user.id);
      setTourKey((k) => k + 1);
      setDeckTourActive(true);
      return;
    }
    if (shouldStartDeckTour(user.id)) {
      setDeckTourActive(true);
    }
  }, [isNew, user, game, forceTour]);

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!game) return;
    setBusy(true);
    setErr(null);
    try {
      const url = isNew ? "/api/store/me/decks" : `/api/store/me/decks/${deckId}`;
      const method = isNew ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, rawText, game }),
      });
      const data = await parseResponseJson<{
        ok?: boolean;
        error?: string;
        deck?: DeckDetail;
      }>(res);
      if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo guardar.");
      setServerErrors(data.deck?.validation?.errorMessages || []);
      setServerWarnings(data.deck?.validation?.warnings || []);
      navigate("/perfil?tab=mazos");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function removeDeck() {
    if (isNew || !deckId) return;
    if (!confirm("¿Eliminar este mazo?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/store/me/decks/${deckId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await parseResponseJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo eliminar.");
      navigate("/perfil?tab=mazos");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Error");
      setBusy(false);
    }
  }

  function pickGame(next: DeckGame) {
    setGame(next);
    setMode("paste");
    setErr(null);
  }

  if (authLoading) return <p className={styles.muted}>Cargando…</p>;
  if (!user) {
    const pathname = isNew ? "/mazos/nuevo" : `/mazos/${id}`;
    const qs = search.toString();
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: { pathname, search: qs ? `?${qs}` : "" } }}
      />
    );
  }
  if (!isNew && (!Number.isFinite(deckId) || (deckId ?? 0) <= 0)) {
    return <Navigate to="/perfil?tab=mazos" replace />;
  }
  if (loading) return <p className={styles.muted}>Cargando mazo…</p>;

  if (needsGamePick) {
    return (
      <div>
        <p className={styles.muted}>
          <Link to="/perfil?tab=mazos">← Mis mazos</Link>
        </p>
        <h1 className={styles.pageTitle}>Crear mazo</h1>
        <p className={styles.muted}>Paso 1 de 2 · ¿Para qué juego es este mazo?</p>
        <div style={{ display: "grid", gap: "0.75rem", marginTop: "1.25rem", maxWidth: 420 }}>
          <button type="button" className={styles.btnPrimary} onClick={() => pickGame("pokemon")}>
            Pokémon TCG
          </button>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => {
              setMode("build");
              pickGame("mitos-y-leyendas");
            }}
          >
            Mitos y Leyendas
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {deckTourActive && user && isPokemon ? (
        <DeckTour
          key={tourKey}
          userId={user.id}
          active={deckTourActive}
          onMode={(m) => {
            setMode(m);
            if (m === "build") setBuildKey((k) => k + 1);
          }}
          onFinished={() => {
            setDeckTourActive(false);
            if (forceTour) {
              const next = new URLSearchParams(search);
              next.delete("tour");
              const q = next.toString();
              navigate(q ? `/mazos/nuevo?${q}` : "/mazos/nuevo", { replace: true });
            }
          }}
        />
      ) : null}

      <p className={styles.muted}>
        <Link to="/perfil?tab=mazos">← Mis mazos</Link>
      </p>
      <h1 className={styles.pageTitle} data-tour="deck-tour-title">
        {isNew ? "Crear mazo" : "Editar mazo"} · {deckGameLabel(game!)}
      </h1>
      {isNew ? (
        <p className={styles.muted} style={{ marginTop: 0 }}>
          Paso 2 de 2 ·{" "}
          <button
            type="button"
            className={styles.linkbtn}
            onClick={() => {
              setGame(null);
              setName("");
              setRawText("");
              setMode("paste");
              setDeckTourActive(false);
            }}
          >
            Cambiar juego
          </button>
        </p>
      ) : (
        <p className={styles.muted}>Juego: {deckGameLabel(game!)}</p>
      )}

      <label className={styles.label} data-tour="deck-tour-name">
        Nombre del mazo
        <input
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder={isPokemon ? "Ej. Charizard ex Standard" : "Ej. Racial Fuego Premier"}
        />
      </label>

      {isPokemon || isMyl ? (
        <div
          data-tour="deck-tour-modes"
          style={{ display: "flex", gap: "0.5rem", margin: "1rem 0", borderBottom: "1px solid var(--border)", paddingBottom: "0.65rem" }}
        >
          <button
            type="button"
            className={mode === "build" ? styles.btnPrimary : styles.btnGhost}
            style={{ padding: "0.4rem 0.75rem", fontSize: 13 }}
            onClick={() => {
              setBuildKey((k) => k + 1);
              setMode("build");
              setErr(null);
            }}
          >
            Armar mazo
          </button>
          <button
            type="button"
            className={mode === "paste" ? styles.btnPrimary : styles.btnGhost}
            style={{ padding: "0.4rem 0.75rem", fontSize: 13 }}
            onClick={() => setMode("paste")}
          >
            Pegar lista
          </button>
        </div>
      ) : null}

      {isPokemon && mode === "build" ? (
        <div data-tour="deck-tour-builder">
          <DeckBuilder
            key={buildKey}
            initialRawText={rawText}
            applyListLabel="Usar esta lista"
            onRawTextReady={(text) => {
              setRawText(text);
              setMode("paste");
              setErr(null);
            }}
          />
        </div>
      ) : isMyl && mode === "build" ? (
        <div data-tour="deck-tour-builder-myl">
          <MylDeckBuilder
            key={buildKey}
            initialRawText={rawText}
            applyListLabel="Usar esta lista"
            onRawTextReady={(text) => {
              setRawText(text);
              setMode("paste");
              setErr(null);
            }}
          />
        </div>
      ) : (
        <form className={styles.form} onSubmit={(e) => void save(e)}>
          <label className={styles.label} data-tour="deck-tour-list">
            {isPokemon ? "Lista (export PTCGL / Limitless)" : "Lista del mazo MyL"}
            <textarea
              className={styles.input}
              rows={14}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              required
              placeholder={
                isPokemon
                  ? "Pokémon: 12\n4 Pikachu SVI 001\n…"
                  : "3x Caballero\n4x Oro\n2x Tótem…"
              }
              style={{ fontFamily: "ui-monospace, monospace", resize: "vertical" }}
            />
          </label>

          {localParse ? (
            <p className={styles.muted} style={{ fontSize: 13 }}>
              {localParse.cardCount}/60 · Poké {localParse.categories.totals.pokemon} · Ent{" "}
              {localParse.categories.totals.trainer} · En {localParse.categories.totals.energy}
              {localParse.isValid ? " · Parece válido" : " · Revisar errores"}
            </p>
          ) : null}

          {(localParse?.errors.length || serverErrors.length) ? (
            <ul className={styles.error} style={{ margin: "0.5rem 0", paddingLeft: "1.1rem" }}>
              {[...(localParse?.errors || []), ...serverErrors]
                .filter((x, i, a) => a.indexOf(x) === i)
                .slice(0, 8)
                .map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
            </ul>
          ) : null}
          {(localParse?.warnings.length || serverWarnings.length) ? (
            <ul className={styles.muted} style={{ margin: "0.5rem 0", paddingLeft: "1.1rem", fontSize: 13 }}>
              {[...(localParse?.warnings || []), ...serverWarnings]
                .filter((x, i, a) => a.indexOf(x) === i)
                .slice(0, 6)
                .map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
            </ul>
          ) : null}

          {err ? <p className={styles.error}>{err}</p> : null}

          <div
            data-tour="deck-tour-save"
            style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.75rem" }}
          >
            <button type="submit" className={styles.btnPrimary} disabled={busy || !name.trim() || !rawText.trim()}>
              {busy ? "Guardando…" : "Guardar mazo"}
            </button>
            <Link to="/perfil?tab=mazos" className={styles.btnGhost} style={{ textDecoration: "none" }}>
              Cancelar
            </Link>
            {!isNew ? (
              <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => void removeDeck()} style={{ marginLeft: "auto" }}>
                Eliminar
              </button>
            ) : null}
          </div>
        </form>
      )}
    </div>
  );
}

export default DeckEdit;
