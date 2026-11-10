import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { formatCLP } from "../lib/money";
import { parseResponseJson } from "../lib/parseResponseJson";
import { printShippingTicket, type ShipTicketOrder } from "./printShippingTicket";
import styles from "./shippingInbox.module.css";
import fabStyles from "../pos/posPopup.module.css";

type InboxOrder = ShipTicketOrder & {
  packing_print_at?: string | null;
};

const PENDING = new Set(["paid", "processing"]);

export function ShippingInboxHost() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [orders, setOrders] = useState<InboxOrder[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  const allowed = Boolean(user && (user.role === "admin" || user.role === "staff"));
  const hide = location.pathname.startsWith("/admin/pos");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/store/admin/shipping-inbox", { credentials: "include" });
      const j = await parseResponseJson<{ ok?: boolean; orders?: InboxOrder[]; error?: string }>(r);
      if (!r.ok || !j.ok) throw new Error(j.error || "No se pudo cargar el buzón.");
      setOrders(Array.isArray(j.orders) ? j.orders : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!allowed || hide) return;
    void load();
    const t = window.setInterval(() => void load(), 45000);
    return () => window.clearInterval(t);
  }, [allowed, hide, load]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const pending = useMemo(
    () => orders.filter((o) => PENDING.has(String(o.status || "")) && !o.packing_print_at),
    [orders]
  );
  const printed = useMemo(
    () => orders.filter((o) => PENDING.has(String(o.status || "")) && o.packing_print_at),
    [orders]
  );

  async function markPrinted(order: InboxOrder) {
    setBusyId(order._id);
    try {
      await fetch(`/api/store/admin/orders/${order._id}/packing-print`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {
      /* ignore mark errors — print still ok */
    } finally {
      setBusyId(null);
      void load();
    }
  }

  function onPrint(order: InboxOrder) {
    printShippingTicket(order);
    void markPrinted(order);
  }

  async function markShipped(order: InboxOrder) {
    if (!window.confirm(`¿Marcar orden #${order._id} como enviada?`)) return;
    setBusyId(order._id);
    setErr(null);
    try {
      const r = await fetch(`/api/store/admin/orders/${order._id}/status`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "shipped", note: "Despachado desde buzón de envíos" }),
      });
      const j = await parseResponseJson<{ ok?: boolean; error?: string }>(r);
      if (!r.ok || !j.ok) throw new Error(j.error || "No se pudo marcar enviada.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusyId(null);
    }
  }

  if (!allowed || hide) return null;

  const badge = pending.length;

  return (
    <>
      <button
        type="button"
        className={`${fabStyles.fab} ${styles.fabMail}`}
        onClick={() => setOpen(true)}
        title="Buzón de envíos"
        aria-label={badge > 0 ? `Buzón de envíos, ${badge} pendientes` : "Buzón de envíos"}
      >
        ✉ Envíos
        {badge > 0 ? <span className={styles.fabBadge}>{badge > 99 ? "99+" : badge}</span> : null}
      </button>

      {open ? (
        <div className={fabStyles.backdrop} role="presentation" onClick={() => setOpen(false)}>
          <div
            className={`${fabStyles.window} ${styles.inboxWindow}`}
            role="dialog"
            aria-modal="true"
            aria-label="Buzón de envíos"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={fabStyles.titleBar}>
              <div>
                <strong>Buzón de envíos</strong>
                <span className={fabStyles.hint}>Pedidos web a domicilio · imprimí en la boletera del PC</span>
              </div>
              <div className={fabStyles.titleActions}>
                <button type="button" className={fabStyles.iconBtn} onClick={() => void load()} title="Actualizar">
                  ↻
                </button>
                <button type="button" className={fabStyles.iconBtn} onClick={() => setOpen(false)} aria-label="Cerrar">
                  ×
                </button>
              </div>
            </div>
            <div className={fabStyles.body}>
              {err ? <p className={styles.error}>{err}</p> : null}
              {loading && !orders.length ? <p className={fabStyles.loading}>Cargando…</p> : null}

              <h3 className={styles.sectionTitle}>Por imprimir / despachar ({pending.length})</h3>
              {pending.length === 0 ? (
                <p className={styles.empty}>No hay envíos pendientes.</p>
              ) : (
                <ul className={styles.list}>
                  {pending.map((o) => (
                    <li key={o._id} className={styles.card}>
                      <div className={styles.cardTop}>
                        <strong>#{o._id}</strong>
                        <span>{formatCLP(o.total_cents || 0)}</span>
                      </div>
                      <div className={styles.meta}>
                        {o.fulfillment?.recipient || "Sin nombre"}
                        {o.fulfillment?.phone ? ` · ${o.fulfillment.phone}` : ""}
                      </div>
                      <div className={styles.addr}>
                        {[
                          o.fulfillment?.address?.street,
                          o.fulfillment?.address?.apartment,
                          o.fulfillment?.address?.commune,
                          o.fulfillment?.address?.region,
                        ]
                          .filter(Boolean)
                          .join(", ") || "Sin dirección"}
                      </div>
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.btnPrimary}
                          disabled={busyId === o._id}
                          onClick={() => onPrint(o)}
                        >
                          Imprimir ticket
                        </button>
                        <button
                          type="button"
                          className={styles.btn}
                          disabled={busyId === o._id}
                          onClick={() => void markShipped(o)}
                        >
                          Marcar enviada
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {printed.length > 0 ? (
                <>
                  <h3 className={styles.sectionTitle}>Ya impresos ({printed.length})</h3>
                  <ul className={styles.list}>
                    {printed.map((o) => (
                      <li key={o._id} className={`${styles.card} ${styles.cardMuted}`}>
                        <div className={styles.cardTop}>
                          <strong>#{o._id}</strong>
                          <span>{o.fulfillment?.recipient || "—"}</span>
                        </div>
                        <div className={styles.actions}>
                          <button type="button" className={styles.btn} onClick={() => onPrint(o)}>
                            Reimprimir
                          </button>
                          <button
                            type="button"
                            className={styles.btn}
                            disabled={busyId === o._id}
                            onClick={() => void markShipped(o)}
                          >
                            Marcar enviada
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
