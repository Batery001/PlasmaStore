import { FormEvent, useEffect, useState } from "react";
import { parseResponseJson } from "../lib/parseResponseJson";
import adminStyles from "../admin/admin.module.css";

type MailView = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass_masked: string;
  pass_set: boolean;
  from_email: string;
  from_name: string;
  notify_orders_to?: string;
  notify_orders_effective?: string;
  ready: boolean;
  hint_gmail?: string;
};

export function AdminMail() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [host, setHost] = useState("smtp.gmail.com");
  const [port, setPort] = useState("587");
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [passSet, setPassSet] = useState(false);
  const [passMasked, setPassMasked] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("Plasma Store");
  const [notifyOrdersTo, setNotifyOrdersTo] = useState("");
  const [notifyEffective, setNotifyEffective] = useState("");
  const [ready, setReady] = useState(false);
  const [hint, setHint] = useState("");
  const [testTo, setTestTo] = useState("");

  async function reload() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/store/admin/mail", { credentials: "include" });
      const data = await parseResponseJson<{ error?: string; mail?: MailView }>(res);
      if (!res.ok || !data.mail) throw new Error(data.error || "No se pudo cargar.");
      const m = data.mail;
      setEnabled(Boolean(m.enabled));
      setHost(m.host || "smtp.gmail.com");
      setPort(String(m.port || 587));
      setSecure(Boolean(m.secure));
      setUser(m.user || "");
      setPass("");
      setPassSet(Boolean(m.pass_set));
      setPassMasked(m.pass_masked || "");
      setFromEmail(m.from_email || "");
      setFromName(m.from_name || "Plasma Store");
      setNotifyOrdersTo(m.notify_orders_to || "");
      setNotifyEffective(m.notify_orders_effective || "");
      setReady(Boolean(m.ready));
      setHint(m.hint_gmail || "");
      if (!testTo && (m.notify_orders_effective || m.user)) setTestTo(m.notify_orders_effective || m.user);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload().catch(() => {
      /* handled */
    });
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        enabled,
        host: host.trim(),
        port: parseInt(port, 10) || 587,
        secure,
        user: user.trim(),
        from_email: fromEmail.trim(),
        from_name: fromName.trim(),
        notify_orders_to: notifyOrdersTo.trim(),
      };
      if (pass.trim()) body.pass = pass.trim();
      const res = await fetch("/api/store/admin/mail", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await parseResponseJson<{ error?: string; message?: string; mail?: MailView }>(res);
      if (!res.ok) throw new Error(data.error || "No se pudo guardar.");
      setMsg(data.message || "Guardado.");
      setPass("");
      if (data.mail) {
        setReady(Boolean(data.mail.ready));
        setPassSet(Boolean(data.mail.pass_set));
        setPassMasked(data.mail.pass_masked || "");
        setNotifyOrdersTo(data.mail.notify_orders_to || "");
        setNotifyEffective(data.mail.notify_orders_effective || "");
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setErr(null);
    setMsg(null);
    setSaving(true);
    try {
      const res = await fetch("/api/store/admin/mail/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testTo.trim() }),
      });
      const data = await parseResponseJson<{ error?: string; message?: string }>(res);
      if (!res.ok) throw new Error(data.error || "Falló el envío de prueba.");
      setMsg(data.message || "Enviado.");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className={adminStyles.pageTitle}>Correo (SMTP)</h1>
      <p className={adminStyles.muted}>
        Configura el Gmail u otro correo de la tienda para enviar verificaciones, recuperación de contraseña,
        comprobantes al comprador y avisos de nuevas ventas a ti.
      </p>
      {loading ? <p className={adminStyles.muted}>Cargando…</p> : null}
      {err ? <p className={adminStyles.error}>{err}</p> : null}
      {msg ? <p className={adminStyles.banner}>{msg}</p> : null}

      {!loading ? (
        <form className={adminStyles.panelCard} onSubmit={onSave}>
          <div
            className={adminStyles.banner}
            style={{
              background: ready ? "rgba(34, 197, 94, 0.12)" : "rgba(234, 179, 8, 0.12)",
              borderColor: ready ? "rgba(34, 197, 94, 0.35)" : "rgba(234, 179, 8, 0.35)",
            }}
          >
            {ready ? "SMTP listo para enviar." : "Completa host, usuario, contraseña y activa el envío."}
          </div>
          <p className={adminStyles.muted} style={{ marginTop: "0.5rem" }}>
            Si las compras no llegan por correo, casi siempre es porque Gmail rechaza la contraseña. Debe ser una{" "}
            <strong>contraseña de aplicaciones</strong> (16 caracteres), no la clave normal. Prueba el envío abajo
            antes de esperar un comprobante de compra.
          </p>
          {hint ? <p className={adminStyles.muted}>{hint}</p> : null}

          <label className={adminStyles.label} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Activar envío de correos
          </label>

          <div className={adminStyles.formGrid} style={{ marginTop: "0.75rem" }}>
            <label className={adminStyles.label}>
              Host SMTP
              <input className={adminStyles.input} value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.gmail.com" />
            </label>
            <label className={adminStyles.label}>
              Puerto
              <input className={adminStyles.input} value={port} onChange={(e) => setPort(e.target.value)} placeholder="587" />
            </label>
            <label className={adminStyles.label}>
              Usuario (email)
              <input className={adminStyles.input} value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" />
            </label>
            <label className={adminStyles.label}>
              Contraseña / app password
              <input
                className={adminStyles.input}
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder={passSet ? `Guardada: ${passMasked}` : "Contraseña de aplicación"}
                autoComplete="new-password"
              />
            </label>
            <label className={adminStyles.label}>
              Remitente (From)
              <input className={adminStyles.input} value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} />
            </label>
            <label className={adminStyles.label}>
              Nombre remitente
              <input className={adminStyles.input} value={fromName} onChange={(e) => setFromName(e.target.value)} />
            </label>
            <label className={adminStyles.label} style={{ gridColumn: "1 / -1" }}>
              Aviso de nuevas compras (a ti)
              <input
                className={adminStyles.input}
                value={notifyOrdersTo}
                onChange={(e) => setNotifyOrdersTo(e.target.value)}
                type="email"
                placeholder={notifyEffective || fromEmail || user || "tu@email.com"}
              />
              <span className={adminStyles.muted} style={{ display: "block", marginTop: "0.35rem", fontWeight: 400 }}>
                {notifyEffective
                  ? `Los avisos de venta llegan a: ${notifyEffective}${notifyOrdersTo.trim() ? "" : " (remitente / usuario SMTP)"}.`
                  : "Indica un email o deja vacío para usar el remitente / usuario SMTP."}
              </span>
            </label>
          </div>

          <label className={adminStyles.label} style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} />
            Conexión segura (SSL puerto 465). En Gmail suele bastar 587 sin esto.
          </label>

          <div className={adminStyles.modalActions} style={{ borderTop: "none", paddingTop: "1rem" }}>
            <button type="button" className={adminStyles.btn} onClick={() => reload()} disabled={saving}>
              Recargar
            </button>
            <button type="submit" className={adminStyles.btnPrimary} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>

          <div style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid #eee" }}>
            <div className={adminStyles.subTitle}>Probar envío</div>
            <label className={adminStyles.label}>
              Enviar a
              <input className={adminStyles.input} value={testTo} onChange={(e) => setTestTo(e.target.value)} type="email" />
            </label>
            <button type="button" className={adminStyles.btn} style={{ marginTop: "0.5rem" }} disabled={saving} onClick={() => void sendTest()}>
              Enviar correo de prueba
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
