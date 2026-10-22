import { FormEvent, useEffect, useState } from "react";
import { parseResponseJson } from "../lib/parseResponseJson";
import adminStyles from "../admin/admin.module.css";

type ShippingView = {
  shipping_fee_cents: number;
  shipping_note: string;
  pickup_address: string;
  charge_shipping_online: boolean;
};

export function AdminShipping() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [chargeOnline, setChargeOnline] = useState(false);
  const [feePesos, setFeePesos] = useState("0");
  const [note, setNote] = useState("");
  const [pickup, setPickup] = useState("");

  async function reload() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/store/admin/shipping", { credentials: "include" });
      const data = await parseResponseJson<{ error?: string; shipping?: ShippingView }>(res);
      if (!res.ok || !data.shipping) throw new Error(data.error || "No se pudo cargar la config.");
      const s = data.shipping;
      setChargeOnline(Boolean(s.charge_shipping_online));
      setFeePesos(String(Math.max(0, Math.floor(Number(s.shipping_fee_cents) || 0))));
      setNote(s.shipping_note || "");
      setPickup(s.pickup_address || "");
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
      const fee = Math.max(0, parseInt(String(feePesos || "").replace(/[^\d]/g, "") || "0", 10) || 0);
      const res = await fetch("/api/store/admin/shipping", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          charge_shipping_online: chargeOnline,
          shipping_fee_cents: fee,
          shipping_note: note.trim(),
          pickup_address: pickup.trim(),
        }),
      });
      const data = await parseResponseJson<{ error?: string; message?: string; shipping?: ShippingView }>(res);
      if (!res.ok) throw new Error(data.error || "No se pudo guardar.");
      setMsg(data.message || "Guardado.");
      if (data.shipping) {
        setChargeOnline(Boolean(data.shipping.charge_shipping_online));
        setFeePesos(String(Math.max(0, Math.floor(Number(data.shipping.shipping_fee_cents) || 0))));
        setNote(data.shipping.shipping_note || "");
        setPickup(data.shipping.pickup_address || "");
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Error al guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className={adminStyles.pageTitle}>Envío / retiro</h1>
      <p className={adminStyles.muted}>
        Configura el flete online, la nota que ve el cliente y la dirección de retiro en tienda.
      </p>

      {loading ? <p className={adminStyles.muted}>Cargando…</p> : null}
      {err ? <p className={adminStyles.error}>{err}</p> : null}
      {msg ? <p className={adminStyles.banner}>{msg}</p> : null}

      {!loading ? (
        <form className={adminStyles.panelCard} onSubmit={onSave}>
          <label className={adminStyles.label}>
            Cobrar envío online
            <select
              className={adminStyles.input}
              value={chargeOnline ? "1" : "0"}
              onChange={(e) => setChargeOnline(e.target.value === "1")}
            >
              <option value="0">No</option>
              <option value="1">Sí</option>
            </select>
            <span className={adminStyles.muted} style={{ display: "block", marginTop: "0.25rem" }}>
              Si es «No», el checkout no suma flete (p. ej. envío por pagar).
            </span>
          </label>

          <label className={adminStyles.label} style={{ marginTop: "0.75rem" }}>
            Monto flete (pesos CLP enteros)
            <input
              className={adminStyles.input}
              value={feePesos}
              onChange={(e) => setFeePesos(e.target.value)}
              placeholder="Ej. 3990"
              inputMode="numeric"
              autoComplete="off"
              disabled={!chargeOnline}
            />
          </label>

          <label className={adminStyles.label} style={{ marginTop: "0.75rem" }}>
            Nota de envío
            <textarea
              className={adminStyles.input}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Texto visible al cliente sobre el despacho"
            />
          </label>

          <label className={adminStyles.label} style={{ marginTop: "0.75rem" }}>
            Dirección de retiro
            <textarea
              className={adminStyles.input}
              rows={3}
              value={pickup}
              onChange={(e) => setPickup(e.target.value)}
              placeholder="Dirección o instrucciones para retiro en tienda"
            />
          </label>

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
