import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { parseResponseJson } from "../lib/parseResponseJson";
import styles from "./pages.module.css";

export function VerifyEmail() {
  const loc = useLocation();
  const { refresh, user } = useAuth();
  const token = useMemo(() => new URLSearchParams(loc.search).get("token") || "", [loc.search]);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "fail">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("fail");
      setMsg("Falta el token de verificación.");
      return;
    }
    setStatus("loading");
    fetch("/api/store/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (r) => {
        const j = await parseResponseJson<{ error?: string; message?: string }>(r);
        if (!r.ok) throw new Error(j.error || "No se pudo verificar.");
        setStatus("ok");
        setMsg(j.message || "Correo verificado.");
        await refresh();
      })
      .catch((e) => {
        setStatus("fail");
        setMsg(e instanceof Error ? e.message : "Error");
      });
  }, [token, refresh]);

  async function resend() {
    setMsg(null);
    const res = await fetch("/api/store/auth/request-verify", { method: "POST", credentials: "include" });
    const j = await parseResponseJson<{ error?: string; message?: string }>(res);
    setMsg(res.ok ? j.message || "Enviado." : j.error || "No se pudo reenviar.");
  }

  return (
    <div className={styles.narrow}>
      <h1 className={styles.pageTitle}>Verificar correo</h1>
      {status === "loading" ? <p className={styles.muted}>Verificando…</p> : null}
      {msg ? <p className={status === "ok" ? styles.banner : styles.error}>{msg}</p> : null}
      <div className={styles.heroActions} style={{ justifyContent: "flex-start" }}>
        <Link className={styles.btnPrimary} to="/catalogo">
          Ir al catálogo
        </Link>
        {user && !user.email_verified ? (
          <button type="button" className={styles.btnGhost} onClick={() => void resend()}>
            Reenviar correo
          </button>
        ) : null}
      </div>
    </div>
  );
}
