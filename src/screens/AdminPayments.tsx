import { FormEvent, useEffect, useState } from "react";
import { parseResponseJson } from "../lib/parseResponseJson";
import adminStyles from "../admin/admin.module.css";

type PaymentsView = {
  public_base_url: string;
  tuu_enabled?: boolean;
  tuu_mode?: "integration" | "production";
  tuu_account_id?: string;
  tuu_secret_masked?: string;
  tuu_secret_set?: boolean;
  tuu_ready_for_live?: boolean;
};

export function AdminPayments() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [publicBaseUrl, setPublicBaseUrl] = useState("");
  const [tuuEnabled, setTuuEnabled] = useState(true);
  const [tuuMode, setTuuMode] = useState<"integration" | "production">("integration");
  const [tuuAccountId, setTuuAccountId] = useState("");
  const [tuuSecret, setTuuSecret] = useState("");
  const [tuuSecretSet, setTuuSecretSet] = useState(false);
  const [tuuSecretMasked, setTuuSecretMasked] = useState("");
  const [tuuReady, setTuuReady] = useState(false);

  function applyPayments(p: PaymentsView) {
    setPublicBaseUrl(p.public_base_url || "");
    setTuuEnabled(p.tuu_enabled !== false);
    setTuuMode(p.tuu_mode === "production" ? "production" : "integration");
    setTuuAccountId(p.tuu_account_id || "");
    setTuuSecret("");
    setTuuSecretSet(Boolean(p.tuu_secret_set));
    setTuuSecretMasked(p.tuu_secret_masked || "");
    setTuuReady(Boolean(p.tuu_ready_for_live));
  }

  async function reload() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/store/admin/payments", { credentials: "include" });
      const data = await parseResponseJson<{ error?: string; payments?: PaymentsView }>(res);
      if (!res.ok || !data.payments) throw new Error(data.error || "No se pudo cargar la config.");
      applyPayments(data.payments);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al cargar.");
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
      const body: Record<string, string | boolean> = {
        public_base_url: publicBaseUrl.trim(),
        tuu_enabled: tuuEnabled,
        tuu_mode: tuuMode,
        tuu_account_id: tuuAccountId.trim(),
      };
      if (tuuSecret.trim()) body.tuu_secret = tuuSecret.trim();

      const res = await fetch("/api/store/admin/payments", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await parseResponseJson<{ error?: string; message?: string; payments?: PaymentsView }>(res);
      if (!res.ok) throw new Error(data.error || "No se pudo guardar.");
      setMsg(data.message || "Guardado.");
      if (data.payments) applyPayments(data.payments);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Error al guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className={adminStyles.pageTitle}>Sistema de pago</h1>
      <p className={adminStyles.muted}>
        El checkout cobra solo con TUU Pago Online. El secret real se pega cuando TUU te lo entregue.
      </p>

      {loading ? <p className={adminStyles.muted}>Cargando…</p> : null}
      {err ? <p className={adminStyles.error}>{err}</p> : null}
      {msg ? <p className={adminStyles.banner}>{msg}</p> : null}

      {!loading ? (
        <form className={adminStyles.panelCard} onSubmit={onSave}>
          <div
            className={adminStyles.banner}
            style={{
              background: tuuReady ? "rgba(34, 197, 94, 0.12)" : "rgba(59, 130, 246, 0.12)",
              borderColor: tuuReady ? "rgba(34, 197, 94, 0.35)" : "rgba(59, 130, 246, 0.35)",
            }}
          >
            {tuuReady
              ? "TUU listo en producción: account_id + secret reales + HTTPS."
              : "Para cobrar de verdad: modo Producción + account_id/secret de Pago Online (no la API Key del Workspace) + URL https://plasmastoretcg.cl. Si usás claves reales con modo Integración, TUU muestra «cuenta/llave no coinciden»."}
          </div>

          <label className={adminStyles.label} style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input type="checkbox" checked={tuuEnabled} onChange={(e) => setTuuEnabled(e.target.checked)} />
            <span>Habilitar el botón Pagar (TUU) en el checkout</span>
          </label>

          <label className={adminStyles.label} style={{ marginTop: "0.75rem" }}>
            URL pública del sitio
            <input
              className={adminStyles.input}
              value={publicBaseUrl}
              onChange={(e) => setPublicBaseUrl(e.target.value)}
              placeholder="https://plasmastoretcg.cl"
              autoComplete="off"
            />
            <span className={adminStyles.muted} style={{ display: "block", marginTop: "0.25rem" }}>
              URL con la que TUU vuelve del pago. En local: <code>http://localhost:3000</code>
            </span>
          </label>

          <label className={adminStyles.label} style={{ marginTop: "0.75rem" }}>
            Modo TUU
            <select
              className={adminStyles.input}
              value={tuuMode}
              onChange={(e) => setTuuMode(e.target.value === "production" ? "production" : "integration")}
            >
              <option value="integration">Integración / pruebas TUU</option>
              <option value="production">Producción (account_id y secret reales)</option>
            </select>
          </label>

          <div className={adminStyles.formGrid} style={{ marginTop: "0.75rem" }}>
            <label className={adminStyles.label}>
              Account ID / RUT comercio TUU
              <input
                className={adminStyles.input}
                value={tuuAccountId}
                onChange={(e) => setTuuAccountId(e.target.value)}
                placeholder="Lo entrega TUU al habilitar Pago Online"
                autoComplete="off"
              />
            </label>
            <label className={adminStyles.label}>
              Clave secreta TUU
              <input
                className={adminStyles.input}
                type="password"
                value={tuuSecret}
                onChange={(e) => setTuuSecret(e.target.value)}
                placeholder={tuuSecretSet ? `Guardada: ${tuuSecretMasked}` : "Secret alfanumérico de TUU"}
                autoComplete="new-password"
              />
              <span className={adminStyles.muted} style={{ display: "block", marginTop: "0.25rem" }}>
                En integración, si dejas vacío, se usan las claves de prueba públicas de TUU.
              </span>
            </label>
          </div>

          <div style={{ marginTop: "1rem" }}>
            <div className={adminStyles.subTitle} style={{ marginBottom: "0.35rem" }}>
              Checklist para salir a producción
            </div>
            <ul className={adminStyles.muted} style={{ margin: 0, paddingLeft: "1.2rem", lineHeight: 1.6 }}>
              <li>URL pública HTTPS del sitio (https://plasmastoretcg.cl)</li>
              <li>TUU en modo Producción con account_id y secret reales</li>
              <li>Probar un pago de bajo monto y confirmar el retorno a /tuu/return</li>
            </ul>
          </div>

          <div className={adminStyles.modalActions} style={{ borderTop: "none", paddingTop: "1rem" }}>
            <button type="button" className={adminStyles.btn} onClick={() => reload()} disabled={saving}>
              Recargar
            </button>
            <button type="submit" className={adminStyles.btnPrimary} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
