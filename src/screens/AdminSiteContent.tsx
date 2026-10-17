import { FormEvent, useEffect, useState } from "react";
import { parseResponseJson } from "../lib/parseResponseJson";
import adminStyles from "../admin/admin.module.css";

type SocialRow = { enabled: boolean; url: string; phone?: string };
type EventItem = {
  id: number;
  title: string;
  date_label: string;
  place: string;
  description: string;
  image_url: string;
  link: string;
  active: boolean;
  registration_enabled?: boolean;
  capacity?: number;
  price_cents?: number;
  payment_webpay?: boolean;
  payment_store?: boolean;
  cancel_hours?: number;
  terms_extra?: string;
};

type SiteContent = {
  singles_enabled: boolean;
  socials: {
    facebook: SocialRow;
    instagram: SocialRow;
    youtube: SocialRow;
    whatsapp: SocialRow;
  };
  about: { enabled: boolean; title: string; body: string };
  home_cards: { sealed_image_url: string; events_image_url: string };
  events: { enabled: boolean; title: string; subtitle: string; items: EventItem[] };
};

const emptySocial = (): SocialRow => ({ enabled: false, url: "", phone: "" });

const emptyContent = (): SiteContent => ({
  singles_enabled: false,
  socials: {
    facebook: emptySocial(),
    instagram: emptySocial(),
    youtube: emptySocial(),
    whatsapp: emptySocial(),
  },
  about: {
    enabled: true,
    title: "Quiénes somos",
    body: "Somos Plasma Store: cartas, sellados y una comunidad gamer en Chile.",
  },
  home_cards: { sealed_image_url: "", events_image_url: "" },
  events: {
    enabled: true,
    title: "Eventos",
    subtitle: "Torneos, lanzamientos y encuentros",
    items: [],
  },
});

export function AdminSiteContent() {
  const [content, setContent] = useState<SiteContent>(emptyContent());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingCard, setUploadingCard] = useState<"sealed" | "events" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/store/admin/site-content", { credentials: "include" });
      const data = await parseResponseJson<{ error?: string; content?: SiteContent }>(res);
      if (!res.ok || !data.content) throw new Error(data.error || "No se pudo cargar.");
      setContent({
        ...emptyContent(),
        ...data.content,
        socials: { ...emptyContent().socials, ...data.content.socials },
        about: { ...emptyContent().about, ...data.content.about },
        home_cards: { ...emptyContent().home_cards, ...data.content.home_cards },
        events: {
          ...emptyContent().events,
          ...data.content.events,
          items: Array.isArray(data.content.events?.items) ? data.content.events.items : [],
        },
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

  function setSocial(key: keyof SiteContent["socials"], patch: Partial<SocialRow>) {
    setContent((prev) => ({
      ...prev,
      socials: { ...prev.socials, [key]: { ...prev.socials[key], ...patch } },
    }));
  }

  function addEvent() {
    setContent((prev) => ({
      ...prev,
      events: {
        ...prev.events,
        items: [
          ...prev.events.items,
          {
            id: Date.now(),
            title: "",
            date_label: "",
            place: "",
            description: "",
            image_url: "",
            link: "",
            active: true,
            registration_enabled: true,
            capacity: 16,
            price_cents: 0,
            payment_webpay: true,
            payment_store: true,
            cancel_hours: 48,
            terms_extra: "",
          },
        ],
      },
    }));
  }

  function updateEvent(id: number, patch: Partial<EventItem>) {
    setContent((prev) => ({
      ...prev,
      events: {
        ...prev.events,
        items: prev.events.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
      },
    }));
  }

  function removeEvent(id: number) {
    setContent((prev) => ({
      ...prev,
      events: { ...prev.events, items: prev.events.items.filter((it) => it.id !== id) },
    }));
  }

  function applyContent(raw: SiteContent) {
    setContent({
      ...emptyContent(),
      ...raw,
      socials: { ...emptyContent().socials, ...raw.socials },
      about: { ...emptyContent().about, ...raw.about },
      home_cards: { ...emptyContent().home_cards, ...raw.home_cards },
      events: {
        ...emptyContent().events,
        ...raw.events,
        items: Array.isArray(raw.events?.items) ? raw.events.items : [],
      },
    });
  }

  async function uploadHomeCard(slot: "sealed" | "events", file: File | undefined) {
    if (!file) return;
    setUploadingCard(slot);
    setErr(null);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("slot", slot);
      const res = await fetch("/api/store/admin/site-content/image", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await parseResponseJson<{ error?: string; message?: string; content?: SiteContent }>(res);
      if (!res.ok || !data.content) throw new Error(data.error || "No se pudo subir la imagen.");
      applyContent(data.content);
      setMsg(data.message || "Imagen actualizada.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al subir.");
    } finally {
      setUploadingCard(null);
    }
  }

  async function clearHomeCard(slot: "sealed" | "events") {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const patch =
        slot === "sealed"
          ? { home_cards: { ...content.home_cards, sealed_image_url: "" } }
          : { home_cards: { ...content.home_cards, events_image_url: "" } };
      const res = await fetch("/api/store/admin/site-content", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await parseResponseJson<{ error?: string; message?: string; content?: SiteContent }>(res);
      if (!res.ok || !data.content) throw new Error(data.error || "No se pudo quitar la imagen.");
      applyContent(data.content);
      setMsg(slot === "sealed" ? "Imagen de Sellado restaurada al dibujo por defecto." : "Imagen de Eventos restaurada al dibujo por defecto.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/store/admin/site-content", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(content),
      });
      const data = await parseResponseJson<{ error?: string; message?: string; content?: SiteContent }>(res);
      if (!res.ok) throw new Error(data.error || "No se pudo guardar.");
      setMsg(data.message || "Guardado.");
      if (data.content) {
        setContent({
          ...emptyContent(),
          ...data.content,
          socials: { ...emptyContent().socials, ...data.content.socials },
          about: { ...emptyContent().about, ...data.content.about },
          home_cards: { ...emptyContent().home_cards, ...data.content.home_cards },
          events: {
            ...emptyContent().events,
            ...data.content.events,
            items: Array.isArray(data.content.events?.items) ? data.content.events.items : [],
          },
        });
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  const socialMeta: Array<{ key: keyof SiteContent["socials"]; label: string; placeholder: string }> = [
    { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/tu-pagina" },
    { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/tu-cuenta" },
    { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@tu-canal" },
    { key: "whatsapp", label: "WhatsApp", placeholder: "https://wa.me/569XXXXXXXX" },
  ];

  return (
    <div>
      <h1 className={adminStyles.pageTitle}>Sitio · redes y contenido</h1>
      <p className={adminStyles.pageLead}>
        Activa o desactiva redes sociales, el enlace «Quiénes somos» del menú y promociona eventos (recuadro de la
        portada).
      </p>

      {loading ? <p className={adminStyles.muted}>Cargando…</p> : null}
      {err ? <p className={adminStyles.error}>{err}</p> : null}
      {msg ? <p className={adminStyles.banner}>{msg}</p> : null}

      {!loading ? (
        <form onSubmit={(e) => void onSave(e)}>
          <div className={adminStyles.panelCard}>
            <h2>Singles</h2>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={content.singles_enabled}
                onChange={(e) => setContent((p) => ({ ...p, singles_enabled: e.target.checked }))}
              />
              Activar sección Singles (desactivado por defecto)
            </label>
            <p className={adminStyles.muted} style={{ marginBottom: 0 }}>
              Con Singles apagado se oculta el enlace del menú y la ruta redirige a Eventos.
            </p>
          </div>

          <div className={adminStyles.panelCard} style={{ marginTop: "1rem" }}>
            <h2>Portada · recuadros Sellado y Eventos</h2>
            <p className={adminStyles.muted}>
              Cambia las imágenes de los dos recuadros grandes de la página de inicio. Si las quitas, vuelven el
              dibujo de cartas y la estrella verde.
            </p>
            <div className={adminStyles.formGrid}>
              <div>
                <div className={adminStyles.label}>Sellado (catálogo)</div>
                {content.home_cards.sealed_image_url ? (
                  <img
                    src={content.home_cards.sealed_image_url}
                    alt="Vista Sellado"
                    style={{
                      width: "100%",
                      maxHeight: 140,
                      objectFit: "cover",
                      borderRadius: 10,
                      margin: "0.4rem 0",
                      border: "1px solid #ddd",
                    }}
                  />
                ) : (
                  <p className={adminStyles.muted}>Sin foto: se muestra el icono de cartas.</p>
                )}
                <input
                  className={adminStyles.input}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                  disabled={uploadingCard != null || saving}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    void uploadHomeCard("sealed", f);
                  }}
                />
                {content.home_cards.sealed_image_url ? (
                  <button
                    type="button"
                    className={adminStyles.btn}
                    style={{ marginTop: "0.45rem" }}
                    disabled={saving || uploadingCard != null}
                    onClick={() => void clearHomeCard("sealed")}
                  >
                    Quitar foto
                  </button>
                ) : null}
              </div>
              <div>
                <div className={adminStyles.label}>Eventos</div>
                {content.home_cards.events_image_url ? (
                  <img
                    src={content.home_cards.events_image_url}
                    alt="Vista Eventos"
                    style={{
                      width: "100%",
                      maxHeight: 140,
                      objectFit: "cover",
                      borderRadius: 10,
                      margin: "0.4rem 0",
                      border: "1px solid #ddd",
                    }}
                  />
                ) : (
                  <p className={adminStyles.muted}>Sin foto: se muestra la estrella verde.</p>
                )}
                <input
                  className={adminStyles.input}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                  disabled={uploadingCard != null || saving}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    void uploadHomeCard("events", f);
                  }}
                />
                {content.home_cards.events_image_url ? (
                  <button
                    type="button"
                    className={adminStyles.btn}
                    style={{ marginTop: "0.45rem" }}
                    disabled={saving || uploadingCard != null}
                    onClick={() => void clearHomeCard("events")}
                  >
                    Quitar foto
                  </button>
                ) : null}
              </div>
            </div>
            {uploadingCard ? <p className={adminStyles.muted}>Subiendo imagen…</p> : null}
          </div>

          <div className={adminStyles.panelCard} style={{ marginTop: "1rem" }}>
            <h2>Redes sociales</h2>
            <p className={adminStyles.muted}>Solo se muestran en la tienda las redes activadas con URL.</p>
            <div className={adminStyles.formGrid}>
              {socialMeta.map((s) => (
                <div key={s.key} className={adminStyles.label}>
                  <span style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                    {s.label}
                    <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontWeight: 500 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(content.socials[s.key]?.enabled)}
                        onChange={(e) => setSocial(s.key, { enabled: e.target.checked })}
                      />
                      Activo
                    </label>
                  </span>
                  <input
                    className={adminStyles.input}
                    value={content.socials[s.key]?.url || ""}
                    onChange={(e) => setSocial(s.key, { url: e.target.value })}
                    placeholder={s.placeholder}
                    disabled={!content.socials[s.key]?.enabled}
                  />
                  {s.key === "whatsapp" ? (
                    <input
                      className={adminStyles.input}
                      style={{ marginTop: "0.35rem" }}
                      value={content.socials.whatsapp?.phone || ""}
                      onChange={(e) => setSocial("whatsapp", { phone: e.target.value })}
                      placeholder="Teléfono (ej: 56912345678) si no pegas el link"
                      disabled={!content.socials.whatsapp?.enabled}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className={adminStyles.panelCard} style={{ marginTop: "1rem" }}>
            <h2>Quiénes somos</h2>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={content.about.enabled}
                onChange={(e) =>
                  setContent((p) => ({ ...p, about: { ...p.about, enabled: e.target.checked } }))
                }
              />
              Mostrar enlace en el menú superior
            </label>
            <p className={adminStyles.muted}>
              El texto se edita aquí y se ve en la página <code>/quienes-somos</code>.
            </p>
            <label className={adminStyles.label} style={{ marginTop: "0.75rem" }}>
              Título
              <input
                className={adminStyles.input}
                value={content.about.title}
                onChange={(e) => setContent((p) => ({ ...p, about: { ...p.about, title: e.target.value } }))}
              />
            </label>
            <label className={adminStyles.label}>
              Texto
              <textarea
                className={adminStyles.input}
                rows={5}
                value={content.about.body}
                onChange={(e) => setContent((p) => ({ ...p, about: { ...p.about, body: e.target.value } }))}
              />
            </label>
          </div>

          <div className={adminStyles.panelCard} style={{ marginTop: "1rem" }}>
            <h2>Eventos</h2>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={content.events.enabled}
                onChange={(e) =>
                  setContent((p) => ({ ...p, events: { ...p.events, enabled: e.target.checked } }))
                }
              />
              Mostrar eventos (recuadro de la portada + página /eventos)
            </label>
            <div className={adminStyles.formGrid} style={{ marginTop: "0.75rem" }}>
              <label className={adminStyles.label}>
                Título
                <input
                  className={adminStyles.input}
                  value={content.events.title}
                  onChange={(e) =>
                    setContent((p) => ({ ...p, events: { ...p.events, title: e.target.value } }))
                  }
                />
              </label>
              <label className={adminStyles.label}>
                Subtítulo
                <input
                  className={adminStyles.input}
                  value={content.events.subtitle}
                  onChange={(e) =>
                    setContent((p) => ({ ...p, events: { ...p.events, subtitle: e.target.value } }))
                  }
                />
              </label>
            </div>

            <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              {content.events.items.map((it, idx) => (
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
                    <strong>Evento #{idx + 1}</strong>
                    <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                        <input
                          type="checkbox"
                          checked={it.active}
                          onChange={(e) => updateEvent(it.id, { active: e.target.checked })}
                        />
                        Activo
                      </label>
                      <button type="button" className={adminStyles.btnDanger} onClick={() => removeEvent(it.id)}>
                        Quitar
                      </button>
                    </div>
                  </div>
                  <div className={adminStyles.formGrid}>
                    <label className={adminStyles.label}>
                      Título
                      <input
                        className={adminStyles.input}
                        value={it.title}
                        onChange={(e) => updateEvent(it.id, { title: e.target.value })}
                      />
                    </label>
                    <label className={adminStyles.label}>
                      Fecha
                      <input
                        className={adminStyles.input}
                        value={it.date_label}
                        onChange={(e) => updateEvent(it.id, { date_label: e.target.value })}
                        placeholder="Ej: Sábado 12 abr · 15:00"
                      />
                    </label>
                    <label className={adminStyles.label}>
                      Lugar
                      <input
                        className={adminStyles.input}
                        value={it.place}
                        onChange={(e) => updateEvent(it.id, { place: e.target.value })}
                      />
                    </label>
                    <label className={adminStyles.label}>
                      Link externo (opcional)
                      <input
                        className={adminStyles.input}
                        value={it.link}
                        onChange={(e) => updateEvent(it.id, { link: e.target.value })}
                        placeholder="https://…"
                      />
                    </label>
                    <label className={adminStyles.label} style={{ gridColumn: "1 / -1" }}>
                      Descripción
                      <textarea
                        className={adminStyles.input}
                        rows={2}
                        value={it.description}
                        onChange={(e) => updateEvent(it.id, { description: e.target.value })}
                      />
                    </label>
                    <label className={adminStyles.label} style={{ gridColumn: "1 / -1" }}>
                      URL imagen (opcional)
                      <input
                        className={adminStyles.input}
                        value={it.image_url}
                        onChange={(e) => updateEvent(it.id, { image_url: e.target.value })}
                      />
                    </label>
                  </div>

                  <div
                    style={{
                      marginTop: "0.85rem",
                      paddingTop: "0.75rem",
                      borderTop: "1px dashed #ccc",
                    }}
                  >
                    <strong style={{ fontSize: "0.9rem" }}>Cupos y pago (solo por la página)</strong>
                    <div className={adminStyles.formGrid} style={{ marginTop: "0.55rem" }}>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(it.registration_enabled)}
                          onChange={(e) => updateEvent(it.id, { registration_enabled: e.target.checked })}
                        />
                        Vender cupos online
                      </label>
                      <label className={adminStyles.label}>
                        Cupos totales
                        <input
                          className={adminStyles.input}
                          value={String(it.capacity ?? 0)}
                          onChange={(e) =>
                            updateEvent(it.id, {
                              capacity: parseInt(e.target.value.replace(/[^\d]/g, "") || "0", 10) || 0,
                            })
                          }
                          placeholder="Ej: 16 (0 = sin límite)"
                        />
                      </label>
                      <label className={adminStyles.label}>
                        Precio cupo ($)
                        <input
                          className={adminStyles.input}
                          value={String(it.price_cents ?? 0)}
                          onChange={(e) =>
                            updateEvent(it.id, {
                              price_cents: parseInt(e.target.value.replace(/[^\d]/g, "") || "0", 10) || 0,
                            })
                          }
                        />
                      </label>
                      <label className={adminStyles.label}>
                        Horas para arrepentirse
                        <input
                          className={adminStyles.input}
                          value={String(it.cancel_hours ?? 0)}
                          onChange={(e) =>
                            updateEvent(it.id, {
                              cancel_hours: parseInt(e.target.value.replace(/[^\d]/g, "") || "0", 10) || 0,
                            })
                          }
                          placeholder="0 = sin ventana / 48 = típico"
                        />
                      </label>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                        <input
                          type="checkbox"
                          checked={it.payment_webpay !== false}
                          onChange={(e) => updateEvent(it.id, { payment_webpay: e.target.checked })}
                        />
                        Pago Webpay
                      </label>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(it.payment_store)}
                          onChange={(e) => updateEvent(it.id, { payment_store: e.target.checked })}
                        />
                        Pago en tienda
                      </label>
                      <label className={adminStyles.label} style={{ gridColumn: "1 / -1" }}>
                        Texto extra en términos (opcional)
                        <textarea
                          className={adminStyles.input}
                          rows={2}
                          value={it.terms_extra || ""}
                          onChange={(e) => updateEvent(it.id, { terms_extra: e.target.value })}
                          placeholder="Reglas extra del torneo…"
                        />
                      </label>
                    </div>
                    <p className={adminStyles.muted} style={{ marginBottom: 0, fontSize: "0.82rem" }}>
                      Si «Horas para arrepentirse» es 0, esa cláusula no se obliga. Si es 48, el cliente tiene 48 h
                      desde la inscripción; después el cupo queda reservado llegue o no.
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className={adminStyles.btn} style={{ marginTop: "0.75rem" }} onClick={addEvent}>
              + Agregar evento
            </button>
          </div>

          <div className={adminStyles.toolbar} style={{ marginTop: "1rem" }}>
            <button type="submit" className={adminStyles.btnPrimary} disabled={saving}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </form>
      ) : null}

      {!loading ? <EventRegistrationsPanel events={content.events.items} /> : null}
    </div>
  );
}

function EventRegistrationsPanel({
  events,
}: {
  events: Array<{ id: number; title: string }>;
}) {
  const [eventId, setEventId] = useState("");
  const [rows, setRows] = useState<
    Array<{
      _id: number;
      event_id: number;
      event_title?: string;
      buyer_name?: string;
      buyer_email?: string;
      payment_method?: string;
      status?: string;
      price_cents?: number;
      cancel_until?: string | null;
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
                <th>Pago</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id}>
                  <td>#{r._id}</td>
                  <td>
                    {r.event_title || `#${r.event_id}`}
                  </td>
                  <td>
                    {r.buyer_name}
                    <div className={adminStyles.muted}>{r.buyer_email}</div>
                  </td>
                  <td>
                    {r.payment_method === "store"
                      ? "Tienda"
                      : r.payment_method === "webpay"
                        ? "Webpay"
                        : r.payment_method || "—"}
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
