import { FormEvent, useEffect, useState } from "react";
import { parseResponseJson } from "../lib/parseResponseJson";
import { resolveStoreMediaUrl } from "../lib/media";
import { EVENT_GAME_TAGS, eventGameTagLabel, normalizeEventGameTag } from "../lib/eventGameTags";
import {
  MYL_DECK_FORMATS,
  MYL_ERAS,
  MYL_EVENT_TYPES,
  mylDeckFormatLabel,
  mylEraLabel,
  mylEventTypeLabel,
  mylRaceLabel,
  normalizeMylDeckFormat,
  normalizeMylEra,
  normalizeMylEventType,
  POKEMON_FORMATS,
  normalizePokemonFormat,
  pokemonFormatLabel,
} from "../lib/eventFormats";
import adminStyles from "../admin/admin.module.css";

type EventItem = {
  id: number;
  title: string;
  game_tag?: string;
  pokemon_format?: string;
  myl_era?: string;
  myl_event_type?: string;
  myl_deck_format?: string;
  starts_at?: string;
  date_label: string;
  place: string;
  description: string;
  image_url: string;
  link: string;
  active: boolean;
  registration_enabled?: boolean;
  capacity?: number;
  price_cents?: number;
  payment_online?: boolean;
  payment_webpay?: boolean;
  payment_store?: boolean;
  cancel_hours?: number;
  player_form_hours?: number;
  min_age?: number;
  terms_extra?: string;
};

type EventsBlock = {
  enabled: boolean;
  title: string;
  subtitle: string;
  items: EventItem[];
};

function toDatetimeLocalValue(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const emptyEvents = (): EventsBlock => ({
  enabled: true,
  title: "Eventos",
  subtitle: "Torneos, lanzamientos y encuentros",
  items: [],
});

function blankEvent(): EventItem {
  return {
    id: Date.now(),
    title: "",
    game_tag: "",
    pokemon_format: "casual",
    myl_era: "primera-era",
    myl_event_type: "ocasional",
    myl_deck_format: "racial",
    starts_at: "",
    date_label: "",
    place: "",
    description: "",
    image_url: "",
    link: "",
    active: true,
    registration_enabled: true,
    capacity: 16,
    price_cents: 0,
    payment_online: true,
    payment_webpay: true,
    payment_store: true,
    cancel_hours: 48,
    player_form_hours: 24,
    min_age: 13,
    terms_extra: "",
  };
}

export function AdminEvents() {
  const [events, setEvents] = useState<EventsBlock>(emptyEvents());
  const [draft, setDraft] = useState<EventItem>(blankEvent());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/store/admin/site-content", { credentials: "include" });
      const data = await parseResponseJson<{ error?: string; content?: { events?: EventsBlock } }>(res);
      if (!res.ok || !data.content) throw new Error(data.error || "No se pudo cargar.");
      setEvents({
        ...emptyEvents(),
        ...data.content.events,
        items: Array.isArray(data.content.events?.items) ? data.content.events.items : [],
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function saveEvents(next: EventsBlock, okMsg: string) {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/store/admin/site-content", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: next }),
      });
      const data = await parseResponseJson<{ error?: string; message?: string; content?: { events?: EventsBlock } }>(
        res
      );
      if (!res.ok) throw new Error(data.error || "No se pudo guardar.");
      const saved = data.content?.events;
      setEvents({
        ...emptyEvents(),
        ...saved,
        items: Array.isArray(saved?.items) ? saved.items : next.items,
      });
      setMsg(okMsg);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  function updateEvent(id: number, patch: Partial<EventItem>) {
    setEvents((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }));
  }

  async function onSaveSettings(e: FormEvent) {
    e.preventDefault();
    if (events.items.some((it) => it.title && !normalizeEventGameTag(it.game_tag))) {
      setErr("Cada torneo necesita etiqueta: Mitos y Leyendas o Pokémon.");
      return;
    }
    if (
      events.items.some(
        (it) =>
          it.title &&
          normalizeEventGameTag(it.game_tag) === "mitos-y-leyendas" &&
          (!normalizeMylEra(it.myl_era) || !normalizeMylEventType(it.myl_event_type)),
      )
    ) {
      setErr("En MyL elige era (Primera Era / Primer Bloque) y tipo (Liga, Avanzado, Casual o Premier).");
      return;
    }
    if (events.items.some((it) => it.registration_enabled && !String(it.starts_at || "").trim())) {
      setErr("Cada evento con cupos necesita día y hora de inicio. Si no pagan para entonces, el cupo se pierde.");
      return;
    }
    await saveEvents(events, "Eventos guardados.");
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!draft.title.trim()) {
      setErr("Ponle un título al evento.");
      return;
    }
    if (!normalizeEventGameTag(draft.game_tag)) {
      setErr("Elige la etiqueta del torneo: Mitos y Leyendas o Pokémon.");
      return;
    }
    if (
      normalizeEventGameTag(draft.game_tag) === "mitos-y-leyendas" &&
      (!normalizeMylEra(draft.myl_era) || !normalizeMylEventType(draft.myl_event_type))
    ) {
      setErr("En MyL elige era y tipo de torneo (como en torneos.myl.cl).");
      return;
    }
    if (draft.registration_enabled && !String(draft.starts_at || "").trim()) {
      setErr("Indica el día y la hora de inicio. Si no pagan el cupo para entonces, se pierde.");
      return;
    }
    const created = { ...draft, id: Date.now(), title: draft.title.trim() };
    const next = { ...events, items: [...events.items, created] };
    await saveEvents(next, `Evento «${created.title}» creado. Ya aparece en /eventos si está activo y la sección encendida.`);
    setDraft(blankEvent());
  }

  async function removeEvent(id: number) {
    if (!window.confirm("¿Quitar este evento?")) return;
    const next = { ...events, items: events.items.filter((it) => it.id !== id) };
    await saveEvents(next, "Evento eliminado.");
  }

  return (
    <div>
      <h1 className={adminStyles.pageTitle}>Eventos</h1>
      <p className={adminStyles.pageLead}>
        Crea torneos con etiqueta <strong>Mitos y Leyendas</strong> o <strong>Pokémon</strong>. El cupo se vende como
        producto: carrito, TUU o caja. Si llega la hora de inicio y no pagó, el cupo se pierde.
      </p>

      {loading ? <p className={adminStyles.muted}>Cargando…</p> : null}
      {err ? <p className={adminStyles.error}>{err}</p> : null}
      {msg ? <p className={adminStyles.banner}>{msg}</p> : null}

      {!loading ? (
        <>
          <form className={adminStyles.panelCard} onSubmit={(e) => void onCreate(e)}>
            <h2>Crear evento</h2>
            <EventFields
              item={draft}
              onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
              onError={setErr}
            />
            <div className={adminStyles.toolbar} style={{ marginTop: "0.85rem" }}>
              <button type="submit" className={adminStyles.btnPrimary} disabled={saving}>
                {saving ? "Creando…" : "Crear evento"}
              </button>
            </div>
          </form>

          <form className={adminStyles.panelCard} style={{ marginTop: "1rem" }} onSubmit={(e) => void onSaveSettings(e)}>
            <h2>Página de eventos</h2>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={events.enabled}
                onChange={(e) => setEvents((p) => ({ ...p, enabled: e.target.checked }))}
              />
              Mostrar eventos (menú, portada y /eventos)
            </label>
            <div className={adminStyles.formGrid} style={{ marginTop: "0.75rem" }}>
              <label className={adminStyles.label}>
                Título de la página
                <input
                  className={adminStyles.input}
                  value={events.title}
                  onChange={(e) => setEvents((p) => ({ ...p, title: e.target.value }))}
                />
              </label>
              <label className={adminStyles.label}>
                Subtítulo
                <input
                  className={adminStyles.input}
                  value={events.subtitle}
                  onChange={(e) => setEvents((p) => ({ ...p, subtitle: e.target.value }))}
                />
              </label>
            </div>

            <h2 style={{ marginTop: "1.25rem" }}>Eventos creados</h2>
            {events.items.length === 0 ? (
              <p className={adminStyles.muted}>Todavía no hay eventos. Usa el formulario de arriba.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                {events.items.map((it, idx) => (
                  <div
                    key={it.id}
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: 6,
                      padding: "0.85rem",
                      background: "#fafafa",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      <strong>
                        #{idx + 1} {it.title || "Sin título"}
                        {eventGameTagLabel(it.game_tag) ? ` · ${eventGameTagLabel(it.game_tag)}` : ""}
                        {pokemonFormatLabel(it.pokemon_format) ? ` · ${pokemonFormatLabel(it.pokemon_format)}` : ""}
                        {mylEraLabel(it.myl_era) ? ` · ${mylEraLabel(it.myl_era)}` : ""}
                        {mylEventTypeLabel(it.myl_event_type) ? ` · ${mylEventTypeLabel(it.myl_event_type)}` : ""}
                        {mylDeckFormatLabel(it.myl_deck_format) ? ` · ${mylDeckFormatLabel(it.myl_deck_format)}` : ""}
                      </strong>
                      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                          <input
                            type="checkbox"
                            checked={it.active}
                            onChange={(e) => updateEvent(it.id, { active: e.target.checked })}
                          />
                          Visible
                        </label>
                        <button type="button" className={adminStyles.btnDanger} onClick={() => void removeEvent(it.id)}>
                          Quitar
                        </button>
                      </div>
                    </div>
                    <EventFields item={it} onChange={(patch) => updateEvent(it.id, patch)} onError={setErr} />
                  </div>
                ))}
              </div>
            )}

            <div className={adminStyles.toolbar} style={{ marginTop: "1rem" }}>
              <button type="submit" className={adminStyles.btnPrimary} disabled={saving}>
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </form>

          <EventRegistrationsPanel events={events.items} />
        </>
      ) : null}
    </div>
  );
}

function EventFields({
  item,
  onChange,
  onError,
}: {
  item: EventItem;
  onChange: (patch: Partial<EventItem>) => void;
  onError?: (msg: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function uploadImage(file: File | undefined) {
    if (!file) return;
    const okType = /image\/(jpeg|jpg|png)/i.test(file.type) || /\.(jpe?g|png)$/i.test(file.name);
    if (!okType) {
      onError?.("La foto tiene que ser JPG o PNG.");
      return;
    }
    setUploading(true);
    onError?.(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/store/admin/events/image", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await parseResponseJson<{ error?: string; image_url?: string }>(res);
      if (!res.ok || !data.image_url) throw new Error(data.error || "No se pudo subir la imagen.");
      onChange({ image_url: data.image_url });
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Error al subir.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <div className={adminStyles.formGrid}>
        <label className={adminStyles.label}>
          Título
          <input className={adminStyles.input} value={item.title} onChange={(e) => onChange({ title: e.target.value })} />
        </label>
        <label className={adminStyles.label}>
          Etiqueta del torneo
          <select
            className={adminStyles.input}
            value={normalizeEventGameTag(item.game_tag)}
            onChange={(e) => {
              const game_tag = e.target.value;
              const patch: Partial<EventItem> = { game_tag };
              if (game_tag === "mitos-y-leyendas") {
                patch.myl_era = item.myl_era || "primera-era";
                patch.myl_event_type = item.myl_event_type || "ocasional";
                patch.myl_deck_format = item.myl_deck_format || "racial";
              }
              onChange(patch);
            }}
          >
            <option value="">Elegir…</option>
            {EVENT_GAME_TAGS.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {normalizeEventGameTag(item.game_tag) === "mitos-y-leyendas" ? (
          <>
            <label className={adminStyles.label}>
              Era / juego
              <select
                className={adminStyles.input}
                value={normalizeMylEra(item.myl_era)}
                onChange={(e) => onChange({ myl_era: e.target.value })}
              >
                <option value="">Elegir…</option>
                {MYL_ERAS.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={adminStyles.label}>
              Tipo de torneo
              <select
                className={adminStyles.input}
                value={normalizeMylEventType(item.myl_event_type)}
                onChange={(e) => onChange({ myl_event_type: e.target.value })}
              >
                <option value="">Elegir…</option>
                {MYL_EVENT_TYPES.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={adminStyles.label}>
              Formato de mazo
              <select
                className={adminStyles.input}
                value={normalizeMylDeckFormat(item.myl_deck_format) || "racial"}
                onChange={(e) => onChange({ myl_deck_format: e.target.value })}
              >
                {MYL_DECK_FORMATS.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        {normalizeEventGameTag(item.game_tag) === "pokemon" ? (
          <label className={adminStyles.label}>
            Formato Pokémon
            <select
              className={adminStyles.input}
              value={normalizePokemonFormat(item.pokemon_format) || "casual"}
              onChange={(e) => onChange({ pokemon_format: e.target.value })}
            >
              {POKEMON_FORMATS.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className={adminStyles.label}>
          Inicio (día y hora)
          <input
            className={adminStyles.input}
            type="datetime-local"
            value={toDatetimeLocalValue(item.starts_at)}
            onChange={(e) => {
              const v = e.target.value;
              onChange({ starts_at: v ? new Date(v).toISOString() : "" });
            }}
          />
        </label>
        <label className={adminStyles.label}>
          Texto de fecha (opcional)
          <input
            className={adminStyles.input}
            value={item.date_label}
            onChange={(e) => onChange({ date_label: e.target.value })}
            placeholder="Si lo dejas vacío, se arma desde el inicio"
          />
        </label>
        <label className={adminStyles.label}>
          Lugar
          <input className={adminStyles.input} value={item.place} onChange={(e) => onChange({ place: e.target.value })} />
        </label>
        <label className={adminStyles.label}>
          Link externo (opcional)
          <input
            className={adminStyles.input}
            value={item.link}
            onChange={(e) => onChange({ link: e.target.value })}
            placeholder="https://…"
          />
        </label>
        <label className={adminStyles.label} style={{ gridColumn: "1 / -1" }}>
          Descripción
          <textarea
            className={adminStyles.input}
            rows={2}
            value={item.description}
            onChange={(e) => onChange({ description: e.target.value })}
          />
        </label>
        <label className={adminStyles.label} style={{ gridColumn: "1 / -1" }}>
          Imagen (JPG o PNG)
          {resolveStoreMediaUrl(item.image_url) ? (
            <img
              src={resolveStoreMediaUrl(item.image_url)}
              alt=""
              style={{
                width: "100%",
                maxHeight: 160,
                objectFit: "cover",
                borderRadius: 8,
                margin: "0.4rem 0",
                border: "1px solid #ddd",
              }}
            />
          ) : (
            <p className={adminStyles.muted} style={{ margin: "0.35rem 0" }}>
              Sin foto todavía. Sube un JPG o PNG.
            </p>
          )}
          <input
            className={adminStyles.input}
            type="file"
            accept="image/jpeg,image/png,.jpg,.jpeg,.png"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              void uploadImage(f);
            }}
          />
          {uploading ? <span className={adminStyles.muted}>Subiendo…</span> : null}
          {item.image_url ? (
            <button
              type="button"
              className={adminStyles.btn}
              style={{ marginTop: "0.45rem" }}
              disabled={uploading}
              onClick={() => onChange({ image_url: "" })}
            >
              Quitar foto
            </button>
          ) : null}
        </label>
      </div>
      <div style={{ marginTop: "0.85rem", paddingTop: "0.75rem", borderTop: "1px dashed #ccc" }}>
        <strong style={{ fontSize: "0.9rem" }}>Cupos</strong>
        <div className={adminStyles.formGrid} style={{ marginTop: "0.55rem" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
            <input
              type="checkbox"
              checked={Boolean(item.registration_enabled)}
              onChange={(e) => onChange({ registration_enabled: e.target.checked })}
            />
            Vender cupos en la web
          </label>
          <label className={adminStyles.label}>
            Cupos totales
            <input
              className={adminStyles.input}
              value={String(item.capacity ?? 0)}
              onChange={(e) =>
                onChange({ capacity: parseInt(e.target.value.replace(/[^\d]/g, "") || "0", 10) || 0 })
              }
              placeholder="16 (0 = sin límite)"
            />
          </label>
          <label className={adminStyles.label}>
            Precio del cupo (pesos)
            <input
              className={adminStyles.input}
              value={String(item.price_cents ?? 0)}
              onChange={(e) =>
                onChange({ price_cents: parseInt(e.target.value.replace(/[^\d]/g, "") || "0", 10) || 0 })
              }
            />
          </label>
          <label className={adminStyles.label}>
            Horas para arrepentirse
            <input
              className={adminStyles.input}
              value={String(item.cancel_hours ?? 0)}
              onChange={(e) =>
                onChange({ cancel_hours: parseInt(e.target.value.replace(/[^\d]/g, "") || "0", 10) || 0 })
              }
              placeholder="0 = sin ventana / 48 = típico"
            />
          </label>
          <label className={adminStyles.label}>
            Horas antes del inicio para datos / lista
            <input
              className={adminStyles.input}
              value={String(item.player_form_hours ?? 24)}
              onChange={(e) =>
                onChange({ player_form_hours: parseInt(e.target.value.replace(/[^\d]/g, "") || "0", 10) || 0 })
              }
              placeholder="24"
            />
          </label>
          <label className={adminStyles.label}>
            Edad mínima del jugador
            <input
              className={adminStyles.input}
              value={String(item.min_age ?? 13)}
              onChange={(e) => onChange({ min_age: parseInt(e.target.value.replace(/[^\d]/g, "") || "0", 10) || 0 })}
              placeholder="13"
            />
          </label>
          <label className={adminStyles.label} style={{ gridColumn: "1 / -1" }}>
            Texto extra en términos (opcional)
            <textarea
              className={adminStyles.input}
              rows={2}
              value={item.terms_extra || ""}
              onChange={(e) => onChange({ terms_extra: e.target.value })}
              placeholder="Reglas extra del torneo…"
            />
          </label>
        </div>
        <p className={adminStyles.muted} style={{ marginBottom: 0, fontSize: "0.82rem" }}>
          Al guardar se crea el producto-cupo para el carrito y la caja. No aparece en el catálogo de sellados.
        </p>
      </div>
    </>
  );
}

function EventRegistrationsPanel({ events }: { events: Array<{ id: number; title: string }> }) {
  const [eventId, setEventId] = useState("");
  const [rows, setRows] = useState<
    Array<{
      _id: number;
      event_id: number;
      event_title?: string;
      buyer_name?: string;
      buyer_email?: string;
      popid?: string | null;
      cl?: string | null;
      myl_race?: string | null;
      player_name?: string | null;
      birth_year?: number | null;
      decklist_url?: string | null;
      guardian_name?: string | null;
      payment_method?: string;
      status?: string;
      price_cents?: number;
    }>
  >([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    setErr(null);
    try {
      const q = eventId ? `?event_id=${encodeURIComponent(eventId)}` : "";
      const res = await fetch(`/api/store/admin/event-registrations${q}`, { credentials: "include" });
      const data = await parseResponseJson<{ error?: string; registrations?: typeof rows }>(res);
      if (!res.ok) throw new Error(data.error || "No se pudieron cargar inscripciones.");
      setRows(Array.isArray(data.registrations) ? data.registrations : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function markPaid(id: number) {
    setBusy(true);
    try {
      const res = await fetch(`/api/store/admin/event-registrations/${id}/mark-paid`, {
        method: "POST",
        credentials: "include",
      });
      const data = await parseResponseJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "No se pudo marcar.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
      setBusy(false);
    }
  }

  async function cancelReg(id: number) {
    if (!window.confirm("¿Liberar este cupo?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/store/admin/event-registrations/${id}/cancel`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "admin" }),
      });
      const data = await parseResponseJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "No se pudo cancelar.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
      setBusy(false);
    }
  }

  return (
    <div className={adminStyles.panelCard} style={{ marginTop: "1.25rem" }}>
      <h2>Inscripciones / cupos</h2>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
        <select className={adminStyles.input} value={eventId} onChange={(e) => setEventId(e.target.value)}>
          <option value="">Todos los eventos</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              #{ev.id} — {ev.title || "Sin título"}
            </option>
          ))}
        </select>
        <button type="button" className={adminStyles.btn} disabled={busy} onClick={() => void load()}>
          Actualizar
        </button>
      </div>
      {err ? <p className={adminStyles.error}>{err}</p> : null}
      {rows.length === 0 ? (
        <p className={adminStyles.muted}>Aún no hay inscripciones.</p>
      ) : (
        <div className={adminStyles.tableWrap}>
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Evento</th>
                <th>Cliente</th>
                <th>Jugador</th>
                <th>Pago</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id}>
                  <td>#{r._id}</td>
                  <td>{r.event_title || `#${r.event_id}`}</td>
                  <td>
                    {r.buyer_name}
                    <div className={adminStyles.muted}>{r.buyer_email}</div>
                  </td>
                  <td>
                    {r.player_name || r.buyer_name || "—"}
                    {r.popid ? <div className={adminStyles.muted}>POPID {r.popid}</div> : null}
                    {r.cl ? <div className={adminStyles.muted}>CL {r.cl}</div> : null}
                    {r.myl_race ? <div className={adminStyles.muted}>Raza {mylRaceLabel(r.myl_race) || r.myl_race}</div> : null}
                    {r.birth_year ? <div className={adminStyles.muted}>{r.birth_year}</div> : null}
                    {r.guardian_name ? <div className={adminStyles.muted}>Tutor {r.guardian_name}</div> : null}
                    {r.decklist_url ? (
                      <div className={adminStyles.muted}>
                        <a href={r.decklist_url} target="_blank" rel="noreferrer">
                          Lista
                        </a>
                      </div>
                    ) : null}
                  </td>
                  <td>
                    {r.payment_method === "store" ? "Tienda" : r.payment_method || "—"}
                    {typeof r.price_cents === "number" ? ` · $${r.price_cents.toLocaleString("es-CL")}` : null}
                  </td>
                  <td>{r.status}</td>
                  <td>
                    <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                      {r.status === "pending_store_payment" || r.status === "pending_payment" ? (
                        <button
                          type="button"
                          className={adminStyles.btnPrimary}
                          disabled={busy}
                          onClick={() => void markPaid(r._id)}
                        >
                          Marcar pagado
                        </button>
                      ) : null}
                      {r.status !== "cancelled" && r.status !== "refunded" ? (
                        <button
                          type="button"
                          className={adminStyles.btnDanger}
                          disabled={busy}
                          onClick={() => void cancelReg(r._id)}
                        >
                          Liberar
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
