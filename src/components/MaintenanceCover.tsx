import { Link } from "react-router-dom";
import { PlasmaOrbLogo } from "../layout/PlasmaOrbLogo";
import { useAuth } from "../auth/AuthContext";
import styles from "./maintenanceCover.module.css";

export function MaintenanceCover({ message }: { message: string }) {
  const { user, loading, logout } = useAuth();

  return (
    <div className={styles.cover}>
      <div className={styles.glow} aria-hidden />
      <div className={styles.panel}>
        <div className={styles.brand}>
          <PlasmaOrbLogo className={styles.orb} />
          <h1 className={styles.title}>Plasma Store</h1>
        </div>
        <p className={styles.eyebrow}>En mantenimiento</p>
        <p className={styles.message}>{message}</p>
        <p className={styles.hint}>La compra online está pausada por ahora. Podés entrar a tu cuenta con normalidad.</p>
        <div className={styles.actions}>
          {loading ? (
            <span className={styles.muted}>…</span>
          ) : user ? (
            <>
              <Link className={styles.btnPrimary} to="/perfil">
                Mi cuenta
              </Link>
              {(user.role === "admin" || user.role === "staff") && (
                <Link className={styles.btnGhost} to="/admin">
                  Panel
                </Link>
              )}
              <button type="button" className={styles.btnGhost} onClick={() => void logout()}>
                Salir
              </button>
            </>
          ) : (
            <>
              <Link className={styles.btnPrimary} to="/login">
                Entrar
              </Link>
              <Link className={styles.btnGhost} to="/registro">
                Registro
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
