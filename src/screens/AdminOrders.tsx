import { useEffect, useMemo, useState } from "react";
import adminStyles from "../admin/admin.module.css";
import { formatCLP } from "../lib/money";

type Order = {
  _id: number;
  user_id: number;
  status: string;
  currency?: string;
  total_cents: number;
  createdAt?: string;
  payment?: { provider?: string; buyOrder?: string; token?: string; url?: string };
  items?: Array<{ product_id: number; name: string; price_cents: number; quantity: number }>;
};

export function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [selected, setSelected] = useState<Order | null>(null);
  const [detail, setDetail] = useState<{ order: Order; user: { id: number; email: string; name: string } | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      pending_payment: "Pendiente pago",
      paid: "Pagado",
      processing: "Procesando",
      shipped: "Enviado",
      completed: "Completado",
      cancelled: "Cancelado",
      refunded: "Reembolsado",
      payment_failed: "Pago fallido",
    };
    return map[s] || s;
  };

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/store/admin/orders", { credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "No se pudo cargar órdenes.");
      setOrders(Array.isArray(j.orders) ? j.orders : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const sorted = useMemo(() => {
    return [...orders].sort((a, b) => (b._id ?? 0) - (a._id ?? 0));
  }, [orders]);

  async function openDetail(o: Order) {
    setSelected(o);
    setDetail(null);
    try {
      const r = await fetch(`/api/store/admin/orders/${o._id}`, { credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "No se pudo cargar detalle.");
      setDetail({ order: j.order, user: j.user });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  async function setStatus(next: string) {
    if (!detail) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/store/admin/orders/${detail.order._id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: next, note }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "No se pudo cambiar estado.");
      setNote("");
      await load();
      await openDetail({ ...detail.order, status: next });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className={adminStyles.pageTitle}>Órdenes</h1>
      <p className={adminStyles.pageLead}>Listado de pedidos y pagos (estilo OpenCart).</p>

      {err ? <p className={adminStyles.error}>{err}</p> : null}

      <div className={adminStyles.panelCard}>
        <h2>Listado</h2>
        {loading ? (
          <p className={adminStyles.muted}>Cargando…</p>
        ) : sorted.length === 0 ? (
          <p className={adminStyles.muted}>Aún no hay órdenes.</p>
        ) : (
          <div className={adminStyles.tableWrap}>
            <table className={adminStyles.table}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Estado</th>
                  <th>Total</th>
                  <th>Pago</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((o) => (
                  <tr key={o._id}>
                    <td>#{o._id}</td>
                    <td>{statusLabel(o.status)}</td>
                    <td>{formatCLP(o.total_cents)}</td>
                    <td>{o.payment?.provider || "—"}</td>
                    <td>
                      <button type="button" className={adminStyles.btn} onClick={() => openDetail(o)}>
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected ? (
        <div className={adminStyles.panelCard}>
          <h2>Detalle #{selected._id}</h2>
          {!detail ? (
            <p className={adminStyles.muted}>Cargando detalle…</p>
          ) : (
            <>
              <p className={adminStyles.muted}>
                <b>Cliente:</b> {detail.user ? `${detail.user.name} · ${detail.user.email}` : `user_id ${detail.order.user_id}`}
                <br />
                <b>Estado:</b> {statusLabel(detail.order.status)}
                <br />
                <b>Total:</b> {formatCLP(detail.order.total_cents)}
              </p>

              <div className={adminStyles.subTitle}>Ítems</div>
              <div className={adminStyles.tableWrap}>
                <table className={adminStyles.table}>
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Precio</th>
                      <th>Cant.</th>
                      <th>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.order.items || []).map((it, idx) => (
                      <tr key={`${it.product_id}-${idx}`}>
                        <td>
                          {it.name} <span className={adminStyles.muted}>(ID {it.product_id})</span>
                        </td>
                        <td>{formatCLP(it.price_cents)}</td>
                        <td>{it.quantity}</td>
                        <td>{formatCLP(it.price_cents * it.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={adminStyles.subTitle}>Cambiar estado</div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                <input
                  className={adminStyles.input}
                  placeholder="Nota (opcional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  style={{ flex: "1 1 280px" }}
                />
                {["processing", "shipped", "completed", "cancelled", "refunded"].map((s) => (
                  <button key={s} type="button" className={adminStyles.btnPrimary} disabled={busy} onClick={() => setStatus(s)}>
                    {statusLabel(s)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

