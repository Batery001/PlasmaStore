import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import styles from "./pages.module.css";

type LoginLocationState = { from?: { pathname: string } };

export function Login() {
  const { refresh } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const from = (location.state as LoginLocationState | null)?.from?.pathname ?? "/";
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/store/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: loginId.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al entrar");
      await refresh();
      nav(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.narrow}>
      <h1 className={styles.pageTitle}>Entrar</h1>
      <form className={styles.form} onSubmit={onSubmit}>
        <label className={styles.label}>
          Usuario o email
          <input
            className={styles.input}
            type="text"
            autoComplete="username"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            required
          />
        </label>
        <label className={styles.label}>
          Contraseña
          <input
            className={styles.input}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.btnPrimary} type="submit" disabled={busy}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
      <p className={styles.muted}>
        ¿No tienes cuenta? <Link to="/registro">Regístrate</Link>
      </p>
    </div>
  );
}
