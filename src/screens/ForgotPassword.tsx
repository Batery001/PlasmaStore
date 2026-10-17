import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { parseResponseJson } from "../lib/parseResponseJson";
import styles from "./pages.module.css";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/store/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await parseResponseJson<{ error?: string; message?: string }>(res);
      if (!res.ok) throw new Error(data.error || "No se pudo enviar.");
      setMsg(data.message || "Si el correo existe, te enviamos instrucciones.");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.narrow}>
      <h1 className={styles.pageTitle}>Recuperar contraseña</h1>
      <p className={styles.muted}>Te enviaremos un enlace a tu correo (válido 1 hora).</p>
      <form className={styles.form} onSubmit={onSubmit}>
        <label className={styles.label}>
          Email
          <input className={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        {err ? <p className={styles.error}>{err}</p> : null}
        {msg ? <p className={styles.banner}>{msg}</p> : null}
        <button className={styles.btnPrimary} type="submit" disabled={busy}>
          {busy ? "Enviando…" : "Enviar enlace"}
        </button>
      </form>
      <p className={styles.muted}>
        <Link to="/login">Volver a entrar</Link>
      </p>
    </div>
  );
}
