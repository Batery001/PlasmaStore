import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth, type StoreUser } from "../auth/AuthContext";
import {
  ProfileTour,
  clearProfileTourPending,
  shouldStartProfileTour,
  type ProfileTourTab,
} from "../components/ProfileTour";
import { PasswordRequirements } from "../components/PasswordRequirements";
import { formatCLP } from "../lib/money";
import { parseResponseJson } from "../lib/parseResponseJson";
import { PASSWORD_MIN_LENGTH, passwordValidationError } from "../lib/passwordRules";
import { maskRutInput, parseAndValidateRut } from "../lib/rut";
import { EventPlayerForm } from "../components/EventPlayerForm";
import { MyDecksPanel } from "./MyDecks";
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

type TabId = "perfil" | "info" | "compras" | "deseos" | "eventos" | "mazos" | "seguridad" | "privacidad";

const PROFILE_TABS: TabId[] = ["perfil", "info", "compras", "deseos", "eventos", "mazos", "seguridad", "privacidad"];

type WishItem = {
  product_id: number;
  name: string;
  price_cents: number;
  stock: number;
  available?: boolean;
  notify?: boolean;
};

function tabFromSearch(search: string): TabId | null {
  const raw = new URLSearchParams(search).get("tab");
  if (raw && PROFILE_TABS.includes(raw as TabId)) return raw as TabId;
  return null;
}

type MyEvent = {
  id: number;
  event_id?: number;
  event_title?: string;
  status?: string;
  payment_method?: string | null;
  price_cents?: number;
  order_id?: number | null;
  createdAt?: string;
  paid_at?: string | null;
  date_label?: string | null;
  place?: string | null;
  starts_at?: string | null;
  started?: boolean;
  popid?: string | null;
  cl?: string | null;
  player_name?: string | null;
  birth_year?: number | null;
  game_tag?: string | null;
  needs_form?: boolean;
  can_edit_race?: boolean;
  can_cancel?: boolean;
  form_open?: boolean;
  form_deadline?: number | null;
  needs_decklist?: boolean;
  needs_guardian?: boolean;
  pokemon_format?: string | null;
  myl_era?: string | null;
  myl_race?: string | null;
  decklist_text?: string | null;
  decklist_url?: string | null;
  guardian_name?: string | null;
  event_player?: { popid?: string; cl?: string; full_name?: string; birth_year?: number; game_tag?: string } | null;
};

function statusLabel(s: string | undefined) {
  const map: Record<string, string> = {
    pending_payment: "Pendiente pago",
    pending_store_payment: "Pagar en tienda",
    paid: "Pagado",
    processing: "Procesando",
    ready_for_pickup: "Listo para retiro",
    shipped: "En camino",
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

  const [tab, setTab] = useState<TabId>(() => tabFromSearch(location.search) || "perfil");
  const [profile, setProfile] = useState<StoreUser | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [wishlist, setWishlist] = useState<WishItem[]>([]);
  const [myEvents, setMyEvents] = useState<MyEvent[]>([]);
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
  const [popid, setPopid] = useState("");
  const [mylCl, setMylCl] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [tourActive, setTourActive] = useState(false);
  const [storeSocials, setStoreSocials] = useState<Array<{ key: string; label: string; url: string }>>([]);

  const selectedOrder = useMemo(() => orders.find((o) => o._id === selected) || null, [orders, selected]);
  const verified = Boolean(profile?.email_verified || user?.email_verified);
  const name = user ? displayName(profile, user) : "";
  const initials = user ? initialsFrom(profile, user.email) : "?";
  const handle = profile?.username ? `@${profile.username}` : profile?.email || user?.email || "";

  useEffect(() => {
    const fromUrl = tabFromSearch(location.search);
    if (fromUrl && fromUrl !== tab) setTab(fromUrl);
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps -- solo sincronizar desde URL

  const goTab = useCallback((next: TabId) => {
    setTab(next);
    const params = new URLSearchParams(window.location.search);
    if (next === "perfil") params.delete("tab");
    else params.set("tab", next);
    const q = params.toString();
    nav(q ? `/perfil?${q}` : "/perfil", { replace: true });
  }, [nav]);

  useEffect(() => {
    if (!user) return;
    const fromQuery = new URLSearchParams(location.search).get("tour") === "1";
    if (fromQuery || shouldStartProfileTour(user.id)) {
      setTourActive(true);
    }
  }, [user, location.search]);

  useEffect(() => {
    let alive = true;
    const labels: Record<string, string> = {
      facebook: "Facebook",
      instagram: "Instagram",
      youtube: "YouTube",
      whatsapp: "WhatsApp",
    };
    fetch("/api/store/site-content")
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive || !ok || !j?.ok) return;
        const socialsObj = j.content?.socials || {};
        const list: Array<{ key: string; label: string; url: string }> = [];
        for (const key of ["instagram", "facebook", "whatsapp", "youtube"]) {
          const row = socialsObj[key];
          if (row?.enabled && row?.url) {
            list.push({ key, label: labels[key] || key, url: row.url });
          }
        }
        setStoreSocials(list);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      nav("/login", { state: { from: { pathname: location.pathname, search: location.search } } });
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
        setPopid(String(u?.popid ?? ""));
        setMylCl(String(u?.myl_cl ?? ""));
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, [loading, user, nav, location.pathname]);

  useEffect(() => {
    if (!user) return;
    if (tab !== "eventos") return;
    fetch("/api/store/me/events", { credentials: "include" })
      .then((r) =>
        parseResponseJson<{ ok?: boolean; events?: MyEvent[]; error?: string }>(r).then((j) => ({ ok: r.ok, j }))
      )
      .then(({ ok, j }) => {
        if (!ok || !j?.ok) throw new Error(j?.error || "No se pudieron cargar tus eventos.");
        setMyEvents(Array.isArray(j.events) ? j.events : []);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, [user, tab]);

  async function cancelEventCup(id: number) {
    if (!window.confirm("¿Cancelar este cupo? Se libera el asiento. Si ya pagaste en línea, el reembolso lo resuelve la tienda. El cupo no se transfiere a otra persona.")) {
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/store/me/events/${id}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const data = await parseResponseJson<{ ok?: boolean; error?: string; message?: string }>(res);
      if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo cancelar.");
      setMsg(data.message || "Cupo cancelado.");
      const r2 = await fetch("/api/store/me/events", { credentials: "include" });
      const j2 = await parseResponseJson<{ ok?: boolean; events?: MyEvent[] }>(r2);
      if (r2.ok && j2.ok) setMyEvents(Array.isArray(j2.events) ? j2.events : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

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

  useEffect(() => {
    if (!user) return;
    if (tab !== "deseos") return;
    fetch("/api/store/wishlist", { credentials: "include" })
      .then((r) =>
        parseResponseJson<{ ok?: boolean; items?: WishItem[]; error?: string }>(r).then((j) => ({ ok: r.ok, j }))
      )
      .then(({ ok, j }) => {
        if (!ok || !j?.ok) throw new Error(j?.error || "No se pudo cargar la lista de deseos.");
        setWishlist(Array.isArray(j.items) ? j.items : []);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, [tab, user]);

  async function removeWish(productId: number) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/store/wishlist/${productId}`, { method: "DELETE", credentials: "include" });
      const j = await parseResponseJson<{ ok?: boolean; error?: string }>(r);
      if (!r.ok || !j.ok) throw new Error(j.error || "No se pudo quitar.");
      setWishlist((prev) => prev.filter((w) => w.product_id !== productId));
      setMsg("Quitado de la lista de deseos.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

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
          popid,
          myl_cl: mylCl,
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
      {tourActive && user ? (
        <ProfileTour
          userId={user.id}
          active={tourActive}
          onGoTab={(t: ProfileTourTab) => goTab(t)}
          onFinished={() => {
            setTourActive(false);
            clearProfileTourPending();
            const params = new URLSearchParams(location.search);
            params.delete("tour");
            const q = params.toString();
            nav(q ? `/perfil?${q}` : "/perfil", { replace: true });
          }}
        />
      ) : null}

      <div className={styles.cover} aria-hidden>
        <span className={styles.coverMark}>Plasma Store</span>
      </div>

      <header className={styles.identity} data-tour="tour-profile-identity">
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
          className={`${styles.tab} ${tab === "perfil" ? styles.tabActive : ""}`}
          data-tour="tour-tab-perfil"
          onClick={() => goTab("perfil")}
        >
          Perfil
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "info" ? styles.tabActive : ""}`}
          data-tour="tour-profile-info"
          onClick={() => goTab("info")}
        >
          Información
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "compras" ? styles.tabActive : ""}`}
          data-tour="tour-tab-compras"
          onClick={() => goTab("compras")}
        >
          Mis compras
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "deseos" ? styles.tabActive : ""}`}
          onClick={() => goTab("deseos")}
        >
          Lista de deseos
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "eventos" ? styles.tabActive : ""}`}
          data-tour="tour-tab-eventos"
          onClick={() => goTab("eventos")}
        >
          Mis eventos
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "mazos" ? styles.tabActive : ""}`}
          data-tour="tour-tab-mazos"
          onClick={() => goTab("mazos")}
        >
          Mis mazos
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "seguridad" ? styles.tabActive : ""}`}
          data-tour="tour-tab-seguridad"
          onClick={() => goTab("seguridad")}
        >
          Seguridad
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "privacidad" ? styles.tabActive : ""}`}
          data-tour="tour-tab-privacidad"
          onClick={() => goTab("privacidad")}
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
                {String(profile?.popid || popid || "").trim() ? (
                  <li>
                    <span className={styles.infoKey}>POPID</span>
                    <span className={styles.infoVal}>{String(profile?.popid || popid).trim()}</span>
                  </li>
                ) : null}
                {String(profile?.myl_cl || mylCl || "").trim() ? (
                  <li>
                    <span className={styles.infoKey}>CL</span>
                    <span className={styles.infoVal}>{String(profile?.myl_cl || mylCl).trim()}</span>
                  </li>
                ) : null}
              </ul>
            </div>
          </section>

        </aside>

        <div className={styles.mainCol}>
          {tab === "perfil" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <section className={styles.box} data-tour="tour-panel-perfil">
                <h2 className={styles.boxHead}>Torneos en tienda</h2>
                <div className={styles.boxBody}>
                  <p className={styles.muted} style={{ marginTop: 0 }}>
                    Mira la agenda de Challenge, Cup y ligas MyL e inscríbete desde la tienda.
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    <Link to="/eventos" className={styles.btnPrimary} style={{ textDecoration: "none" }}>
                      Ver torneos
                    </Link>
                    <button type="button" className={styles.btnGhost} onClick={() => goTab("eventos")}>
                      Mis cupos
                    </button>
                  </div>
                </div>
              </section>
              {storeSocials.length > 0 ? (
                <section className={styles.box}>
                  <h2 className={styles.boxHead}>Dónde se publican</h2>
                  <div className={styles.boxBody}>
                    <p className={styles.muted} style={{ marginTop: 0 }}>
                      Sigue las redes de Plasma Store para enterarte de los torneos.
                    </p>
                    <ul className={styles.sideLinks}>
                      {storeSocials.map((s) => (
                        <li key={s.key}>
                          <a href={s.url} target="_blank" rel="noreferrer noopener">
                            {s.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}

          {tab === "info" ? (
            <section className={styles.box} data-tour="tour-panel-info">
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
                  <div className={styles.fieldRow}>
                    <label className={styles.fieldLabel} htmlFor="pf-popid">
                      POPID
                    </label>
                    <div className={styles.fieldControl}>
                      <input
                        id="pf-popid"
                        className={styles.input}
                        value={popid}
                        onChange={(e) => setPopid(e.target.value)}
                        placeholder="Pokémon"
                        autoComplete="off"
                      />
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <label className={styles.fieldLabel} htmlFor="pf-myl-cl">
                      CL (Mitos y Leyendas)
                    </label>
                    <div className={styles.fieldControl}>
                      <input
                        id="pf-myl-cl"
                        className={styles.input}
                        value={mylCl}
                        onChange={(e) => setMylCl(e.target.value)}
                        placeholder="Código CL"
                        autoComplete="off"
                      />
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

          {tab === "deseos" ? (
            <section className={styles.box}>
              <h2 className={styles.boxHead}>Lista de deseos</h2>
              <div className={styles.boxBody}>
                {wishlist.length === 0 ? (
                  <p className={`${styles.muted} ${styles.emptyHint}`}>
                    Vacía. En productos agotados usa «Avisame» para enterarte del restock.
                  </p>
                ) : (
                  <ul className={styles.orderList}>
                    {wishlist.map((w) => (
                      <li key={w.product_id} className={styles.orderRow}>
                        <div>
                          <strong>
                            <Link to={`/producto/${w.product_id}`}>{w.name}</Link>
                          </strong>
                          <div className={styles.orderMeta}>
                            {formatCLP(w.price_cents)} ·{" "}
                            {w.available ? "Con stock" : "Agotado"}
                            {w.notify !== false && !w.available ? " · aviso activo" : ""}
                          </div>
                        </div>
                        <div className={styles.orderRight}>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            disabled={busy}
                            onClick={() => void removeWish(w.product_id)}
                          >
                            Quitar
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ) : null}

          {tab === "compras" ? (
            <section className={styles.box} data-tour="tour-panel-compras">
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

          {tab === "mazos" ? (
            <div data-tour="tour-panel-mazos">
              <MyDecksPanel />
            </div>
          ) : null}

          {tab === "eventos" ? (
            <section className={styles.box} data-tour="tour-panel-eventos">
              <h2 className={styles.boxHead}>Mis eventos</h2>
              <div className={styles.boxBody}>
                {myEvents.length === 0 ? (
                  <p className={`${styles.muted} ${styles.emptyHint}`}>
                    Aún no tienes cupos. <Link to="/eventos">Ver eventos</Link>
                  </p>
                ) : (
                  <ul className={styles.orderList}>
                    {myEvents.map((ev) => (
                      <li key={ev.id} className={styles.orderRow}>
                        <div>
                          <strong>{ev.event_title || "Evento"}</strong>
                          <div className={styles.orderMeta}>
                            {statusLabel(ev.status)}
                            {ev.date_label ? ` · ${ev.date_label}` : null}
                            {ev.place ? ` · ${ev.place}` : null}
                            {ev.started ? " · ya comenzó" : null}
                            {ev.popid ? ` · POPID ${ev.popid}` : null}
                            {ev.cl ? ` · CL ${ev.cl}` : null}
                            {ev.myl_race ? ` · ${ev.myl_race}` : null}
                            {ev.player_name ? ` · ${ev.player_name}` : null}
                          </div>
                          {ev.needs_form || ev.can_edit_race ? (
                            <EventPlayerForm
                              registration={ev}
                              onSaved={(player) => {
                                setMyEvents((cur) =>
                                  cur.map((x) =>
                                    x.id === ev.id
                                      ? {
                                          ...x,
                                          needs_form: false,
                                          myl_race: player.myl_race || x.myl_race,
                                          cl: player.cl || x.cl,
                                          player_name: player.full_name || x.player_name,
                                          event_player: player,
                                        }
                                      : x,
                                  ),
                                );
                              }}
                            />
                          ) : null}
                        </div>
                        <div className={styles.orderRight}>
                          <strong>{formatCLP(ev.price_cents || 0)}</strong>
                          {ev.can_cancel ? (
                            <button
                              type="button"
                              className={styles.btnGhost}
                              disabled={busy}
                              onClick={() => void cancelEventCup(ev.id)}
                            >
                              Cancelar cupo
                            </button>
                          ) : null}
                          <Link className={styles.btnGhost} to="/eventos">
                            Ver agenda
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ) : null}

          {tab === "seguridad" ? (
            <section className={styles.box} data-tour="tour-panel-seguridad">
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
            <section className={styles.box} data-tour="tour-panel-privacidad">
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
