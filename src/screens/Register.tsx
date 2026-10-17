import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { PasswordRequirements } from "../components/PasswordRequirements";
import { parseResponseJson } from "../lib/parseResponseJson";
import { PASSWORD_MIN_LENGTH, passwordValidationError } from "../lib/passwordRules";
import { maskRutInput, parseAndValidateRut } from "../lib/rut";
import styles from "./pages.module.css";

export function Register() {
  const { refresh } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [rut, setRut] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [termsOk, setTermsOk] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const weak = passwordValidationError(password);
    if (weak) {
      setError(weak);
      return;
    }
    if (password.trim() !== password2.trim()) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (!parseAndValidateRut(rut)) {
      setError("RUT inválido. Usa el formato 12.345.678-9.");
      return;
    }
    if (!termsOk) {
      setError("Debes aceptar los términos y la política de privacidad.");
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
          rut,
          birth_day: birthDay,
          birth_month: birthMonth,
          birth_year: birthYear,
          email,
          password,
          password_confirm: password2,
          terms_accepted: true,
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
          RUT
          <input
            className={`${styles.input} ${styles.inputCompact}`}
            value={rut}
            onChange={(e) => setRut(maskRutInput(e.target.value))}
            placeholder="12.345.678-9"
            autoComplete="off"
            inputMode="text"
            required
          />
          <span className={styles.hint}>Debes tener 18 años o más. Un RUT = una cuenta.</span>
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
          Contraseña
          <input
            className={`${styles.input} ${styles.inputCompact}`}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={PASSWORD_MIN_LENGTH}
            required
          />
          <PasswordRequirements password={password} />
        </label>
        <label className={styles.label}>
          Confirmar contraseña
          <input
            className={`${styles.input} ${styles.inputCompact}`}
            type="password"
            autoComplete="new-password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            minLength={PASSWORD_MIN_LENGTH}
            required
          />
        </label>
        <label className={styles.checkRow}>
          <input type="checkbox" checked={termsOk} onChange={(e) => setTermsOk(e.target.checked)} required />
          <span>
            Acepto los <Link to="/terminos">términos y condiciones</Link> y la{" "}
            <Link to="/privacidad">política de privacidad</Link>.
          </span>
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.btnPrimary} type="submit" disabled={busy || !termsOk}>
          {busy ? "Creando…" : "Crear cuenta"}
        </button>
      </form>
      <p className={styles.muted}>
        ¿Ya tienes cuenta? <Link to="/login">Entrar</Link>
      </p>
    </div>
  );
}
