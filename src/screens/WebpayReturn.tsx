import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import styles from "./pages.module.css";

function useQuery() {
  const loc = useLocation();
  return useMemo(() => new URLSearchParams(loc.search), [loc.search]);
}

export function WebpayReturn() {
  const q = useQuery();
  const tokenWs = q.get("token_ws") || "";
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "fail">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [boletaUrl, setBoletaUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenWs) {
      setStatus("fail");
      setMsg("Falta token_ws (retorno inválido).");
      return;
    }
    setStatus("loading");
    fetch("/api/store/checkout/webpay/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token_ws: tokenWs }),
    })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) throw new Error(j.error || "No se pudo confirmar el pago.");
        return j;
      })
      .then((j) => {
        if (j.approved) {
          if (j.inventoryApplied === false && (j.inventoryWarning || j.stockMessage)) {
            setStatus("fail");
            setMsg(
              `Pago recibido, pero el stock ya no estaba disponible: ${j.stockMessage || j.inventoryWarning}. Contáctanos para resolver tu orden #${j.orderId}.`
            );
          } else {
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
          }
        } else {
          setStatus("fail");
          setMsg("Pago rechazado o anulado.");
        }
      })
      .catch((e) => {
        setStatus("fail");
        setMsg(e instanceof Error ? e.message : "Error al confirmar pago.");
      });
  }, [tokenWs]);

  return (
    <div className={styles.narrow} style={status === "ok" ? { maxWidth: 520 } : undefined}>
      <h1 className={styles.pageTitle}>{status === "ok" ? "¡Gracias por tu compra!" : "Pago Webpay"}</h1>
      {status === "loading" ? <p className={styles.muted}>Confirmando pago…</p> : null}
      {msg ? <p className={status === "ok" ? styles.banner : styles.error}>{msg}</p> : null}

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
