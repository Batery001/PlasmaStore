import { Link } from "react-router-dom";
import styles from "./legal.module.css";

type LegalKind = "privacidad" | "terminos" | "cookies" | "devoluciones";

const META: Record<LegalKind, { title: string; updated: string }> = {
  privacidad: { title: "Política de privacidad", updated: "27 de septiembre de 2026" },
  terminos: { title: "Términos y condiciones", updated: "27 de septiembre de 2026" },
  cookies: { title: "Política de cookies", updated: "27 de septiembre de 2026" },
  devoluciones: { title: "Cambios y devoluciones", updated: "27 de septiembre de 2026" },
};

export function LegalPage({ kind }: { kind: LegalKind }) {
  const meta = META[kind];
  return (
    <article className={styles.root}>
      <p className={styles.kicker}>Plasma Store</p>
      <h1 className={styles.title}>{meta.title}</h1>
      <p className={styles.meta}>Última actualización: {meta.updated}</p>

      {kind === "privacidad" ? <PrivacyBody /> : null}
      {kind === "terminos" ? <TermsBody /> : null}
      {kind === "cookies" ? <CookiesBody /> : null}
      {kind === "devoluciones" ? <ReturnsBody /> : null}

      <p className={styles.back}>
        <Link to="/">Volver al inicio</Link>
      </p>
    </article>
  );
}

function PrivacyBody() {
  return (
    <div className={styles.prose}>
      <p>
        Plasma Store («nosotros») trata datos personales de clientes y visitantes de esta tienda online
        conforme a la legislación chilena vigente, incluida la Ley N° 19.628 y, a partir de su vigencia plena,
        la Ley N° 21.719 sobre protección de datos personales.
      </p>
      <h2>1. Responsable</h2>
      <p>
        El responsable del tratamiento es Plasma Store. Para ejercer derechos o consultas sobre tus datos,
        contáctanos por los canales publicados en el sitio (correo de contacto / redes / tienda física).
      </p>
      <h2>2. Qué datos tratamos</h2>
      <ul>
        <li>Identificación: nombre, apellido, nombre de usuario, RUT, fecha de nacimiento.</li>
        <li>Contacto: correo electrónico, teléfono.</li>
        <li>Entrega: dirección, comuna, región y notas de despacho o retiro.</li>
        <li>Comerciales: historial de pedidos, cupos de eventos, comprobantes de pago (vía Webpay/Transbank).</li>
        <li>Técnicos: cookies de sesión e invitado necesarias para el carrito y la autenticación.</li>
      </ul>
      <h2>3. Finalidades y bases</h2>
      <ul>
        <li>
          <strong>Crear y administrar tu cuenta</strong>, evitar cuentas duplicadas (RUT único) y verificar
          identidad — ejecución del contrato / medidas precontractuales y, cuando corresponda, consentimiento.
        </li>
        <li>
          <strong>Procesar compras, envíos, retiros y cupos de eventos</strong>, emitir comprobantes y dar
          soporte postventa.
        </li>
        <li>
          <strong>Cumplir obligaciones legales</strong> (tributarias, de consumo u otras aplicables).
        </li>
        <li>
          <strong>Seguridad</strong>: prevenir fraude, abuso y accesos no autorizados.
        </li>
      </ul>
      <p>
        No usamos tus datos para marketing masivo sin un consentimiento específico adicional. El RUT se solicita
        para identificar al comprador, unificar perfil y envío, y reducir cuentas duplicadas; no se publica ni se
        vende a terceros.
      </p>
      <h2>4. Encargados y destinatarios</h2>
      <p>
        Podemos compartir datos con proveedores estrictamente necesarios: Transbank (Webpay), hosting del sitio,
        correo transaccional (SMTP) y, si aplica, empresas de transporte (p. ej. Starken) para el despacho. Ellos
        tratan datos según nuestras instrucciones y la ley.
      </p>
      <h2>5. Conservación</h2>
      <p>
        Conservamos los datos mientras mantengas la cuenta activa y el tiempo adicional necesario para obligaciones
        legales, reclamaciones o contabilidad. Si eliminas tu cuenta, anonimizamos o borramos datos personales
        identificables, pudiendo conservar registros de pedidos despersonalizados cuando la ley lo exija.
      </p>
      <h2>6. Tus derechos</h2>
      <p>
        Puedes solicitar acceso, rectificación, cancelación/supresión, oposición, portabilidad y bloqueo de tus
        datos. Desde «Mi cuenta» puedes exportar un archivo con tus datos y solicitar la eliminación de la cuenta.
        También puedes escribirnos por los canales de contacto del sitio. Responderemos en los plazos legales.
      </p>
      <h2>7. Seguridad</h2>
      <p>
        Aplicamos medidas razonables (contraseñas cifradas, cookies de sesión, controles de acceso admin). Ningún
        sistema es 100 % seguro; te pedimos no compartir tu contraseña.
      </p>
      <h2>8. Menores</h2>
      <p>
        El sitio está orientado a personas con capacidad para contratar. Si eres menor, usa la tienda con
        autorización de tu representante legal.
      </p>
      <h2>9. Cambios</h2>
      <p>
        Podemos actualizar esta política. La fecha de actualización aparece arriba. El uso continuado del sitio
        tras cambios relevantes implica que fuiste informado; cuando la ley lo exija, pediremos un nuevo
        consentimiento.
      </p>
      <p>
        Ver también: <Link to="/terminos">Términos y condiciones</Link> ·{" "}
        <Link to="/cookies">Cookies</Link>.
      </p>
    </div>
  );
}

function TermsBody() {
  return (
    <div className={styles.prose}>
      <p>
        Estos términos regulan el uso de la tienda online Plasma Store y la compra de productos y cupos de
        eventos. Al registrarte o comprar, aceptas estas condiciones.
      </p>
      <h2>1. Tienda y alcance</h2>
      <p>
        Plasma Store vende productos (cartas, sellados y afines) y puede ofrecer inscripción a eventos/torneos
        sujetos a cupos. Los precios se muestran en pesos chilenos (CLP) salvo indicación distinta.
      </p>
      <h2>2. Cuenta y RUT</h2>
      <p>
        Para crear una cuenta debes entregar datos verídicos, incluido un RUT válido. Un mismo RUT no puede
        asociarse a más de una cuenta activa. Eres responsable de la confidencialidad de tu contraseña.
      </p>
      <h2>3. Pedidos y pago</h2>
      <p>
        El pago online se procesa principalmente vía Webpay (Transbank). Al confirmar el pago, el stock o cupo
        queda comprometido según las reglas del sistema. Los pedidos pueden retirarse en tienda o enviarse según
        las opciones configuradas (p. ej. Starken). Costos y plazos de envío se informan en el checkout.
      </p>
      <h2>4. Eventos / cupos</h2>
      <p>
        Los cupos se gestionan solo por esta página (no por WhatsApp). Cada evento puede definir capacidad, precio,
        métodos de pago (Webpay y/o pago en tienda) y ventana de arrepentimiento. Debes aceptar los términos
        específicos del evento al inscribirte.
      </p>
      <h2>5. Disponibilidad</h2>
      <p>
        El stock mostrado puede cambiar. Si tras el pago no es posible cumplir un ítem por error de inventario,
        te contactaremos para reembolso, cambio o solución equivalente.
      </p>
      <h2>6. Datos personales</h2>
      <p>
        El tratamiento de tus datos se describe en la <Link to="/privacidad">Política de privacidad</Link>. Al
        aceptar estos términos también confirmas haber leído esa política.
      </p>
      <h2>7. Conducta</h2>
      <p>
        Queda prohibido usar el sitio para fraude, abuso técnico, reventa no autorizada de cupos o cualquier
        actividad ilícita. Podemos suspender cuentas que incumplan estas reglas.
      </p>
      <h2>8. Contacto y ley aplicable</h2>
      <p>
        Para reclamos o soporte, usa los canales publicados en el sitio. Estos términos se rigen por las leyes de
        la República de Chile.
      </p>
      <p>
        Ver también: <Link to="/privacidad">Privacidad</Link> · <Link to="/cookies">Cookies</Link>.
      </p>
    </div>
  );
}

function CookiesBody() {
  return (
    <div className={styles.prose}>
      <p>
        Esta página explica qué cookies y tecnologías similares usa Plasma Store.
      </p>
      <h2>1. Cookies esenciales</h2>
      <ul>
        <li>
          <strong>Sesión de cuenta</strong> (<code>ps_session</code>): te mantiene identificado al iniciar sesión.
        </li>
        <li>
          <strong>Invitado</strong> (<code>ps_guest</code>): asocia el carrito si compras sin registrarte.
        </li>
      </ul>
      <p>
        Estas cookies son necesarias para el funcionamiento de la tienda. Sin ellas no podrías iniciar sesión ni
        conservar el carrito. No requieren consentimiento adicional bajo el criterio de cookies estrictamente
        técnicas.
      </p>
      <h2>2. Cookies no esenciales</h2>
      <p>
        Hoy no usamos cookies de publicidad ni analítica de terceros. Si en el futuro las incorporamos, te
        pediremos consentimiento previo y actualizaremos esta política.
      </p>
      <h2>3. Cómo gestionarlas</h2>
      <p>
        Puedes borrar cookies desde la configuración de tu navegador. Si eliminas las cookies de sesión, tendrás
        que volver a iniciar sesión o se vaciará el carrito de invitado.
      </p>
      <h2>4. Más información</h2>
      <p>
        Detalles sobre datos personales: <Link to="/privacidad">Política de privacidad</Link>. Condiciones de
        uso: <Link to="/terminos">Términos</Link>.
      </p>
    </div>
  );
}

function ReturnsBody() {
  return (
    <div className={styles.prose}>
      <p>
        Esta política describe cambios, devoluciones y reembolsos de compras hechas en Plasma Store (web o
        tienda), sin perjuicio de los derechos del consumidor bajo la ley chilena.
      </p>
      <h2>1. Productos sellados y cartas</h2>
      <p>
        Los productos sellados abiertos o con evidencias de uso no son elegibles para devolución, salvo falla de
        origen o error de despacho. Las cartas sueltas (singles) se consideran revisadas al momento de la compra;
        si hay error en el envío (carta distinta), contáctanos con fotos dentro de 48 horas de recibido.
      </p>
      <h2>2. Plazo</h2>
      <p>
        Para productos no personalizados y en perfecto estado, puedes solicitar cambio o devolución dentro de 10
        días corridos desde la recepción o retiro, escribiendo a los canales de contacto del sitio con el número
        de orden.
      </p>
      <h2>3. Reembolsos</h2>
      <p>
        Si el pago fue con Webpay, el reembolso se gestiona por la misma vía cuando corresponde. El plazo de
        abono depende del banco emisor. Órdenes con pago en tienda se resuelven en el local.
      </p>
      <h2>4. Cupos de eventos</h2>
      <p>
        Los cupos siguen las reglas del evento (ventana de arrepentimiento, si existe). Pasado ese plazo, el cupo
        no se libera ni reembolsa salvo cancelación del evento por Plasma Store.
      </p>
      <h2>5. Contacto</h2>
      <p>
        Indica orden, RUT y motivo. Revisaremos caso a caso. Ver también{" "}
        <Link to="/terminos">Términos</Link> y <Link to="/privacidad">Privacidad</Link>.
      </p>
    </div>
  );
}
