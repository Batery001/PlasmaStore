import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth, type StoreUser } from "../auth/AuthContext";
import { PasswordRequirements } from "../components/PasswordRequirements";
import { formatCLP } from "../lib/money";
import { parseResponseJson } from "../lib/parseResponseJson";
import { PASSWORD_MIN_LENGTH, passwordValidationError } from "../lib/passwordRules";
import { maskRutInput, parseAndValidateRut } from "../lib/rut";
import styles from "./profile.module.css";

type Order = {
  _id: number;
  status?: string;
  total_cents?: number;
  subtotal_cents?: number;
  shipping_fee_cents?: number;
  createdAt?: string;
  items?: Array<{ name: string; price_cents: number; quantity: number }>;
  payment?: { provider?: string; buyOrder?: string; token?: string; url?: string; commit?: unknown };
  history?: Array<{ at?: string; status?: string; note?: string }>;
  shipping_proof?: {
    url?: string | null;
    filename?: string | null;
    tracking_code?: string | null;
    note?: string | null;
  } | null;
  fulfillment?: {
    method?: string;
    label?: string;
    recipient?: string | null;
    phone?: string | null;
    notes?: string | null;
    pickup_address?: string | null;
    shipping_note?: string | null;
    address?: { street?: string; apartment?: string; commune?: string; region?: string } | null;
  };
};

type TabId = "info" | "compras" | "seguridad" | "privacidad";

function statusLabel(s: string | undefined) {
  const map: Record<string, string> = {
    pending_payment: "Pendiente pago",
    paid: "Pagado",
    processing: "Procesando",
    shipped: "Enviado",
    completed: "Completado",
    cancelled: "Cancelado",
    refunded: "Reembolsado",
    payment_failed: "Pago fallido",
  };
  return s ? map[s] || s : "—";
}

function prettyDate(iso: string | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function initialsFrom(profile: StoreUser | null, fallbackEmail: string) {
  const first = String(profile?.first_name || "").trim();
  const last = String(profile?.last_name || "").trim();
  if (first || last) {
    return `${first.charAt(0)}${last.charAt(0) || first.charAt(1) || ""}`.toUpperCase() || "?";
  }
  const user = String(profile?.username || "").trim();
  if (user) return user.slice(0, 2).toUpperCase();
  const mail = String(profile?.email || fallbackEmail || "?").trim();
  return mail.slice(0, 2).toUpperCase();
}

function displayName(profile: StoreUser | null, fallback: StoreUser) {
  const first = String(profile?.first_name || "").trim();
  const last = String(profile?.last_name || "").trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;
  const user = String(profile?.username || fallback.username || "").trim();
  if (user) return user;
  return String(profile?.email || fallback.email || "Cuenta Plasma");
}

export function Profile() {
  const { user, loading, refresh } = useAuth();
  const nav = useNavigate();
  const location = useLocation();

  const [tab, setTab] = useState<TabId>("info");
  const [profile, setProfile] = useState<StoreUser | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<number | null>(null);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [rut, setRut] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const selectedOrder = useMemo(() => orders.find((o) => o._id === selected) || null, [orders, selected]);
  const verified = Boolean(profile?.email_verified || user?.email_verified);
  const name = user ? displayName(profile, user) : "";
  const initials = user ? initialsFrom(profile, user.email) : "?";
  const handle = profile?.username ? `@${profile.username}` : profile?.email || user?.email || "";

  useEffect(() => {
    if (loading) return;
    if (!user) {
      nav("/login", { state: { from: { pathname: location.pathname } } });
      return;
    }

    setErr(null);
    setMsg(null);
    fetch("/api/store/me", { credentials: "include" })
      .then((r) => parseResponseJson<{ user?: StoreUser | null; error?: string }>(r).then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) throw new Error(j.error || "No se pudo cargar perfil.");
        setProfile(j.user ?? null);
        const u = j.user;
        setUsername(String(u?.username ?? ""));
        setFirstName(String(u?.first_name ?? ""));
        setLastName(String(u?.last_name ?? ""));
        setRut(String(u?.rut ?? ""));
        setBirthDay(u?.birth_day != null ? String(u.birth_day) : "");
        setBirthMonth(u?.birth_month != null ? String(u.birth_month) : "");
        setBirthYear(u?.birth_year != null ? String(u.birth_year) : "");
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, [loading, user, nav, location.pathname]);

  useEffect(() => {
    if (!user) return;
    if (tab !== "compras") return;
    fetch("/api/store/orders", { credentials: "include" })
      .then((r) => parseResponseJson<{ ok?: boolean; orders?: Order[]; error?: string }>(r).then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok || !j?.ok) throw new Error(j?.error || "No se pudo cargar historial.");
        setOrders(Array.isArray(j.orders) ? j.orders : []);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, [tab, user]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      if (!parseAndValidateRut(rut)) {
        throw new Error("RUT inválido. Usa el formato 12.345.678-9.");
      }
      const res = await fetch("/api/store/me", {
        method: "PATCH",
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
        }),
      });
      const data = await parseResponseJson<{ ok?: boolean; user?: StoreUser | null; error?: string }>(res);
      if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo guardar.");
      setProfile(data.user ?? profile);
      await refresh();
      setMsg("Perfil actualizado.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function exportMyData() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/store/me/export", { credentials: "include" });
      const data = await parseResponseJson<{ ok?: boolean; error?: string; export?: unknown }>(res);
      if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo exportar.");
      const blob = new Blob([JSON.stringify(data.export, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `plasma-store-mis-datos-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg("Descarga lista: tus datos en JSON.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteMyAccount() {
    if (deleteConfirm.trim().toUpperCase() !== "ELIMINAR") {
      setErr('Escribe ELIMINAR para confirmar.');
      return;
    }
    if (!window.confirm("¿Seguro? Se anonimizará tu cuenta y no podrás volver a entrar.")) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/store/me/delete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "ELIMINAR" }),
      });
      const data = await parseResponseJson<{ ok?: boolean; error?: string; message?: string }>(res);
      if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo eliminar.");
      await refresh();
      nav("/", { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
      setBusy(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const weak = passwordValidationError(newPassword);
    if (weak) {
      setErr(weak);
      return;
    }
    if (newPassword !== newPassword2) {
      setErr("Las contraseñas nuevas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/store/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      const j = await parseResponseJson<{ error?: string; message?: string }>(res);
      if (!res.ok) throw new Error(j.error || "No se pudo cambiar.");
      setMsg(j.message || "Contraseña actualizada.");
      setCurrentPassword("");
      setNewPassword("");
      setNewPassword2("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  function resendVerify() {
    fetch("/api/store/auth/request-verify", { method: "POST", credentials: "include" })
      .then((r) => parseResponseJson<{ message?: string; error?: string }>(r).then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => setMsg(ok ? j.message || "Enviado." : j.error || "No se pudo enviar."))
      .catch(() => setErr("No se pudo reenviar el correo."));
  }

  if (loading) return <p className={styles.muted}>Cargando…</p>;
  if (!user) return null;

  const birthLabel =
    birthDay && birthMonth && birthYear ? `${birthDay}/${birthMonth}/${birthYear}` : "Sin indicar";

  return (
    <div className={styles.shell}>
      <div className={styles.cover} aria-hidden>
        <span className={styles.coverMark}>Plasma Store</span>
      </div>

      <header className={styles.identity}>
        <div className={styles.avatarWrap}>
          <div className={styles.avatar} aria-hidden>
            {initials}
          </div>
        </div>
        <div className={styles.idText}>
          <h1 className={styles.displayName}>{name}</h1>
          <p className={styles.handle}>{handle}</p>
          <div className={styles.badgeRow}>
            {verified ? (
              <span className={`${styles.badge} ${styles.badgeOk}`}>Correo verificado</span>
            ) : (
              <span className={`${styles.badge} ${styles.badgeWarn}`}>Sin verificar</span>
            )}
            {user.role === "admin" ? <span className={styles.badge}>Admin</span> : null}
          </div>
        </div>
      </header>

      <nav className={styles.tabs} aria-label="Secciones del perfil">
        <button
          type="button"
          className={`${styles.tab} ${tab === "info" ? styles.tabActive : ""}`}
          onClick={() => setTab("info")}
        >
          Información
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "compras" ? styles.tabActive : ""}`}
          onClick={() => setTab("compras")}
        >
          Mis compras
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "seguridad" ? styles.tabActive : ""}`}
          onClick={() => setTab("seguridad")}
        >
          Seguridad
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "privacidad" ? styles.tabActive : ""}`}
          onClick={() => setTab("privacidad")}
        >
          Privacidad
        </button>
      </nav>

      {msg ? <p className={`${styles.flash} ${styles.flashOk}`}>{msg}</p> : null}
      {err ? <p className={`${styles.flash} ${styles.flashErr}`}>{err}</p> : null}

      <div className={styles.body}>
        <aside className={styles.sideCol}>
          <section className={styles.box}>
            <h2 className={styles.boxHead}>Información</h2>
            <div className={styles.boxBody}>
              <ul className={styles.infoList}>
                <li>
                  <span className={styles.infoKey}>Correo</span>
                  <span className={styles.infoVal}>{profile?.email || user.email}</span>
                </li>
                <li>
                  <span className={styles.infoKey}>RUT</span>
                  <span className={styles.infoVal}>{profile?.rut || rut || "Sin indicar"}</span>
                </li>
                <li>
                  <span className={styles.infoKey}>Usuario</span>
                  <span className={styles.infoVal}>{profile?.username || username || "—"}</span>
                </li>
                <li>
                  <span className={styles.infoKey}>Nacimiento</span>
                  <span className={styles.infoVal}>{birthLabel}</span>
                </li>
              </ul>
            </div>
          </section>

          <section className={styles.box}>
            <h2 className={styles.boxHead}>Redes Plasma</h2>
            <div className={styles.boxBody}>
              <ul className={styles.sideLinks}>
                <li>
                  <Link to="/catalogo">Catálogo</Link>
                </li>
                <li>
                  <Link to="/eventos">Eventos</Link>
                </li>
                <li>
                  <Link to="/carrito">Carrito</Link>
                </li>
                <li>
                  <button type="button" onClick={() => setTab("compras")}>
                    Ver mis compras
                  </button>
                </li>
              </ul>
            </div>
          </section>
        </aside>

        <div className={styles.mainCol}>
          {tab === "info" ? (
            <section className={styles.box}>
              <h2 className={styles.boxHead}>Editar información</h2>
              <div className={styles.boxBody}>
                {!verified && user.role !== "admin" ? (
                  <p className={styles.flash}>
                    Verifica tu correo para mayor seguridad.{" "}
                    <button type="button" className={styles.linkish} onClick={resendVerify}>
                      Reenviar verificación
                    </button>
                  </p>
                ) : null}

                <form className={styles.form} onSubmit={saveProfile}>
                  <div className={styles.fieldRow}>
                    <label className={styles.fieldLabel} htmlFor="pf-username">
                      Nombre de usuario
                    </label>
                    <div className={styles.fieldControl}>
                      <input
                        id="pf-username"
                        className={styles.input}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="username"
                        required
                      />
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <label className={styles.fieldLabel} htmlFor="pf-first">
                      Nombre
                    </label>
                    <div className={styles.fieldControl}>
                      <input
                        id="pf-first"
                        className={styles.input}
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <label className={styles.fieldLabel} htmlFor="pf-last">
                      Apellido
                    </label>
                    <div className={styles.fieldControl}>
                      <input
                        id="pf-last"
                        className={styles.input}
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <label className={styles.fieldLabel} htmlFor="pf-rut">
                      RUT
                    </label>
                    <div className={styles.fieldControl}>
                      <input
                        id="pf-rut"
                        className={styles.input}
                        value={rut}
                        onChange={(e) => setRut(maskRutInput(e.target.value))}
                        placeholder="12.345.678-9"
                        required
                        autoComplete="off"
                      />
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <span className={styles.fieldLabel}>Fecha de nacimiento</span>
                    <div className={styles.fieldControl}>
                      <div className={styles.triple}>
                        <input
                          className={styles.input}
                          inputMode="numeric"
                          placeholder="Día"
                          aria-label="Día"
                          value={birthDay}
                          onChange={(e) => setBirthDay(e.target.value)}
                          required
                        />
                        <input
                          className={styles.input}
                          inputMode="numeric"
                          placeholder="Mes"
                          aria-label="Mes"
                          value={birthMonth}
                          onChange={(e) => setBirthMonth(e.target.value)}
                          required
                        />
                        <input
                          className={styles.input}
                          inputMode="numeric"
                          placeholder="Año"
                          aria-label="Año"
                          value={birthYear}
                          onChange={(e) => setBirthYear(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                  </div>
                  <div className={styles.actions}>
                    <button className={styles.btnPrimary} type="submit" disabled={busy}>
                      {busy ? "Guardando…" : "Guardar cambios"}
                    </button>
                  </div>
                </form>
              </div>
            </section>
          ) : null}

          {tab === "compras" ? (
            <section className={styles.box}>
              <h2 className={styles.boxHead}>Historial de compras</h2>
              <div className={styles.boxBody}>
                {orders.length === 0 ? (
                  <p className={`${styles.muted} ${styles.emptyHint}`}>
                    Aún no tienes compras. <Link to="/catalogo">Ir al catálogo</Link>
                  </p>
                ) : (
                  <>
                    <ul className={styles.orderList}>
                      {orders.map((o) => (
                        <li key={o._id} className={styles.orderRow}>
                          <div>
                            <strong>Orden #{o._id}</strong>
                            <div className={styles.orderMeta}>
                              {statusLabel(o.status)} · {prettyDate(o.createdAt)} ·{" "}
                              {Array.isArray(o.items) ? o.items.length : 0} ítems
                            </div>
                          </div>
                          <div className={styles.orderRight}>
                            <strong>{formatCLP(o.total_cents || 0)}</strong>
                            <button type="button" className={styles.btnGhost} onClick={() => setSelected(o._id)}>
                              Ver
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>

                    {selectedOrder ? (
                      <div className={styles.detail}>
                        <div className={styles.detailHead}>
                          <h3 className={styles.detailTitle}>Orden #{selectedOrder._id}</h3>
                          <button type="button" className={styles.linkish} onClick={() => setSelected(null)}>
                            Cerrar
                          </button>
                        </div>
                        <p className={styles.muted}>
                          Estado: <strong>{statusLabel(selectedOrder.status)}</strong> · Total:{" "}
                          <strong>{formatCLP(selectedOrder.total_cents || 0)}</strong>
                        </p>
                        <p className={styles.muted} style={{ marginTop: "0.35rem" }}>
                          <a href={`/api/store/orders/${selectedOrder._id}/boleta`} target="_blank" rel="noreferrer">
                            Ver / imprimir boleta de venta
                          </a>
                          {" · "}
                          <Link to="/devoluciones">Cambios y devoluciones</Link>
                        </p>
                        {selectedOrder.shipping_proof?.tracking_code || selectedOrder.shipping_proof?.url ? (
                          <div className={styles.muted} style={{ marginTop: "0.5rem" }}>
                            <strong>Seguimiento de envío</strong>
                            {selectedOrder.shipping_proof.tracking_code ? (
                              <div>Código: {selectedOrder.shipping_proof.tracking_code}</div>
                            ) : null}
                            {selectedOrder.shipping_proof.url ? (
                              <div>
                                <a href={selectedOrder.shipping_proof.url} target="_blank" rel="noreferrer">
                                  Ver comprobante
                                  {selectedOrder.shipping_proof.filename
                                    ? ` (${selectedOrder.shipping_proof.filename})`
                                    : ""}
                                </a>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        {selectedOrder.fulfillment ? (
                          <div className={styles.muted} style={{ marginTop: "0.5rem" }}>
                            <strong>{selectedOrder.fulfillment.label || "Entrega"}</strong>
                            {selectedOrder.fulfillment.method === "pickup" &&
                            selectedOrder.fulfillment.pickup_address ? (
                              <div>{selectedOrder.fulfillment.pickup_address}</div>
                            ) : null}
                            {selectedOrder.fulfillment.shipping_note ? (
                              <div>{selectedOrder.fulfillment.shipping_note}</div>
                            ) : null}
                            {selectedOrder.fulfillment.address ? (
                              <div>
                                {[
                                  selectedOrder.fulfillment.address.street,
                                  selectedOrder.fulfillment.address.apartment,
                                  selectedOrder.fulfillment.address.commune,
                                  selectedOrder.fulfillment.address.region,
                                ]
                                  .filter(Boolean)
                                  .join(", ")}
                              </div>
                            ) : null}
                            {selectedOrder.fulfillment.phone ? (
                              <div>Tel: {selectedOrder.fulfillment.phone}</div>
                            ) : null}
                            {selectedOrder.fulfillment.notes ? (
                              <div>Notas: {selectedOrder.fulfillment.notes}</div>
                            ) : null}
                          </div>
                        ) : null}
                        {Array.isArray(selectedOrder.items) && selectedOrder.items.length > 0 ? (
                          <ul className={styles.itemList}>
                            {selectedOrder.items.map((it, idx) => (
                              <li key={idx}>
                                {it.quantity}× {it.name} — {formatCLP((it.price_cents || 0) * (it.quantity || 0))}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </section>
          ) : null}

          {tab === "seguridad" ? (
            <section className={styles.box}>
              <h2 className={styles.boxHead}>Cambiar contraseña</h2>
              <div className={styles.boxBody}>
                <form className={styles.form} onSubmit={(e) => void changePassword(e)}>
                  <div className={styles.fieldRow}>
                    <label className={styles.fieldLabel} htmlFor="pf-cur-pass">
                      Contraseña actual
                    </label>
                    <div className={styles.fieldControl}>
                      <input
                        id="pf-cur-pass"
                        className={styles.input}
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                      />
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <label className={styles.fieldLabel} htmlFor="pf-new-pass">
                      Nueva contraseña
                    </label>
                    <div className={styles.fieldControl}>
                      <input
                        id="pf-new-pass"
                        className={styles.input}
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        minLength={PASSWORD_MIN_LENGTH}
                        autoComplete="new-password"
                      />
                      <PasswordRequirements password={newPassword} />
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <label className={styles.fieldLabel} htmlFor="pf-new-pass2">
                      Confirmar nueva
                    </label>
                    <div className={styles.fieldControl}>
                      <input
                        id="pf-new-pass2"
                        className={styles.input}
                        type="password"
                        value={newPassword2}
                        onChange={(e) => setNewPassword2(e.target.value)}
                        required
                        minLength={PASSWORD_MIN_LENGTH}
                        autoComplete="new-password"
                      />
                    </div>
                  </div>
                  <div className={styles.actions}>
                    <button className={styles.btnPrimary} type="submit" disabled={busy}>
                      Actualizar contraseña
                    </button>
                  </div>
                </form>
              </div>
            </section>
          ) : null}

          {tab === "privacidad" ? (
            <section className={styles.box}>
              <h2 className={styles.boxHead}>Tus datos</h2>
              <div className={styles.boxBody}>
                <p className={styles.muted}>
                  Puedes descargar una copia de tu información o solicitar la eliminación de la cuenta. Ver{" "}
                  <Link to="/privacidad">política de privacidad</Link>.
                </p>
                <div className={styles.actions}>
                  <button type="button" className={styles.btnPrimary} disabled={busy} onClick={() => void exportMyData()}>
                    Exportar mis datos
                  </button>
                </div>
                {user.role !== "admin" ? (
                  <>
                    <h3 className={styles.detailTitle} style={{ marginTop: "1.25rem" }}>
                      Eliminar cuenta
                    </h3>
                    <p className={styles.muted}>
                      Se anonimiza tu perfil y se cierra la sesión. Los pedidos pueden conservarse despersonalizados
                      por obligación legal. Escribe <strong>ELIMINAR</strong> para confirmar.
                    </p>
                    <div className={styles.fieldRow} style={{ borderBottom: "none" }}>
                      <label className={styles.fieldLabel} htmlFor="pf-del">
                        Confirmación
                      </label>
                      <div className={styles.fieldControl}>
                        <input
                          id="pf-del"
                          className={styles.input}
                          value={deleteConfirm}
                          onChange={(e) => setDeleteConfirm(e.target.value)}
                          placeholder="ELIMINAR"
                          autoComplete="off"
                        />
                      </div>
                    </div>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.btnGhost}
                        disabled={busy}
                        onClick={() => void deleteMyAccount()}
                      >
                        Eliminar mi cuenta
                      </button>
                    </div>
                  </>
                ) : (
                  <p className={styles.muted} style={{ marginTop: "1rem" }}>
                    Las cuentas admin no se eliminan desde aquí.
                  </p>
                )}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
