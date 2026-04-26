import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth, type StoreUser } from "../auth/AuthContext";
import { formatCLP } from "../lib/money";
import { parseResponseJson } from "../lib/parseResponseJson";
import styles from "./pages.module.css";

type Order = {
  _id: number;
  status?: string;
  total_cents?: number;
  createdAt?: string;
  items?: Array<{ name: string; price_cents: number; quantity: number }>;
  payment?: { provider?: string; buyOrder?: string; token?: string; url?: string; commit?: unknown };
  history?: Array<{ at?: string; status?: string; note?: string }>;
};

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

export function Profile() {
  const { user, loading, refresh } = useAuth();
  const nav = useNavigate();
  const location = useLocation();

  const [tab, setTab] = useState<"perfil" | "compras">("perfil");
  const [profile, setProfile] = useState<StoreUser | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<number | null>(null);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");

  const selectedOrder = useMemo(() => orders.find((o) => o._id === selected) || null, [orders, selected]);

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
      const res = await fetch("/api/store/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username,
          first_name: firstName,
          last_name: lastName,
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

  if (loading) return <p className={styles.muted}>Cargando…</p>;
  if (!user) return null;

  return (
    <div className={styles.narrow}>
      <h1 className={styles.pageTitle}>Mi cuenta</h1>

      <div className={styles.heroActions} style={{ justifyContent: "flex-start", marginBottom: "0.75rem" }}>
        <button
          type="button"
          className={tab === "perfil" ? styles.btnPrimary : styles.btnGhost}
          onClick={() => setTab("perfil")}
        >
          Perfil
        </button>
        <button
          type="button"
          className={tab === "compras" ? styles.btnPrimary : styles.btnGhost}
          onClick={() => setTab("compras")}
        >
          Historial
        </button>
      </div>

      {msg ? <p className={styles.banner}>{msg}</p> : null}
      {err ? <p className={styles.error}>{err}</p> : null}

      {tab === "perfil" ? (
        <>
          <p className={styles.muted}>
            Sesión: <strong>{profile?.email || user.email}</strong>
          </p>
          <form className={styles.form} onSubmit={saveProfile}>
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
                  value={birthDay}
                  onChange={(e) => setBirthDay(e.target.value)}
                  required
                />
                <input
                  className={`${styles.input} ${styles.inputCompact}`}
                  inputMode="numeric"
                  placeholder="Mes"
                  value={birthMonth}
                  onChange={(e) => setBirthMonth(e.target.value)}
                  required
                />
                <input
                  className={`${styles.input} ${styles.inputCompact}`}
                  inputMode="numeric"
                  placeholder="Año"
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  required
                />
              </div>
            </label>

            <button className={styles.btnPrimary} type="submit" disabled={busy}>
              {busy ? "Guardando…" : "Guardar cambios"}
            </button>
          </form>
        </>
      ) : (
        <>
          {orders.length === 0 ? (
            <p className={styles.muted}>
              Aún no tienes compras. <Link to="/catalogo">Ir al catálogo</Link>
            </p>
          ) : (
            <>
              <ul className={styles.cartList} style={{ marginTop: "0.5rem" }}>
                {orders.map((o) => (
                  <li key={o._id} className={styles.cartRow} style={{ gridTemplateColumns: "1fr auto" }}>
                    <div>
                      <strong>Orden #{o._id}</strong>
                      <div className={styles.muted}>
                        {statusLabel(o.status)} · {prettyDate(o.createdAt)} · {Array.isArray(o.items) ? o.items.length : 0} ítems
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                      <strong>{formatCLP(o.total_cents || 0)}</strong>
                      <button type="button" className={styles.btnGhost} onClick={() => setSelected(o._id)}>
                        Ver
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              {selectedOrder ? (
                <div className={styles.formCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h2 className={styles.subTitle} style={{ margin: 0 }}>
                      Orden #{selectedOrder._id}
                    </h2>
                    <button type="button" className={styles.linkbtn} onClick={() => setSelected(null)}>
                      Cerrar
                    </button>
                  </div>
                  <div className={styles.muted}>
                    Estado: <strong>{statusLabel(selectedOrder.status)}</strong> · Total:{" "}
                    <strong>{formatCLP(selectedOrder.total_cents || 0)}</strong>
                  </div>
                  {Array.isArray(selectedOrder.items) && selectedOrder.items.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: "1.15rem" }}>
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
        </>
      )}
    </div>
  );
}

