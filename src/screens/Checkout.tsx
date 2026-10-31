import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { formatCLP } from "../lib/money";
import { parseResponseJson } from "../lib/parseResponseJson";
import { maskRutInput, parseAndValidateRut } from "../lib/rut";
import { formatEventPlayerSummary, type EventPlayer } from "../lib/eventPlayer";
import { EventPlayerFormsForOrder } from "../components/EventPlayerForm";
import { useAuth } from "../auth/AuthContext";
import styles from "./pages.module.css";

type Line = {
  productId: number;
  quantity: number;
  name: string;
  price_cents: number;
  line_total_cents?: number;
  stock: number;
  image_url?: string | null;
  product_kind?: string;
  event_id?: number | null;
  event_player?: EventPlayer | null;
};

type FulfillMethod = "pickup" | "shipping";
type PayMethod = "tuu" | "store";

export function Checkout() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<Line[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const [method, setMethod] = useState<FulfillMethod>("pickup");
  const [shippingNote, setShippingNote] = useState(
    "Los envíos se realizan por Starken los días jueves, por pagar (pago contra entrega).",
  );
  const [pickupAddress, setPickupAddress] = useState("Plasma Store — retiro en tienda.");
  const [shippingFeeCents, setShippingFeeCents] = useState(0);
  const [chargeShippingOnline, setChargeShippingOnline] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [street, setStreet] = useState("");
  const [apartment, setApartment] = useState("");
  const [commune, setCommune] = useState("");
  const [region, setRegion] = useState("Metropolitana");
  const [rut, setRut] = useState("");
  const [termsOk, setTermsOk] = useState(false);
  const [tuuEnabled, setTuuEnabled] = useState(true);
  const [payMethod, setPayMethod] = useState<PayMethod>("tuu");
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponLabel, setCouponLabel] = useState("");
  const [couponMsg, setCouponMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/store/cart", { credentials: "include" });
      if (!res.ok) {
        setItems([]);
        return;
      }
      const data = await parseResponseJson<{ items?: Line[] }>(res);
      setItems(data.items || []);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    reload();
  }, [loading, reload]);

  useEffect(() => {
    fetch("/api/store/checkout/options", { credentials: "include" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok || !j?.ok) return;
        if (typeof j.shipping_note === "string" && j.shipping_note.trim()) setShippingNote(j.shipping_note.trim());
        if (typeof j.pickup_address === "string" && j.pickup_address.trim()) setPickupAddress(j.pickup_address.trim());
        const fee = parseInt(String(j.shipping_fee_cents ?? 0), 10) || 0;
        setShippingFeeCents(fee);
        setChargeShippingOnline(Boolean(j.charge_shipping_online) && fee > 0);
        if (typeof j.tuu_enabled === "boolean") setTuuEnabled(j.tuu_enabled);
      })
      .catch(() => {
        /* defaults */
      });
  }, []);

  useEffect(() => {
    if (!user) return;
    setRecipient((prev) => prev || user.name || "");
    setEmail((prev) => prev || user.email || "");
    if (user.rut) setRut((prev) => prev || user.rut || "");
  }, [user]);

  const subtotal = useMemo(
    () =>
      (items || []).reduce(
        (s, i) => s + (typeof i.line_total_cents === "number" ? i.line_total_cents : i.price_cents * i.quantity),
        0
      ),
    [items]
  );
  const onlyEvents = (items || []).length > 0 && (items || []).every((i) => i.product_kind === "event" || Boolean(i.event_id));
  const shippingNow = !onlyEvents && method === "shipping" && chargeShippingOnline ? shippingFeeCents : 0;
  const total = Math.max(0, subtotal + shippingNow - couponDiscount);

  useEffect(() => {
    if (onlyEvents && method !== "pickup") setMethod("pickup");
  }, [onlyEvents, method]);

  useEffect(() => {
    if (onlyEvents) setPayMethod("store");
  }, [onlyEvents]);

  useEffect(() => {
    if (payMethod === "store" && method !== "pickup") setMethod("pickup");
  }, [payMethod, method]);

  function buildFulfillment() {
    if (method === "shipping") {
      if (street.trim().length < 5) throw new Error("Indica la dirección de envío (calle y número).");
      if (!commune.trim()) throw new Error("Indica la comuna.");
      if (!region.trim()) throw new Error("Indica la región.");
    }
    if (phone.trim().length < 8) throw new Error("Indica un teléfono de contacto (mín. 8 dígitos).");
    if (!email.trim().includes("@")) throw new Error("Indica un email para el comprobante de pago.");
    if (!parseAndValidateRut(rut)) throw new Error("RUT inválido. Usa el formato 12.345.678-9.");
    if (!termsOk) throw new Error("Debes aceptar los términos y la política de privacidad.");

    return method === "pickup"
      ? {
          method: "pickup" as const,
          recipient: recipient.trim(),
          phone: phone.trim(),
          notes: notes.trim(),
          email: email.trim().toLowerCase(),
          rut: rut.trim(),
        }
      : {
          method: "shipping" as const,
          recipient: recipient.trim(),
          phone: phone.trim(),
          notes: notes.trim(),
          email: email.trim().toLowerCase(),
          rut: rut.trim(),
          address: {
            street: street.trim(),
            apartment: apartment.trim(),
            commune: commune.trim(),
            region: region.trim(),
          },
        };
  }

  function showPayError(text: string) {
    setMsg(text);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function pay() {
    setMsg(null);
    setPaying(true);
    try {
      const fulfillment = buildFulfillment();
      const r = await fetch("/api/store/checkout/tuu/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fulfillment: payMethod === "store" ? { ...fulfillment, method: "pickup" } : fulfillment,
          terms_accepted: true,
          pay_provider: payMethod === "store" ? "store" : "tuu",
          coupon_code: couponCode.trim() || undefined,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "No se pudo confirmar el pedido.");
      if (j.store_reserved) {
        window.location.href = `/checkout/listo?order=${encodeURIComponent(String(j.orderId || ""))}`;
        return;
      }
      if (j.paid) {
        window.location.href = `/checkout/listo?order=${encodeURIComponent(String(j.orderId || ""))}&paid=1`;
        return;
      }
      if (typeof j.url === "string" && /^https?:\/\//i.test(j.url)) {
        window.location.href = j.url;
        return;
      }
      if (!j.action || !j.fields || typeof j.fields !== "object") {
        throw new Error("TUU no devolvió los datos de pago. Revisa Admin → Sistema de pago.");
      }
      const form = document.createElement("form");
      form.method = "POST";
      form.action = String(j.action);
      form.style.display = "none";
      for (const [key, value] of Object.entries(j.fields as Record<string, unknown>)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = String(value ?? "");
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
      window.setTimeout(() => {
        try {
          form.remove();
        } catch {
          /* ignore */
        }
      }, 2000);
    } catch (e) {
      showPayError(e instanceof Error ? e.message : "Error iniciando pago TUU.");
      setPaying(false);
    }
  }

  if (loading || items === null) return <p className={styles.muted}>Cargando…</p>;
  if (items.length === 0) return <Navigate to="/carrito" replace />;

  return (
    <div>
      <p className={styles.checkoutSteps}>
        <Link className={styles.checkoutStepMuted} to="/carrito">
          1. Carrito
        </Link>
        <span className={styles.checkoutStepOn}>2. Entrega y pago</span>
      </p>
      <h1 className={styles.pageTitle}>Confirmar compra</h1>
      {msg ? <p className={styles.banner}>{msg}</p> : null}

      <section className={styles.checkoutSummary} aria-label="Resumen del pedido">
        <h2 className={styles.subTitle} style={{ marginTop: 0 }}>
          Productos
        </h2>
        <ul className={styles.checkoutSummaryList}>
          {items.map((i) => (
            <li key={i.productId}>
              <span>
                {i.quantity}× {i.name}
                {i.event_player ? (
                  <>
                    <br />
                    <span className={styles.muted}>{formatEventPlayerSummary(i.event_player)}</span>
                  </>
                ) : null}
              </span>
              <strong>
                {formatCLP(typeof i.line_total_cents === "number" ? i.line_total_cents : i.price_cents * i.quantity)}
              </strong>
            </li>
          ))}
        </ul>
        <Link className={styles.linkbtn} to="/carrito">
          Volver a editar el carrito
        </Link>
      </section>

      <section className={styles.fulfillBox} aria-label="Entrega">
        <h2 className={styles.subTitle}>¿Cómo quieres recibir tu compra?</h2>
        {onlyEvents ? (
          <p className={styles.fulfillHint}>
            El cupo no se envía. Pagas aquí (TUU) o en la caja de la tienda. Si llega la hora de inicio y no está
            pagado, se pierde.
          </p>
        ) : (
        <div className={styles.fulfillChoices}>
          <label className={`${styles.fulfillChoice} ${method === "pickup" ? styles.fulfillChoiceOn : ""}`}>
            <input type="radio" name="fulfill" checked={method === "pickup"} onChange={() => setMethod("pickup")} />
            <span>
              <strong>Retiro en tienda</strong>
              <span className={styles.muted}>Gratis · {formatCLP(0)}</span>
            </span>
          </label>
          <label className={`${styles.fulfillChoice} ${method === "shipping" ? styles.fulfillChoiceOn : ""}`}>
            <input type="radio" name="fulfill" checked={method === "shipping"} onChange={() => setMethod("shipping")} />
            <span>
              <strong>Envío a domicilio</strong>
              <span className={styles.muted}>
                {chargeShippingOnline ? `Starken · ${formatCLP(shippingFeeCents)}` : "Starken · por pagar"}
              </span>
            </span>
          </label>
        </div>
        )}

        {method === "pickup" ? (
          <p className={styles.fulfillHint}>{pickupAddress}</p>
        ) : (
          <>
            <p className={styles.fulfillHint}>{shippingNote}</p>
            <div className={styles.fulfillForm}>
              <label className={styles.label}>
                Calle y número
                <input className={styles.input} value={street} onChange={(e) => setStreet(e.target.value)} required />
              </label>
              <label className={styles.label}>
                Depto / oficina (opcional)
                <input className={styles.input} value={apartment} onChange={(e) => setApartment(e.target.value)} />
              </label>
              <div className={styles.fulfillRow2}>
                <label className={styles.label}>
                  Comuna
                  <input className={styles.input} value={commune} onChange={(e) => setCommune(e.target.value)} required />
                </label>
                <label className={styles.label}>
                  Región
                  <input className={styles.input} value={region} onChange={(e) => setRegion(e.target.value)} required />
                </label>
              </div>
            </div>
          </>
        )}

        <div className={styles.fulfillForm}>
          <label className={styles.label}>
            Email (comprobante de pago)
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="tucorreo@gmail.com"
              autoComplete="email"
            />
          </label>
          <label className={styles.label}>
            RUT
            <input
              className={styles.input}
              value={rut}
              onChange={(e) => setRut(maskRutInput(e.target.value))}
              placeholder="12.345.678-9"
              required
              autoComplete="off"
            />
          </label>
          <label className={styles.label}>
            Nombre quien recibe / retira
            <input className={styles.input} value={recipient} onChange={(e) => setRecipient(e.target.value)} />
          </label>
          <label className={styles.label}>
            Teléfono (obligatorio)
            <input
              className={styles.input}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="+56 9 …"
            />
          </label>
          <label className={styles.label}>
            Notas (opcional)
            <textarea
              className={styles.textarea}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={method === "pickup" ? "Ej: retiro después de las 18:00" : "Ej: dejar en conserjería"}
            />
          </label>
          <label className={styles.checkRow}>
            <input type="checkbox" checked={termsOk} onChange={(e) => setTermsOk(e.target.checked)} required />
            <span>
              Acepto los <Link to="/terminos">términos</Link> y la <Link to="/privacidad">política de privacidad</Link>.
            </span>
          </label>
        </div>
      </section>

      <section className={styles.fulfillBox} aria-label="Pago">
        <h2 className={styles.subTitle} style={{ marginTop: 0 }}>
          ¿Cómo quieres pagar?
        </h2>
        <div className={styles.fulfillChoices}>
          <label className={`${styles.fulfillChoice} ${payMethod === "store" ? styles.fulfillChoiceOn : ""}`}>
            <input type="radio" name="pay" checked={payMethod === "store"} onChange={() => setPayMethod("store")} />
            <span>
              <strong>Pagar en la tienda</strong>
              <span className={styles.muted}>Reservas el cupo y pagas en el local antes del evento</span>
            </span>
          </label>
          <label className={`${styles.fulfillChoice} ${payMethod === "tuu" ? styles.fulfillChoiceOn : ""}`}>
            <input
              type="radio"
              name="pay"
              checked={payMethod === "tuu"}
              onChange={() => setPayMethod("tuu")}
              disabled={!tuuEnabled}
            />
            <span>
              <strong>Pagar ahora en línea</strong>
              <span className={styles.muted}>TUU Pago Online</span>
            </span>
          </label>
        </div>
        <p className={styles.fulfillHint}>
          Si llega el día y la hora de inicio y el cupo sigue sin pagar, se pierde.
        </p>
      </section>

      <section className={styles.fulfillBox} aria-label="Cupón">
        <h2 className={styles.subTitle} style={{ marginTop: 0 }}>
          Cupón de descuento
        </h2>
        <div className={styles.searchRow}>
          <input
            className={styles.input}
            value={couponCode}
            onChange={(e) => {
              setCouponCode(e.target.value.toUpperCase());
              setCouponDiscount(0);
              setCouponLabel("");
              setCouponMsg(null);
            }}
            placeholder="Código"
            autoComplete="off"
          />
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => {
              setCouponMsg(null);
              fetch("/api/store/checkout/coupon/validate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ code: couponCode, subtotal_cents: subtotal }),
              })
                .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
                .then(({ ok, j }) => {
                  if (!ok || !j?.ok) {
                    setCouponDiscount(0);
                    setCouponLabel("");
                    setCouponMsg(j?.error || "Cupón inválido");
                    return;
                  }
                  setCouponDiscount(j.coupon.discount_cents || 0);
                  setCouponLabel(j.coupon.label || j.coupon.code);
                  setCouponMsg(`Aplicado: ${j.coupon.label || j.coupon.code}`);
                })
                .catch(() => setCouponMsg("No se pudo validar el cupón"));
            }}
          >
            Aplicar
          </button>
        </div>
        {couponMsg ? <p className={styles.muted}>{couponMsg}</p> : null}
      </section>

      <div className={styles.totalsBox}>
        <div className={styles.totalsRow}>
          <span>Subtotal productos</span>
          <strong>{formatCLP(subtotal)}</strong>
        </div>
        {couponDiscount > 0 ? (
          <div className={styles.totalsRow}>
            <span>Descuento {couponLabel ? `(${couponLabel})` : ""}</span>
            <strong>-{formatCLP(couponDiscount)}</strong>
          </div>
        ) : null}
        {method === "shipping" ? (
          <div className={styles.totalsRow}>
            <span>Envío Starken</span>
            <strong>{chargeShippingOnline ? formatCLP(shippingFeeCents) : "Por pagar"}</strong>
          </div>
        ) : (
          <div className={styles.totalsRow}>
            <span>Retiro en tienda</span>
            <strong>{formatCLP(0)}</strong>
          </div>
        )}
        <div className={`${styles.totalsRow} ${styles.totalsGrand}`}>
          <span>{payMethod === "store" ? "Total a pagar en tienda" : "Total a pagar ahora"}</span>
          <strong>{formatCLP(total)}</strong>
        </div>
      </div>

      <div className={styles.heroActions} style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
        <button
          type="button"
          className={styles.btnPrimary}
          disabled={paying || !termsOk || (payMethod === "tuu" && !tuuEnabled)}
          onClick={() => void pay()}
        >
          {paying
            ? "Procesando…"
            : payMethod === "store"
              ? "Confirmar y pagar en tienda"
              : "Pagar ahora"}
        </button>
      </div>
      <p className={styles.muted} style={{ marginTop: "0.35rem" }}>
        {payMethod === "store"
          ? "El siguiente paso es pagar en Plasma Store. El cupo queda reservado hasta la hora de inicio."
          : tuuEnabled
            ? "El pago en línea se procesa con TUU. Marca los términos, usa un RUT válido y un teléfono de contacto."
            : "El pago online no está habilitado. Revisa Admin → Sistema de pago (TUU)."}
      </p>
    </div>
  );
}

export function CheckoutReserved() {
  const [params] = useSearchParams();
  const orderId = params.get("order") || "";
  const paid = params.get("paid") === "1";

  return (
    <div>
      <p className={styles.checkoutSteps}>
        <span className={styles.checkoutStepMuted}>1. Carrito</span>
        <span className={styles.checkoutStepOn}>2. Pedido confirmado</span>
      </p>
      <h1 className={styles.pageTitle}>{paid ? "Pago recibido" : "Cupo reservado"}</h1>
      <p>
        {paid
          ? "Tu pago quedó registrado. Revisa el comprobante en tu correo si está configurado."
          : "Elegiste pagar en la tienda. El cupo está reservado: págalo en Plasma Store antes de la hora de inicio del evento. Si no pagas para entonces, se libera."}
      </p>
      {orderId ? <p className={styles.muted}>Pedido #{orderId}</p> : null}
      {orderId ? <EventPlayerFormsForOrder orderId={orderId} /> : null}
      <div className={styles.heroActions} style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
        <Link className={styles.btnPrimary} to="/eventos">
          Volver a eventos
        </Link>
        <Link className={styles.btnGhost} to="/catalogo">
          Seguir comprando
        </Link>
      </div>
    </div>
  );
}
