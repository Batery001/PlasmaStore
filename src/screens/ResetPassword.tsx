import { FormEvent, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { PasswordRequirements } from "../components/PasswordRequirements";
import { parseResponseJson } from "../lib/parseResponseJson";
import { PASSWORD_MIN_LENGTH, passwordValidationError } from "../lib/passwordRules";
import styles from "./pages.module.css";

export function ResetPassword() {
  const loc = useLocation();
  const nav = useNavigate();
  const token = useMemo(() => new URLSearchParams(loc.search).get("token") || "", [loc.search]);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const weak = passwordValidationError(password);
    if (weak) {
      setErr(weak);
      return;
    }
    if (password !== password2) {
      setErr("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/store/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await parseResponseJson<{ error?: string; message?: string }>(res);
      if (!res.ok) throw new Error(data.error || "No se pudo actualizar.");
      setMsg(data.message || "Listo.");
      window.setTimeout(() => nav("/login"), 1200);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className={styles.narrow}>
        <h1 className={styles.pageTitle}>Recuperar</h1>
        <p className={styles.error}>Falta el token del enlace. Solicita uno nuevo.</p>
        <Link to="/olvide-password">Pedir enlace</Link>
      </div>
    );
  }

  return (
    <div className={styles.narrow}>
      <h1 className={styles.pageTitle}>Nueva contraseña</h1>
      <form className={styles.form} onSubmit={onSubmit}>
        <label className={styles.label}>
          Contraseña
          <input
            className={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
          />
          <PasswordRequirements password={password} />
        </label>
        <label className={styles.label}>
          Confirmar
          <input
            className={styles.input}
            type="password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            required
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
          />
        </label>
        {err ? <p className={styles.error}>{err}</p> : null}
        {msg ? <p className={styles.banner}>{msg}</p> : null}
        <button className={styles.btnPrimary} type="submit" disabled={busy}>
          {busy ? "Guardando…" : "Guardar"}
        </button>
      </form>
    </div>
  );
}
