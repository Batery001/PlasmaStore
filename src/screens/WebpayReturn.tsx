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
          setStatus("ok");
          setMsg(`Pago aprobado. Orden #${j.orderId}.`);
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
    <div className={styles.narrow}>
      <h1 className={styles.pageTitle}>Pago Webpay</h1>
      {status === "loading" ? <p className={styles.muted}>Confirmando pago…</p> : null}
      {msg ? <p className={status === "ok" ? styles.banner : styles.error}>{msg}</p> : null}
      <div className={styles.heroActions} style={{ justifyContent: "flex-start" }}>
        <Link className={styles.btnPrimary} to="/catalogo">
          Volver al catálogo
        </Link>
        <Link className={styles.btnGhost} to="/carrito">
          Ver carrito
        </Link>
      </div>
    </div>
  );
}

