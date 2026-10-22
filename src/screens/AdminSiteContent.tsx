import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
        body: JSON.stringify({
          singles_enabled: content.singles_enabled,
          socials: content.socials,
          about: content.about,
          home_cards: content.home_cards,
        }),
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
        Activa o desactiva redes sociales, el enlace «Quiénes somos» del menú y las fotos de la portada. Los
        eventos se crean en <Link to="/admin/eventos">Eventos</Link>.
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

          <div className={adminStyles.toolbar} style={{ marginTop: "1rem" }}>
            <button type="submit" className={adminStyles.btnPrimary} disabled={saving}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </form>
      ) : null}

    </div>
  );
}
