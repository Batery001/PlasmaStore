import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatCLP } from "../lib/money";
import { resolveStoreMediaUrl } from "../lib/media";
import { parseResponseJson } from "../lib/parseResponseJson";
import styles from "./pages.module.css";

type EventItem = {
  id: number;
  title: string;
  date_label?: string;
  place?: string;
  description?: string;
  image_url?: string;
  link?: string;
  registration_enabled?: boolean;
  capacity?: number;
  price_cents?: number;
  payment_webpay?: boolean;
  payment_store?: boolean;
  cancel_hours?: number;
  terms_text?: string;
  remaining?: number | null;
  sold_out?: boolean;
  taken?: number;
};

type EventsBlock = {
  enabled?: boolean;
  title?: string;
  subtitle?: string;
  items?: EventItem[];
};

export function EventsPage() {
  const [events, setEvents] = useState<EventsBlock | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"webpay" | "store">("webpay");
  const [termsOk, setTermsOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function reload() {
    const r = await fetch("/api/store/site-content");
    const j = await parseResponseJson<{ ok?: boolean; content?: { events?: EventsBlock }; error?: string }>(r);
    if (!r.ok || !j?.ok) throw new Error(j?.error || "No se pudo cargar.");
    setEvents(j.content?.events || null);
  }

  useEffect(() => {
    let alive = true;
    reload()
      .catch((e) => {
        if (alive) setErr(e instanceof Error ? e.message : "Error");
      });
    return () => {
      alive = false;
    };
  }, []);

  const items = (events?.items || []).filter((it) => it.title);
  const selected = items.find((it) => it.id === selectedId) || null;

  useEffect(() => {
    if (!selected) return;
    if (selected.payment_webpay !== false) setPaymentMethod("webpay");
    else if (selected.payment_store) setPaymentMethod("store");
    setTermsOk(false);
    setMsg(null);
  }, [selectedId]);

  async function onRegister(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/store/events/${selected.id}/register`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          payment_method: paymentMethod,
          terms_accepted: termsOk,
        }),
      });
      const data = await parseResponseJson<{
        ok?: boolean;
        error?: string;
        message?: string;
        webpay?: { url?: string; token?: string };
      }>(res);
      if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo inscribir.");
      if (data.webpay?.url) {
        window.location.href = data.webpay.url;
        return;
      }
      setMsg(data.message || "Inscripción registrada.");
      setSelectedId(null);
      await reload();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.narrow} style={{ maxWidth: 560 }}>
      <h1 className={styles.pageTitle}>{events?.title || "Eventos"}</h1>
      <p className={styles.muted}>{events?.subtitle || "Torneos, lanzamientos y encuentros."}</p>
      {err ? <p className={styles.error}>{err}</p> : null}
      {msg ? <p className={styles.banner}>{msg}</p> : null}
      {!events && !err ? <p className={styles.muted}>Cargando…</p> : null}

      {events && !events.enabled ? (
        <p className={styles.muted}>
          Los eventos están desactivados por ahora. <Link to="/">Volver al inicio</Link>
        </p>
      ) : null}

      {events?.enabled && items.length === 0 ? (
        <p className={styles.muted}>Pronto publicaremos los próximos eventos.</p>
      ) : null}

      {events?.enabled && items.length > 0 ? (
        <ul className={styles.cartList} style={{ marginTop: "1rem" }}>
          {items.map((it) => {
            const img = resolveStoreMediaUrl(it.image_url);
            const cups =
              typeof it.remaining === "number"
                ? `${it.remaining} cupo${it.remaining === 1 ? "" : "s"}`
                : it.capacity
                  ? `${it.capacity} cupos`
                  : null;
            return (
              <li key={it.id} className={styles.cartRow} style={{ gridTemplateColumns: "1fr", alignItems: "start" }}>
                <div style={{ display: "flex", gap: "0.75rem", width: "100%" }}>
                  {img ? (
                    <img
                      src={img}
                      alt=""
                      style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8 }}
                      loading="lazy"
                    />
                  ) : null}
                  <div style={{ flex: 1 }}>
                    <strong>{it.title}</strong>
                    <div className={styles.muted}>
                      {[it.date_label, it.place].filter(Boolean).join(" · ")}
                    </div>
                    {it.description ? <p style={{ margin: "0.35rem 0 0" }}>{it.description}</p> : null}
                    <div className={styles.muted} style={{ marginTop: "0.35rem" }}>
                      {it.registration_enabled ? (
                        <>
                          {typeof it.price_cents === "number" ? formatCLP(it.price_cents) : null}
                          {cups ? ` · ${it.sold_out ? "Agotado" : cups}` : null}
                        </>
                      ) : (
                        "Solo informativo"
                      )}
                    </div>
                    {it.registration_enabled ? (
                      <button
                        type="button"
                        className={styles.btnPrimary}
                        style={{ marginTop: "0.55rem" }}
                        disabled={Boolean(it.sold_out)}
                        onClick={() => setSelectedId(it.id)}
                      >
                        {it.sold_out ? "Sin cupos" : "Comprar cupo"}
                      </button>
                    ) : it.link ? (
                      <a href={it.link} target="_blank" rel="noreferrer" className={styles.linkbtn}>
                        Más info
                      </a>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {selected ? (
        <div className={styles.formCard} style={{ marginTop: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center" }}>
            <h2 className={styles.subTitle} style={{ margin: 0 }}>
              Cupo · {selected.title}
            </h2>
            <button type="button" className={styles.linkbtn} onClick={() => setSelectedId(null)}>
              Cerrar
            </button>
          </div>
          <p className={styles.muted} style={{ marginTop: "0.35rem" }}>
            {formatCLP(selected.price_cents || 0)}
            {typeof selected.remaining === "number" ? ` · quedan ${selected.remaining}` : null}
          </p>

          <form className={styles.form} onSubmit={(e) => void onRegister(e)}>
            <label className={styles.label}>
              Nombre
              <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className={styles.label}>
              Email
              <input
                className={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className={styles.label}>
              Teléfono (opcional)
              <input className={styles.input} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>

            <fieldset style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "0.75rem" }}>
              <legend style={{ padding: "0 0.35rem" }}>Método de pago</legend>
              {selected.payment_webpay !== false ? (
                <label style={{ display: "flex", gap: "0.45rem", alignItems: "center", marginBottom: "0.4rem" }}>
                  <input
                    type="radio"
                    name="pay"
                    checked={paymentMethod === "webpay"}
                    onChange={() => setPaymentMethod("webpay")}
                  />
                  Webpay (pago online)
                </label>
              ) : null}
              {selected.payment_store ? (
                <label style={{ display: "flex", gap: "0.45rem", alignItems: "center" }}>
                  <input
                    type="radio"
                    name="pay"
                    checked={paymentMethod === "store"}
                    onChange={() => setPaymentMethod("store")}
                  />
                  Pago en tienda
                </label>
              ) : null}
            </fieldset>

            <div
              style={{
                maxHeight: 160,
                overflow: "auto",
                padding: "0.75rem",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--card)",
                whiteSpace: "pre-wrap",
                fontSize: "0.88rem",
                color: "var(--muted)",
              }}
            >
              {selected.terms_text || "Términos del cupo."}
            </div>

            <label style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
              <input type="checkbox" checked={termsOk} onChange={(e) => setTermsOk(e.target.checked)} required />
              <span>Acepto los términos y condiciones de la compra del cupo.</span>
            </label>

            <button className={styles.btnPrimary} type="submit" disabled={busy || !termsOk}>
              {busy
                ? "Procesando…"
                : paymentMethod === "webpay" && (selected.price_cents || 0) > 0
                  ? "Pagar e inscribirme"
                  : "Reservar cupo"}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
