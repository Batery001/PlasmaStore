import { FormEvent, useCallback, useEffect, useState } from "react";
import adminStyles from "../admin/admin.module.css";

type Coupon = {
  id: number;
  code: string;
  type: string;
  value: number;
  label: string;
  active: boolean;
  max_uses: number;
  used_count: number;
  min_subtotal_cents: number;
};

export function AdminCoupons() {
  const [rows, setRows] = useState<Coupon[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [type, setType] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState("10");
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState("0");
  const [minSub, setMinSub] = useState("0");

  const reload = useCallback(() => {
    setErr(null);
    fetch("/api/store/admin/coupons", { credentials: "include" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok || !j?.ok) throw new Error(j?.error || "No se pudieron cargar cupones");
        setRows(j.coupons || []);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    const r = await fetch("/api/store/admin/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        code,
        type,
        value: Number(value),
        label: label || code,
        max_uses: Number(maxUses) || 0,
        min_subtotal_cents: Number(minSub) || 0,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) {
      setErr(j.error || "No se pudo crear");
      return;
    }
    setMsg(`Cupón ${j.code} creado`);
    setCode("");
    reload();
  }

  return (
    <div>
      <h1 className={adminStyles.pageTitle}>Cupones</h1>
      <p className={adminStyles.muted}>Descuentos por código en el checkout (porcentaje o monto fijo CLP).</p>
      {err ? <p className={adminStyles.error}>{err}</p> : null}
      {msg ? <p className={adminStyles.banner}>{msg}</p> : null}

      <form className={adminStyles.panelCard} onSubmit={onCreate}>
        <div className={adminStyles.formGrid}>
          <label className={adminStyles.label}>
            Código
            <input className={adminStyles.input} value={code} onChange={(e) => setCode(e.target.value)} required />
          </label>
          <label className={adminStyles.label}>
            Tipo
            <select
              className={adminStyles.input}
              value={type}
              onChange={(e) => setType(e.target.value === "fixed" ? "fixed" : "percent")}
            >
              <option value="percent">Porcentaje</option>
              <option value="fixed">Monto fijo (CLP)</option>
            </select>
          </label>
          <label className={adminStyles.label}>
            Valor
            <input className={adminStyles.input} value={value} onChange={(e) => setValue(e.target.value)} required />
          </label>
          <label className={adminStyles.label}>
            Etiqueta
            <input className={adminStyles.input} value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className={adminStyles.label}>
            Máx. usos (0 = ilimitado)
            <input className={adminStyles.input} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
          </label>
          <label className={adminStyles.label}>
            Mín. subtotal CLP
            <input className={adminStyles.input} value={minSub} onChange={(e) => setMinSub(e.target.value)} />
          </label>
        </div>
        <div className={adminStyles.modalActions} style={{ borderTop: "none" }}>
          <button type="submit" className={adminStyles.btnPrimary}>
            Crear cupón
          </button>
        </div>
      </form>

      <div className={adminStyles.panelCard} style={{ marginTop: "1rem" }}>
        <table className={adminStyles.table}>
          <thead>
            <tr>
              <th>Código</th>
              <th>Tipo</th>
              <th>Valor</th>
              <th>Usos</th>
              <th>Mín.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{c.code}</td>
                <td>{c.type}</td>
                <td>{c.value}</td>
                <td>
                  {c.used_count}/{c.max_uses || "∞"}
                </td>
                <td>{c.min_subtotal_cents || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className={adminStyles.muted}>Sin cupones aún.</p> : null}
      </div>
    </div>
  );
}
