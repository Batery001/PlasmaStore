import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { parseResponseJson } from "../lib/parseResponseJson";
import styles from "./pages.module.css";

type LoginLocationState = { from?: { pathname: string; search?: string } | string };

function resolveFrom(state: LoginLocationState | null): string {
  const raw = state?.from;
  if (!raw) return "/catalogo";
  if (typeof raw === "string") return raw || "/catalogo";
  const path = raw.pathname || "/catalogo";
  const search = raw.search || "";
  return `${path}${search}`;
}

export function Login() {
  const { refresh } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const from = resolveFrom((location.state as LoginLocationState | null) ?? null);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [otp, setOtp] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (pendingToken) {
        const res = await fetch("/api/store/login/2fa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ pending_token: pendingToken, code: otp.trim() }),
        });
        const data = await parseResponseJson<{ ok?: boolean; error?: string }>(res);
        if (!res.ok) throw new Error(data.error || "Código 2FA inválido");
        await refresh();
        nav(from, { replace: true });
        return;
      }

      const res = await fetch("/api/store/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: loginId.trim(), password: password.trim() }),
      });
      const data = await parseResponseJson<{
        ok?: boolean;
        error?: string;
        requires_2fa?: boolean;
        pending_token?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || "Error al entrar");
      if (data.requires_2fa && data.pending_token) {
        setPendingToken(data.pending_token);
        return;
      }
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
      <h1 className={styles.pageTitle}>{pendingToken ? "Verificación 2FA" : "Entrar"}</h1>
      <form className={styles.form} onSubmit={(e) => void onSubmit(e)}>
        {!pendingToken ? (
          <>
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
          </>
        ) : (
          <label className={styles.label}>
            Código del autenticador
            <input
              className={styles.input}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6 dígitos"
              required
            />
          </label>
        )}
        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.btnPrimary} type="submit" disabled={busy}>
          {busy ? "Entrando…" : pendingToken ? "Confirmar" : "Entrar"}
        </button>
        {pendingToken ? (
          <button
            type="button"
            className={styles.linkbtn}
            onClick={() => {
              setPendingToken(null);
              setOtp("");
            }}
          >
            Volver
          </button>
        ) : null}
      </form>
      <p className={styles.muted}>
        ¿No tienes cuenta? <Link to="/registro">Regístrate</Link>
        {" · "}
        <Link to="/olvide-password">Olvidé mi contraseña</Link>
      </p>
    </div>
  );
}
