import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { eventGameTagLabel, normalizeEventGameTag } from "../lib/eventGameTags";
import { eventNeedsDecklist, mylRacesForEra } from "../lib/eventFormats";
import { parseResponseJson } from "../lib/parseResponseJson";
import type { EventPlayer } from "../lib/eventPlayer";
import styles from "../screens/pages.module.css";

type SavedDeckOption = {
  id: number;
  name: string;
  game?: string;
  cardCount: number;
  isValid: boolean;
};

export type EventPlayerFormRow = {
  id: number;
  event_title?: string;
  game_tag?: string | null;
  game_tag_label?: string | null;
  pokemon_format?: string | null;
  myl_era?: string | null;
  myl_event_type?: string | null;
  myl_deck_format?: string | null;
  myl_race?: string | null;
  needs_form?: boolean;
  can_edit_race?: boolean;
  needs_decklist?: boolean;
  needs_guardian?: boolean;
  form_open?: boolean;
  form_deadline?: number | null;
  event_player?: EventPlayer | null;
  popid?: string | null;
  cl?: string | null;
  player_name?: string | null;
  birth_year?: number | null;
  decklist_text?: string | null;
  decklist_url?: string | null;
  guardian_name?: string | null;
};

function accountName(user: { first_name?: string | null; last_name?: string | null; name?: string } | null | undefined) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() || user?.name || "";
}

function deadlineLabel(ms?: number | null) {
  if (!ms) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" });
}

export function EventPlayerForm({
  registration,
  onSaved,
}: {
  registration: EventPlayerFormRow;
  onSaved?: (player: EventPlayer) => void;
}) {
  const { user, refresh } = useAuth();
  const tag = normalizeEventGameTag(registration.game_tag);
  const existing = registration.event_player || {};
  const askDecklist = Boolean(registration.needs_decklist || eventNeedsDecklist(registration));
  const [popid, setPopid] = useState(String(existing.popid || registration.popid || user?.popid || ""));
  const [playerCl, setPlayerCl] = useState(String(existing.cl || registration.cl || user?.myl_cl || ""));
  const raceOptions = mylRacesForEra(registration.myl_era);
  const [mylRace, setMylRace] = useState(
    String(existing.myl_race || registration.myl_race || ""),
  );
  const [playerName, setPlayerName] = useState(
    String(existing.full_name || registration.player_name || accountName(user)),
  );
  const [birthYear, setBirthYear] = useState(
    existing.birth_year != null
      ? String(existing.birth_year)
      : registration.birth_year != null
        ? String(registration.birth_year)
        : user?.birth_year != null
          ? String(user.birth_year)
          : "",
  );
  const [decklistText, setDecklistText] = useState(String(existing.decklist_text || registration.decklist_text || ""));
  const [decklistUrl, setDecklistUrl] = useState(String(existing.decklist_url || registration.decklist_url || ""));
  const [savedDecks, setSavedDecks] = useState<SavedDeckOption[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [guardianName, setGuardianName] = useState(String(existing.guardian_name || registration.guardian_name || ""));
  const [guardianRut, setGuardianRut] = useState(String(existing.guardian_rut || ""));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!askDecklist || tag !== "pokemon") return;
    let alive = true;
    fetch("/api/store/me/decks?game=pokemon", { credentials: "include" })
      .then(async (r) => {
        const j = await parseResponseJson<{ ok?: boolean; decks?: SavedDeckOption[] }>(r);
        if (alive && r.ok && j.ok) {
          setSavedDecks((j.decks || []).filter((d) => !d.game || d.game === "pokemon"));
        }
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      alive = false;
    };
  }, [askDecklist, tag]);

  async function applySavedDeck(deckId: string) {
    setSelectedDeckId(deckId);
    if (!deckId) return;
    try {
      const res = await fetch(`/api/store/me/decks/${deckId}`, { credentials: "include" });
      const data = await parseResponseJson<{ ok?: boolean; deck?: { rawText?: string }; error?: string }>(res);
      if (!res.ok || !data.ok || !data.deck?.rawText) {
        throw new Error(data.error || "No se pudo cargar el mazo.");
      }
      setDecklistText(data.deck.rawText);
      setDecklistUrl("");
      setErr(null);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Error al cargar el mazo");
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setOk(false);
    try {
      const body =
        tag === "pokemon"
          ? {
              popid,
              full_name: playerName,
              birth_year: birthYear,
              decklist_text: decklistText,
              decklist_url: decklistUrl,
              guardian_name: guardianName,
              guardian_rut: guardianRut,
            }
          : {
              full_name: playerName,
              cl: playerCl,
              myl_race: mylRace,
              guardian_name: guardianName,
              guardian_rut: guardianRut,
            };
      const res = await fetch(`/api/store/me/events/${registration.id}/player`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await parseResponseJson<{ ok?: boolean; error?: string; event_player?: EventPlayer }>(res);
      if (!res.ok || !data.ok) throw new Error(data.error || "No se pudieron guardar los datos.");
      setOk(true);
      await refresh();
      onSaved?.(data.event_player || (body as EventPlayer));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  if (tag !== "pokemon" && tag !== "mitos-y-leyendas") return null;
  const raceEditOnly = tag === "mitos-y-leyendas" && registration.can_edit_race && registration.form_open === false;
  if (registration.form_open === false && !raceEditOnly) {
    return (
      <p className={styles.muted}>
        Se acabó el plazo para enviar los datos de este cupo.
        {deadlineLabel(registration.form_deadline) ? ` Cierre: ${deadlineLabel(registration.form_deadline)}.` : ""}
      </p>
    );
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} style={{ margin: "0.75rem 0" }}>
      <p className={styles.kicker}>
        {eventGameTagLabel(tag) || registration.game_tag_label || "Jugador"}
        {registration.event_title ? ` · ${registration.event_title}` : ""}
      </p>
      {raceEditOnly ? (
        <p className={styles.muted}>Puedes cambiar la raza hasta que empiece el torneo.</p>
      ) : deadlineLabel(registration.form_deadline) ? (
        <p className={styles.muted}>Envía estos datos antes del {deadlineLabel(registration.form_deadline)}.</p>
      ) : null}
      {tag === "pokemon" ? (
        <>
          <label className={styles.label}>
            POPID
            <input
              className={styles.input}
              value={popid}
              onChange={(e) => setPopid(e.target.value)}
              required
              placeholder="Tu POPID"
              autoComplete="off"
            />
          </label>
          <label className={styles.label}>
            Nombre completo
            <input className={styles.input} value={playerName} onChange={(e) => setPlayerName(e.target.value)} required />
          </label>
          <label className={styles.label}>
            Año de nacimiento
            <input
              className={styles.input}
              inputMode="numeric"
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
              required
              placeholder="1998"
            />
          </label>
        </>
      ) : (
        <>
          <label className={styles.label}>
            Nombre
            <input className={styles.input} value={playerName} onChange={(e) => setPlayerName(e.target.value)} required />
          </label>
          <label className={styles.label}>
            CL
            <input
              className={styles.input}
              value={playerCl}
              onChange={(e) => setPlayerCl(e.target.value)}
              required
              placeholder="Tu código CL"
              autoComplete="off"
            />
          </label>
          <label className={styles.label}>
            Raza
            <select className={styles.input} value={mylRace} onChange={(e) => setMylRace(e.target.value)} required>
              <option value="">Elige tu raza</option>
              {raceOptions.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {askDecklist ? (
        <>
          <p className={styles.kicker}>Lista de mazo (Challenge / Cup)</p>
          <label className={styles.label}>
            Usar un mazo guardado
            <select
              className={styles.input}
              value={selectedDeckId}
              onChange={(e) => void applySavedDeck(e.target.value)}
            >
              <option value="">Elegir mazo…</option>
              {savedDecks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.cardCount}/60{d.isValid ? "" : " · revisar"})
                </option>
              ))}
            </select>
          </label>
          <p className={styles.muted} style={{ fontSize: 13, marginTop: 0 }}>
            <Link to="/perfil?tab=mazos">Administrar mis mazos</Link>
            {" · "}
            <Link to="/mazos/nuevo">Crear uno nuevo</Link>
          </p>
          <label className={styles.label}>
            URL de la lista (Poképaste o Limitless)
            <input
              className={styles.input}
              value={decklistUrl}
              onChange={(e) => {
                setDecklistUrl(e.target.value);
                setSelectedDeckId("");
              }}
              placeholder="https://…"
            />
          </label>
          <label className={styles.label}>
            O pega / edita la lista
            <textarea
              className={styles.input}
              rows={6}
              value={decklistText}
              onChange={(e) => {
                setDecklistText(e.target.value);
                setSelectedDeckId("");
              }}
              placeholder="Pokémon: …"
            />
          </label>
        </>
      ) : tag === "pokemon" ? (
        <p className={styles.muted}>Formato Casual: no pedimos lista de mazo.</p>
      ) : null}
      <p className={styles.muted}>Si el jugador es menor de 18 años, completa tutor o apoderado.</p>
      <label className={styles.label}>
        Nombre del tutor / apoderado
        <input
          className={styles.input}
          value={guardianName}
          onChange={(e) => setGuardianName(e.target.value)}
          placeholder="Obligatorio si es menor de 18"
        />
      </label>
      <label className={styles.label}>
        RUT del tutor / apoderado
        <input
          className={styles.input}
          value={guardianRut}
          onChange={(e) => setGuardianRut(e.target.value)}
          placeholder="12.345.678-9"
        />
      </label>
      {err ? <p className={styles.error}>{err}</p> : null}
      {ok ? <p className={styles.banner}>Datos del jugador guardados.</p> : null}
      <button type="submit" className={styles.btnPrimary} disabled={busy}>
        {busy
          ? "Guardando…"
          : raceEditOnly || Boolean(existing.myl_race || registration.myl_race)
            ? "Actualizar datos"
            : "Guardar datos del jugador"}
      </button>
    </form>
  );
}

export function EventPlayerFormsForOrder({ orderId }: { orderId: number | string }) {
  const [rows, setRows] = useState<EventPlayerFormRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/store/orders/${encodeURIComponent(String(orderId))}/event-players`, { credentials: "include" })
      .then(async (r) => {
        const j = await parseResponseJson<{ ok?: boolean; forms?: EventPlayerFormRow[]; error?: string }>(r);
        if (!r.ok || !j.ok) throw new Error(j.error || "No se pudieron cargar los formularios.");
        if (alive) setRows(j.forms || []);
      })
      .catch((e) => {
        if (alive) setErr(e instanceof Error ? e.message : "Error");
      });
    return () => {
      alive = false;
    };
  }, [orderId]);

  if (err) return <p className={styles.error}>{err}</p>;
  if (!rows) return <p className={styles.muted}>Cargando datos del jugador…</p>;
  const pending = rows.filter((r) => r.needs_form);
  if (pending.length === 0) return null;

  return (
    <div style={{ marginTop: "1rem" }}>
      <h2 className={styles.pageTitle} style={{ fontSize: "1.15rem" }}>
        Datos del jugador
      </h2>
      <p className={styles.muted}>Completa estos datos antes del plazo. Si no llegan, te avisamos por correo.</p>
      {pending.map((row) => (
        <EventPlayerForm
          key={row.id}
          registration={row}
          onSaved={() => setRows((cur) => (cur || []).map((x) => (x.id === row.id ? { ...x, needs_form: false } : x)))}
        />
      ))}
    </div>
  );
}
