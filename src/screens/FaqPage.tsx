import { Link } from "react-router-dom";
import styles from "./pages.module.css";

export function FaqPage() {
  return (
    <div className={styles.page}>
      <p className={styles.kicker}>Ayuda</p>
      <h1 className={styles.pageTitle}>Cómo comprar</h1>
      <div className={styles.prose}>
        <h2>1. Catálogo</h2>
        <p>
          Entrá a <Link to="/catalogo">Productos</Link>, buscá por nombre o usá los filtros. Podés agregar al
          carrito <strong>sin crear cuenta</strong>.
        </p>
        <h2>2. Carrito y checkout</h2>
        <p>
          Revisá cantidades en <Link to="/carrito">Carrito</Link> y seguí a entrega y pago. Vas a necesitar RUT,
          email y teléfono. Si iniciás sesión después, tu carrito de invitado se fusiona con tu cuenta.
        </p>
        <h2>3. Pago</h2>
        <p>
          Online con <strong>TUU Pago Online</strong> (tarjeta / transferencia / Webpay según lo que TUU tenga
          activo) o <strong>pago en tienda</strong> cuando esté disponible (retiro).
        </p>
        <h2>4. Retiro y envío</h2>
        <p>
          Retiro en Plasma Store o envío Starken (según opciones del checkout). El seguimiento aparece en{" "}
          <Link to="/perfil?tab=pedidos">Mis pedidos</Link> cuando la tienda lo carga.
        </p>
        <h2>5. Eventos / torneos</h2>
        <p>
          Los cupos requieren <Link to="/login">iniciar sesión</Link>, se agregan desde{" "}
          <Link to="/eventos">Eventos</Link> al carrito y se pagan igual que un producto.
        </p>
        <h2>6. Boleta</h2>
        <p>
          Tras el pago te llega un correo con link a la boleta (válido sin sesión). También la ves en el perfil si
          tenés cuenta.
        </p>
        <p>
          Ver también: <Link to="/terminos">Términos</Link> · <Link to="/devoluciones">Devoluciones</Link> ·{" "}
          <Link to="/privacidad">Privacidad</Link>.
        </p>
      </div>
    </div>
  );
}
