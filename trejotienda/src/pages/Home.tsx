import { Link } from "react-router-dom";
import styles from "./pages.module.css";

export function Home() {
  return (
    <div className={styles.hero}>
      <p className={styles.kicker}>Tienda de cartas y accesorios</p>
      <h1 className={styles.heroTitle}>Trejotienda</h1>
      <p className={styles.lead}>
        Regístrate como cliente, arma tu carrito y paga en tienda (demo). Los administradores pueden dar de alta
        productos nuevos.
      </p>
      <div className={styles.heroActions}>
        <Link className={styles.btnPrimary} to="/catalogo">
          Ver catálogo
        </Link>
        <Link className={styles.btnGhost} to="/registro">
          Crear cuenta
        </Link>
      </div>
      <p className={styles.hint}>
        Cuenta demo admin: <code>admin@tienda.local</code> / <code>admin123</code>
      </p>
    </div>
  );
}
