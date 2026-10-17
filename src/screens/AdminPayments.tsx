import { FormEvent, useEffect, useState } from "react";
import { parseResponseJson } from "../lib/parseResponseJson";
import adminStyles from "../admin/admin.module.css";

type PaymentsView = {
  mode: "mock" | "integration" | "production";
  commerce_code: string;
  api_key_masked: string;
  api_key_set: boolean;
  public_base_url: string;
  ready_for_live: boolean;
  tuu_enabled?: boolean;
  tuu_mode?: "integration" | "production";
  tuu_account_id?: string;
  tuu_secret_masked?: string;
  tuu_secret_set?: boolean;
  tuu_ready_for_live?: boolean;
  source?: string;
  checklist?: {
    mode_set: boolean;
    commerce_code: boolean;
    api_key: boolean;
    public_base_url: boolean;
  };
};

export function AdminPayments() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<"mock" | "integration" | "production">("mock");
  const [commerceCode, setCommerceCode] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiKeySet, setApiKeySet] = useState(false);
  const [apiKeyMasked, setApiKeyMasked] = useState("");
  const [publicBaseUrl, setPublicBaseUrl] = useState("");
  const [ready, setReady] = useState(false);
  const [tuuEnabled, setTuuEnabled] = useState(true);
  const [tuuMode, setTuuMode] = useState<"integration" | "production">("integration");
  const [tuuAccountId, setTuuAccountId] = useState("");
  const [tuuSecret, setTuuSecret] = useState("");
  const [tuuSecretSet, setTuuSecretSet] = useState(false);
  const [tuuSecretMasked, setTuuSecretMasked] = useState("");
  const [tuuReady, setTuuReady] = useState(false);

  async function reload() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/store/admin/payments", { credentials: "include" });
      const data = await parseResponseJson<{ error?: string; payments?: PaymentsView }>(res);
      if (!res.ok || !data.payments) throw new Error(data.error || "No se pudo cargar la config.");
      const p = data.payments;
      setMode(p.mode === "production" || p.mode === "integration" ? p.mode : "mock");
      setCommerceCode(p.commerce_code || "");
      setApiKey("");
      setApiKeySet(Boolean(p.api_key_set));
      setApiKeyMasked(p.api_key_masked || "");
      setPublicBaseUrl(p.public_base_url || "");
      setReady(Boolean(p.ready_for_live));
      setTuuEnabled(p.tuu_enabled !== false);
      setTuuMode(p.tuu_mode === "production" ? "production" : "integration");
      setTuuAccountId(p.tuu_account_id || "");
      setTuuSecret("");
      setTuuSecretSet(Boolean(p.tuu_secret_set));
      setTuuSecretMasked(p.tuu_secret_masked || "");
      setTuuReady(Boolean(p.tuu_ready_for_live));
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
        mode,
        commerce_code: commerceCode.trim(),
        public_base_url: publicBaseUrl.trim(),
        tuu_enabled: tuuEnabled,
        tuu_mode: tuuMode,
        tuu_account_id: tuuAccountId.trim(),
      };
      if (apiKey.trim()) body.api_key = apiKey.trim();
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
      if (data.payments) {
        setMode(data.payments.mode === "production" || data.payments.mode === "integration" ? data.payments.mode : "mock");
        setCommerceCode(data.payments.commerce_code || "");
        setApiKey("");
        setApiKeySet(Boolean(data.payments.api_key_set));
        setApiKeyMasked(data.payments.api_key_masked || "");
        setPublicBaseUrl(data.payments.public_base_url || "");
        setReady(Boolean(data.payments.ready_for_live));
        setTuuEnabled(data.payments.tuu_enabled !== false);
        setTuuMode(data.payments.tuu_mode === "production" ? "production" : "integration");
        setTuuAccountId(data.payments.tuu_account_id || "");
        setTuuSecret("");
        setTuuSecretSet(Boolean(data.payments.tuu_secret_set));
        setTuuSecretMasked(data.payments.tuu_secret_masked || "");
        setTuuReady(Boolean(data.payments.tuu_ready_for_live));
      }
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
        Webpay Plus (Transbank) y TUU Pago Online. TUU se puede probar ahora con el ambiente de integración; el secret real se pega cuando TUU te lo entregue.
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
            {ready
              ? "Listo para cobrar en vivo: modo producción + código + API Key."
              : "Aún no está listo para producción. Completa los datos abajo cuando Transbank te entregue las claves."}
          </div>

          <label className={adminStyles.label}>
            Modo
            <select
              className={adminStyles.input}
              value={mode}
              onChange={(e) => {
                const v = e.target.value;
                setMode(v === "production" ? "production" : v === "integration" ? "integration" : "mock");
              }}
            >
              <option value="mock">Simulación (local, sin Transbank)</option>
              <option value="integration">Integración / pruebas Transbank</option>
              <option value="production">Producción (claves reales)</option>
            </select>
          </label>

          <div className={adminStyles.formGrid} style={{ marginTop: "0.75rem" }}>
            <label className={adminStyles.label}>
              Código de comercio
              <input
                className={adminStyles.input}
                value={commerceCode}
                onChange={(e) => setCommerceCode(e.target.value)}
                placeholder="Ej. 5970XXXXXXXX"
                autoComplete="off"
                disabled={mode !== "production"}
              />
              <span className={adminStyles.muted} style={{ display: "block", marginTop: "0.25rem" }}>
                Obligatorio en producción. En integración se usan las claves de prueba de Transbank.
              </span>
            </label>

            <label className={adminStyles.label}>
              API Key (clave secreta)
              <input
                className={adminStyles.input}
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={apiKeySet ? `Guardada: ${apiKeyMasked}` : "Pega tu API Key de Transbank"}
                autoComplete="new-password"
                disabled={mode !== "production"}
              />
              <span className={adminStyles.muted} style={{ display: "block", marginTop: "0.25rem" }}>
                Déjala vacía al guardar si no quieres cambiar la clave ya guardada.
              </span>
            </label>
          </div>

          <label className={adminStyles.label} style={{ marginTop: "0.75rem" }}>
            URL pública del sitio
            <input
              className={adminStyles.input}
              value={publicBaseUrl}
              onChange={(e) => setPublicBaseUrl(e.target.value)}
              placeholder="https://tudominio.cl"
              autoComplete="off"
            />
            <span className={adminStyles.muted} style={{ display: "block", marginTop: "0.25rem" }}>
              Debe ser la URL real con la que Transbank vuelve del pago (importante en producción). En local:{" "}
              <code>http://localhost:3000</code>
            </span>
          </label>

          <div
            className={adminStyles.banner}
            style={{
              marginTop: "1.25rem",
              background: tuuReady ? "rgba(34, 197, 94, 0.12)" : "rgba(59, 130, 246, 0.12)",
              borderColor: tuuReady ? "rgba(34, 197, 94, 0.35)" : "rgba(59, 130, 246, 0.35)",
            }}
          >
            {tuuReady
              ? "TUU listo en producción: account_id + secret reales."
              : "TUU en pruebas usa las credenciales de integración de Haulmer. Pedí a TUU el account_id y el secret para cobrar de verdad."}
          </div>

          <label className={adminStyles.label} style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input type="checkbox" checked={tuuEnabled} onChange={(e) => setTuuEnabled(e.target.checked)} />
            <span>Mostrar «Pagar con TUU» en el carrito</span>
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
              <li>Cuenta comercio Webpay Plus en Transbank</li>
              <li>Código de comercio + API Key de producción</li>
              <li>URL pública HTTPS del sitio</li>
              <li>Modo = Producción y Guardar</li>
              <li>Probar un pago real de bajo monto y confirmar retorno a /webpay/return</li>
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
