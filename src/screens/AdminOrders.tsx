import { useEffect, useMemo, useRef, useState } from "react";
import adminStyles from "../admin/admin.module.css";
import { formatCLP } from "../lib/money";

type ShippingProof = {
  url?: string | null;
  filename?: string | null;
  tracking_code?: string | null;
  note?: string | null;
  mimetype?: string | null;
  updatedAt?: string;
};

type Order = {
  _id: number;
  user_id: number;
  status: string;
  currency?: string;
  total_cents: number;
  subtotal_cents?: number;
  shipping_fee_cents?: number;
  createdAt?: string;
  buyer_email?: string | null;
  buyer_rut?: string | null;
  receipt_email_sent?: boolean;
  receipt_email_error?: string | null;
  admin_notify_sent?: boolean;
  admin_notify_error?: string | null;
  payment?: { provider?: string; buyOrder?: string; token?: string; url?: string };
  boleta?: { folio?: number; issued_at?: string; total_cents?: number } | null;
  items?: Array<{ product_id: number; name: string; price_cents: number; quantity: number }>;
  shipping_proof?: ShippingProof | null;
  fulfillment?: {
    method?: string;
    label?: string;
    recipient?: string | null;
    phone?: string | null;
    notes?: string | null;
    pickup_address?: string | null;
    shipping_note?: string | null;
    shipping_fee_cents?: number;
    shipping_payment?: string | null;
    rut?: string | null;
    address?: { street?: string; apartment?: string; commune?: string; region?: string } | null;
  };
};

export function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [selected, setSelected] = useState<Order | null>(null);
  const [detail, setDetail] = useState<{ order: Order; user: { id: number; email: string; name: string } | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [trackingCode, setTrackingCode] = useState("");
  const proofInputRef = useRef<HTMLInputElement>(null);

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      pending_payment: "Pendiente pago",
      paid: "Pagado",
      processing: "Procesando",
      ready_for_pickup: "Listo para retiro",
      shipped: "En camino",
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
    setTrackingCode("");
    try {
      const r = await fetch(`/api/store/admin/orders/${o._id}`, { credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "No se pudo cargar detalle.");
      setDetail({ order: j.order, user: j.user });
      setTrackingCode(String(j.order?.shipping_proof?.tracking_code || ""));
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

  async function refundWebpay() {
    if (!detail) return;
    if (!window.confirm("¿Reembolsar el pago en Webpay y marcar la orden como reembolsada?")) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/store/admin/orders/${detail.order._id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ note }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "No se pudo reembolsar.");
      await load();
      await openDetail(j.order || detail.order);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function issueBoleta() {
    if (!detail) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/store/admin/orders/${detail.order._id}/boleta`, {
        method: "POST",
        credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "No se pudo emitir boleta.");
      await openDetail(j.order || detail.order);
      window.open(`/api/store/orders/${detail.order._id}/boleta`, "_blank", "noopener,noreferrer");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function attachShippingProof(file?: File | null) {
    if (!detail) return;
    if (!file && !trackingCode.trim()) {
      setErr("Elige un archivo o escribe un código de seguimiento.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      if (file) fd.append("file", file);
      if (trackingCode.trim()) fd.append("tracking_code", trackingCode.trim());
      if (note.trim()) fd.append("note", note.trim());
      const r = await fetch(`/api/store/admin/orders/${detail.order._id}/shipping-proof`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "No se pudo adjuntar el comprobante.");
      if (proofInputRef.current) proofInputRef.current.value = "";
      await load();
      await openDetail(detail.order);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function removeShippingProof() {
    if (!detail) return;
    if (!window.confirm("¿Quitar el comprobante de envío de esta orden?")) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/store/admin/orders/${detail.order._id}/shipping-proof`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "No se pudo eliminar.");
      setTrackingCode("");
      await load();
      await openDetail(detail.order);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function resendMail() {
    if (!detail) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/store/admin/orders/${detail.order._id}/resend-mail`, {
        method: "POST",
        credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "No se pudieron reenviar los correos.");
      await openDetail(detail.order);
      setErr(null);
      alert(j.message || "Correos reenviados.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  function mailStatusLine(order: Order) {
    const buyer = order.buyer_email || detail?.user?.email || "—";
    const receipt = order.receipt_email_sent
      ? "comprobante enviado"
      : order.receipt_email_error
        ? "comprobante falló"
        : "comprobante pendiente";
    const admin = order.admin_notify_sent
      ? "aviso admin enviado"
      : order.admin_notify_error
        ? "aviso admin falló"
        : "aviso admin pendiente";
    return `Email comprador: ${buyer} · ${receipt} · ${admin}`;
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
                  <th>Entrega</th>
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
                    <td>{o.fulfillment?.label || (o.fulfillment?.method === "shipping" ? "Envío" : o.fulfillment?.method === "pickup" ? "Retiro" : "—")}</td>
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
                <br />
                <b>Correos:</b> {mailStatusLine(detail.order)}
              </p>
              {detail.order.receipt_email_error || detail.order.admin_notify_error ? (
                <p className={adminStyles.error} style={{ fontSize: "0.9rem" }}>
                  {detail.order.receipt_email_error || detail.order.admin_notify_error}
                </p>
              ) : null}
              {["paid", "processing", "shipped", "completed"].includes(detail.order.status) ? (
                <button type="button" className={adminStyles.btn} disabled={busy} onClick={() => void resendMail()} style={{ marginBottom: "0.75rem" }}>
                  {busy ? "Enviando…" : "Reenviar comprobante + aviso"}
                </button>
              ) : null}

              {detail.order.fulfillment ? (
                <>
                  <div className={adminStyles.subTitle}>Entrega</div>
                  <p className={adminStyles.muted} style={{ marginTop: 0 }}>
                    <b>{detail.order.fulfillment.label || detail.order.fulfillment.method}</b>
                    {detail.order.fulfillment.shipping_note ? (
                      <>
                        <br />
                        {detail.order.fulfillment.shipping_note}
                      </>
                    ) : null}
                    {detail.order.fulfillment.recipient ? (
                      <>
                        <br />
                        Recibe/retira: {detail.order.fulfillment.recipient}
                      </>
                    ) : null}
                    {detail.order.fulfillment.phone ? (
                      <>
                        <br />
                        Tel: {detail.order.fulfillment.phone}
                      </>
                    ) : null}
                    {detail.order.fulfillment.method === "pickup" && detail.order.fulfillment.pickup_address ? (
                      <>
                        <br />
                        {detail.order.fulfillment.pickup_address}
                      </>
                    ) : null}
                    {detail.order.fulfillment.address ? (
                      <>
                        <br />
                        {[
                          detail.order.fulfillment.address.street,
                          detail.order.fulfillment.address.apartment,
                          detail.order.fulfillment.address.commune,
                          detail.order.fulfillment.address.region,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </>
                    ) : null}
                    {detail.order.fulfillment.notes ? (
                      <>
                        <br />
                        Notas: {detail.order.fulfillment.notes}
                      </>
                    ) : null}
                  </p>
                </>
              ) : null}

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
                <input
                  ref={proofInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,image/avif,application/pdf"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    void attachShippingProof(f);
                  }}
                />
                <button
                  type="button"
                  className={adminStyles.btn}
                  disabled={busy}
                  onClick={() => proofInputRef.current?.click()}
                  title="Adjuntar comprobante de envío (imagen o PDF)"
                >
                  Adjuntar
                </button>
                {["processing", "ready_for_pickup", "shipped", "completed", "cancelled", "refunded"].map((s) => (
                  <button key={s} type="button" className={adminStyles.btnPrimary} disabled={busy} onClick={() => setStatus(s)}>
                    {statusLabel(s)}
                  </button>
                ))}
                {detail.order.payment?.provider === "webpay" || detail.order.payment?.provider === "webpay_mock" ? (
                  <button
                    type="button"
                    className={adminStyles.btnDanger}
                    disabled={busy}
                    onClick={() => void refundWebpay()}
                    title="Reembolso real vía Webpay (si aplica)"
                  >
                    Reembolsar Webpay
                  </button>
                ) : detail.order.payment?.provider === "tuu" ? (
                  <span className={adminStyles.muted} style={{ alignSelf: "center" }}>
                    Reembolso TUU: manual con TUU/caja (marca la orden como Reembolsado al confirmar).
                  </span>
                ) : null}
                <button type="button" className={adminStyles.btn} disabled={busy} onClick={() => void issueBoleta()}>
                  {detail.order.boleta?.folio ? `Ver boleta #${detail.order.boleta.folio}` : "Emitir boleta de venta"}
                </button>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                  alignItems: "center",
                  marginTop: "0.65rem",
                }}
              >
                <input
                  className={adminStyles.input}
                  placeholder="Código de seguimiento (opcional)"
                  value={trackingCode}
                  onChange={(e) => setTrackingCode(e.target.value)}
                  style={{ flex: "1 1 220px" }}
                />
                <button
                  type="button"
                  className={adminStyles.btn}
                  disabled={busy || !trackingCode.trim()}
                  onClick={() => void attachShippingProof(null)}
                >
                  Guardar seguimiento
                </button>
              </div>
              {detail.order.shipping_proof?.url || detail.order.shipping_proof?.tracking_code ? (
                <p className={adminStyles.muted} style={{ marginTop: "0.65rem" }}>
                  <b>Seguimiento:</b>{" "}
                  {detail.order.shipping_proof.tracking_code
                    ? `código ${detail.order.shipping_proof.tracking_code}`
                    : null}
                  {detail.order.shipping_proof.url ? (
                    <>
                      {detail.order.shipping_proof.tracking_code ? " · " : null}
                      <a href={detail.order.shipping_proof.url} target="_blank" rel="noreferrer">
                        Ver comprobante
                        {detail.order.shipping_proof.filename
                          ? ` (${detail.order.shipping_proof.filename})`
                          : ""}
                      </a>
                    </>
                  ) : null}{" "}
                  <button
                    type="button"
                    className={adminStyles.btnLink}
                    disabled={busy}
                    onClick={() => void removeShippingProof()}
                  >
                    Quitar
                  </button>
                </p>
              ) : (
                <p className={adminStyles.muted} style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
                  Usa «Adjuntar» para subir la boleta/guía de Starken (imagen o PDF) y hacer seguimiento del envío.
                </p>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

