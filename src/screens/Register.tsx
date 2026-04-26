import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { parseResponseJson } from "../lib/parseResponseJson";
import styles from "./pages.module.css";

export function Register() {
  const { refresh } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.trim() !== password2.trim()) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/store/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username,
          first_name: firstName,
          last_name: lastName,
          birth_day: birthDay,
          birth_month: birthMonth,
          birth_year: birthYear,
          email,
          password,
          password_confirm: password2,
        }),
      });
      const data = await parseResponseJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "No se pudo registrar");
      await refresh();
      nav("/catalogo");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.narrow}>
      <h1 className={styles.pageTitle}>Registro</h1>
      <form className={styles.form} onSubmit={onSubmit}>
        <label className={styles.label}>
          Nombre de usuario
          <input
            className={`${styles.input} ${styles.inputCompact}`}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className={styles.label}>
          Nombre
          <input
            className={`${styles.input} ${styles.inputCompact}`}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
        </label>
        <label className={styles.label}>
          Apellido
          <input
            className={`${styles.input} ${styles.inputCompact}`}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
        </label>
        <label className={styles.label}>
          Fecha de nacimiento
          <div className={styles.tripleRow}>
            <input
              className={`${styles.input} ${styles.inputCompact}`}
              inputMode="numeric"
              placeholder="Día"
              aria-label="Día de nacimiento"
              value={birthDay}
              onChange={(e) => setBirthDay(e.target.value)}
              required
            />
            <input
              className={`${styles.input} ${styles.inputCompact}`}
              inputMode="numeric"
              placeholder="Mes"
              aria-label="Mes de nacimiento"
              value={birthMonth}
              onChange={(e) => setBirthMonth(e.target.value)}
              required
            />
            <input
              className={`${styles.input} ${styles.inputCompact}`}
              inputMode="numeric"
              placeholder="Año"
              aria-label="Año de nacimiento"
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              required
            />
          </div>
        </label>
        <label className={styles.label}>
          Email
          <input
            className={`${styles.input} ${styles.inputCompact}`}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className={styles.label}>
          Contraseña (mín. 6)
          <input
            className={`${styles.input} ${styles.inputCompact}`}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </label>
        <label className={styles.label}>
          Confirmar contraseña
          <input
            className={`${styles.input} ${styles.inputCompact}`}
            type="password"
            autoComplete="new-password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            minLength={6}
            required
          />
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.btnPrimary} type="submit" disabled={busy}>
          {busy ? "Creando…" : "Crear cuenta"}
        </button>
      </form>
      <p className={styles.muted}>
        ¿Ya tienes cuenta? <Link to="/login">Entrar</Link>
      </p>
    </div>
  );
}
