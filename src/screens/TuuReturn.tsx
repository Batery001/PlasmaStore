import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { EventPlayerFormsForOrder } from "../components/EventPlayerForm";
import styles from "./pages.module.css";

function useQuery() {
  const loc = useLocation();
  return useMemo(() => new URLSearchParams(loc.search), [loc.search]);
}

export function TuuReturn() {
  const q = useQuery();
  const ref = q.get("ref") || "";
  const resultHint = (q.get("result") || "").toLowerCase();
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "fail">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [boletaUrl, setBoletaUrl] = useState<string | null>(null);

  useEffect(() => {
    if (resultHint === "cancelled" || resultHint === "canceled") {
      setStatus("fail");
      setMsg("Pago cancelado.");
      return;
    }
    if (!ref) {
      setStatus("fail");
      setMsg("Falta la referencia de la venta (retorno TUU inválido).");
      return;
    }
    setStatus("loading");
    let cancelled = false;
    let attempts = 0;

    const tick = () => {
      fetch(`/api/store/checkout/tuu/status?ref=${encodeURIComponent(ref)}`, { credentials: "include" })
        .then(async (r) => {
          const j = await r.json().catch(() => ({}));
          if (!r.ok || !j.ok) throw new Error(j.error || "No se pudo confirmar el pago TUU.");
          return j;
        })
        .then((j) => {
          if (cancelled) return;
          if (j.approved) {
            if (j.inventoryApplied === false && (j.inventoryWarning || j.stockMessage)) {
              setStatus("fail");
              setMsg(
                `Pago recibido, pero el stock ya no estaba disponible: ${j.stockMessage || j.inventoryWarning}. Contáctanos para resolver tu orden #${j.orderId}.`
              );
              return;
            }
            setStatus("ok");
            setOrderId(typeof j.orderId === "number" ? j.orderId : null);
            setBoletaUrl(
              typeof j.boletaUrl === "string"
                ? j.boletaUrl
                : j.orderId
                  ? `/api/store/orders/${j.orderId}/boleta`
                  : null
            );
            setMsg(`Pago aprobado. Venta #${j.orderId}.`);
            return;
          }
          if (j.pending && attempts < 8) {
            attempts += 1;
            setMsg("Confirmando pago con TUU…");
            window.setTimeout(tick, 1500);
            return;
          }
          setStatus("fail");
          setMsg(resultHint === "failed" ? "Pago rechazado o anulado." : "El pago no quedó confirmado. Si te cobraron, contáctanos con el número de venta.");
        })
        .catch((e) => {
          if (cancelled) return;
          if (attempts < 8) {
            attempts += 1;
            window.setTimeout(tick, 1500);
            return;
          }
          setStatus("fail");
          setMsg(e instanceof Error ? e.message : "Error al confirmar pago TUU.");
        });
    };

    tick();
    return () => {
      cancelled = true;
    };
  }, [ref, resultHint]);

  return (
    <div className={styles.narrow} style={status === "ok" ? { maxWidth: 520 } : undefined}>
      <h1 className={styles.pageTitle}>{status === "ok" ? "¡Gracias por tu compra!" : "Pago TUU"}</h1>
      {status === "loading" ? <p className={styles.muted}>{msg || "Confirmando pago…"}</p> : null}
      {status !== "loading" && msg ? <p className={status === "ok" ? styles.banner : styles.error}>{msg}</p> : null}

      {status === "ok" && boletaUrl ? (
        <div
          style={{
            margin: "0.75rem 0 0.25rem",
            borderRadius: 10,
            overflow: "hidden",
            border: "1px solid var(--border-soft)",
            background: "#f4f4f8",
          }}
        >
          <iframe
            title="Boleta de venta"
            src={boletaUrl}
            style={{
              display: "block",
              width: "100%",
              minHeight: 560,
              border: 0,
              background: "#f4f4f8",
            }}
          />
        </div>
      ) : null}

      {status === "ok" && orderId ? <EventPlayerFormsForOrder orderId={orderId} /> : null}

      {status === "ok" ? (
        <div style={{ display: "grid", placeItems: "center", margin: "0.25rem 0 1rem" }}>
          <img
            src="/mascot-hero.png"
            alt="Mascota Plasma Store"
            style={{
              width: "min(360px, 100%)",
              height: "auto",
              transform: "translateY(-22px)",
              clipPath: "polygon(0 0, 100% 0, 100% 100%, 58% 100%, 0 86%, 0 0)",
              filter: "drop-shadow(0 10px 35px rgba(91, 33, 182, 0.55))",
            }}
          />
        </div>
      ) : null}

      <div className={styles.heroActions} style={{ justifyContent: "flex-start" }}>
        <Link className={styles.btnPrimary} to="/catalogo">
          Volver al catálogo
        </Link>
        {orderId ? (
          <Link className={styles.btnGhost} to="/perfil">
            Mis compras
          </Link>
        ) : (
          <Link className={styles.btnGhost} to="/carrito">
            Ver carrito
          </Link>
        )}
      </div>
    </div>
  );
}
