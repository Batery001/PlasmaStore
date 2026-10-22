import { FormEvent, useEffect, useState } from "react";
import adminStyles from "../admin/admin.module.css";
import { parseResponseJson } from "../lib/parseResponseJson";

type Ops = {
  require_email_verified: boolean;
  min_age: number;
  smtp_required_on_register: boolean;
  company_name: string;
  company_rut: string;
  company_address: string;
  company_giro: string;
};

export function AdminOps() {
  const [ops, setOps] = useState<Ops | null>(null);
  const [dbDriver, setDbDriver] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [totpEnabled, setTotpEnabled] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [disablePass, setDisablePass] = useState("");
  const [disableCode, setDisableCode] = useState("");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [opsRes, tfaRes] = await Promise.all([
        fetch("/api/store/admin/ops", { credentials: "include" }),
        fetch("/api/store/admin/2fa", { credentials: "include" }),
      ]);
      const opsData = await parseResponseJson<{ ok?: boolean; ops?: Ops; db_driver?: string; error?: string }>(opsRes);
      const tfaData = await parseResponseJson<{ ok?: boolean; enabled?: boolean; error?: string }>(tfaRes);
      if (!opsRes.ok || !opsData.ops) throw new Error(opsData.error || "No se pudo cargar.");
      setOps(opsData.ops);
      setDbDriver(opsData.db_driver || "");
      setTotpEnabled(Boolean(tfaData.enabled));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveOps(e: FormEvent) {
    e.preventDefault();
    if (!ops) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/store/admin/ops", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ops),
      });
      const data = await parseResponseJson<{ ok?: boolean; ops?: Ops; error?: string; message?: string }>(res);
      if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo guardar.");
      if (data.ops) setOps(data.ops);
      setMsg(data.message || "Guardado.");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function setup2fa() {
    setErr(null);
    setMsg(null);
    const res = await fetch("/api/store/admin/2fa/setup", { method: "POST", credentials: "include" });
    const data = await parseResponseJson<{ ok?: boolean; secret?: string; qr_url?: string; error?: string }>(res);
    if (!res.ok || !data.ok) {
      setErr(data.error || "No se pudo iniciar 2FA.");
      return;
    }
    setSecret(data.secret || null);
    setQrUrl(data.qr_url || null);
  }

  async function enable2fa(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const res = await fetch("/api/store/admin/2fa/enable", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await parseResponseJson<{ ok?: boolean; error?: string; message?: string }>(res);
    if (!res.ok || !data.ok) {
      setErr(data.error || "Código inválido.");
      return;
    }
    setTotpEnabled(true);
    setQrUrl(null);
    setSecret(null);
    setCode("");
    setMsg(data.message || "2FA activado.");
  }

  async function disable2fa(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const res = await fetch("/api/store/admin/2fa/disable", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: disablePass, code: disableCode }),
    });
    const data = await parseResponseJson<{ ok?: boolean; error?: string; message?: string }>(res);
    if (!res.ok || !data.ok) {
      setErr(data.error || "No se pudo desactivar.");
      return;
    }
    setTotpEnabled(false);
    setDisablePass("");
    setDisableCode("");
    setMsg(data.message || "2FA desactivado.");
  }

  if (loading || !ops) {
    return <p className={adminStyles.muted}>{err || "Cargando…"}</p>;
  }

  return (
    <div>
      <h1 className={adminStyles.pageTitle}>Operación y seguridad</h1>
      {msg ? <p className={adminStyles.banner}>{msg}</p> : null}
      {err ? <p className={adminStyles.error}>{err}</p> : null}

      <form className={adminStyles.panelCard} onSubmit={(e) => void saveOps(e)}>
        <h2>Checkout y cuenta</h2>
        <label className={adminStyles.label} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={ops.require_email_verified}
            onChange={(e) => setOps({ ...ops, require_email_verified: e.target.checked })}
          />
          Exigir email verificado para comprar (usuarios logueados)
        </label>
        <label className={adminStyles.label} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={ops.smtp_required_on_register}
            onChange={(e) => setOps({ ...ops, smtp_required_on_register: e.target.checked })}
          />
          SMTP obligatorio al registrarse (si falla el mail, no crea la cuenta)
        </label>
        <label className={adminStyles.label}>
          Edad mínima
          <input
            className={adminStyles.input}
            type="number"
            min={0}
            max={99}
            value={ops.min_age}
            onChange={(e) => setOps({ ...ops, min_age: parseInt(e.target.value, 10) || 0 })}
          />
        </label>

        <h2 style={{ marginTop: "1.25rem" }}>Datos emisor (boleta de venta)</h2>
        <p className={adminStyles.muted}>
          Misma boleta informativa que el POS (comprobante de venta). No es DTE/SII.
        </p>
        <label className={adminStyles.label}>
          Razón social / nombre
          <input
            className={adminStyles.input}
            value={ops.company_name}
            onChange={(e) => setOps({ ...ops, company_name: e.target.value })}
          />
        </label>
        <label className={adminStyles.label}>
          RUT empresa
          <input
            className={adminStyles.input}
            value={ops.company_rut}
            onChange={(e) => setOps({ ...ops, company_rut: e.target.value })}
            placeholder="76.XXX.XXX-X"
          />
        </label>
        <label className={adminStyles.label}>
          Giro
          <input
            className={adminStyles.input}
            value={ops.company_giro}
            onChange={(e) => setOps({ ...ops, company_giro: e.target.value })}
          />
        </label>
        <label className={adminStyles.label}>
          Dirección
          <input
            className={adminStyles.input}
            value={ops.company_address}
            onChange={(e) => setOps({ ...ops, company_address: e.target.value })}
          />
        </label>
        <button type="submit" className={adminStyles.btnPrimary} disabled={saving}>
          {saving ? "Guardando…" : "Guardar ajustes"}
        </button>
      </form>

      <div className={adminStyles.panelCard} style={{ marginTop: "1rem" }}>
        <h2>Respaldo</h2>
        <p className={adminStyles.muted}>Driver actual: {dbDriver || "—"}</p>
        <a className={adminStyles.btnPrimary} href="/api/store/admin/backup" style={{ display: "inline-block" }}>
          Descargar backup
        </a>
      </div>

      <div className={adminStyles.panelCard} style={{ marginTop: "1rem" }}>
        <h2>2FA administrador</h2>
        <p className={adminStyles.muted}>
          Estado: {totpEnabled ? "activado" : "desactivado"}. Usa Google Authenticator u otro TOTP.
        </p>
        {!totpEnabled ? (
          <>
            <button type="button" className={adminStyles.btn} onClick={() => void setup2fa()}>
              Generar QR
            </button>
            {qrUrl ? (
              <div style={{ marginTop: "0.75rem" }}>
                <img src={qrUrl} alt="QR 2FA" width={180} height={180} />
                {secret ? <p className={adminStyles.muted}>Secret: {secret}</p> : null}
                <form onSubmit={(e) => void enable2fa(e)} style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem" }}>
                  <input
                    className={adminStyles.input}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Código 6 dígitos"
                    required
                  />
                  <button type="submit" className={adminStyles.btnPrimary}>
                    Activar
                  </button>
                </form>
              </div>
            ) : null}
          </>
        ) : (
          <form onSubmit={(e) => void disable2fa(e)} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 360 }}>
            <input
              className={adminStyles.input}
              type="password"
              value={disablePass}
              onChange={(e) => setDisablePass(e.target.value)}
              placeholder="Contraseña admin"
              required
            />
            <input
              className={adminStyles.input}
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              placeholder="Código 2FA"
              required
            />
            <button type="submit" className={adminStyles.btnDanger}>
              Desactivar 2FA
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
