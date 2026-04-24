import { FormEvent, useEffect, useState } from "react";
import { parseResponseJson } from "../lib/parseResponseJson";
import adminStyles from "../admin/admin.module.css";

type CatalogRow = { id: number; name: string; active: number; stock: number };

type CarouselCfg = {
  enabled: boolean;
  autoMs: number;
  maxSlides: number;
  productIds: number[];
};

const SLOT_CAP = 6;

export function AdminWidgets() {
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [autoMs, setAutoMs] = useState("6000");
  const [maxSlides, setMaxSlides] = useState(6);
  /** Una entrada por posición (índice 0 = primera diapositiva); vacío = hueco */
  const [slots, setSlots] = useState<string[]>(() => Array(SLOT_CAP).fill(""));
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/store/admin/widgets", { credentials: "include" });
      const data = await parseResponseJson<{
        error?: string;
        carousel?: CarouselCfg;
        catalogProducts?: CatalogRow[];
      }>(res);
      if (!res.ok) throw new Error(data.error || "Error al cargar");
      const c = data.carousel ?? { enabled: true, autoMs: 6000, maxSlides: 6, productIds: [] };
      setCatalog(data.catalogProducts ?? []);
      setEnabled(c.enabled !== false);
      setAutoMs(String(c.autoMs ?? 6000));
      const ms = Math.min(SLOT_CAP, Math.max(1, c.maxSlides ?? 6));
      setMaxSlides(ms);
      const next = Array(SLOT_CAP).fill("");
      (c.productIds ?? []).slice(0, ms).forEach((id, i) => {
        next[i] = String(id);
      });
      setSlots(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    const ms = Math.min(SLOT_CAP, Math.max(1, maxSlides));
    const ids: number[] = [];
    for (let i = 0; i < ms; i++) {
      const v = slots[i]?.trim();
      if (!v) continue;
      const n = parseInt(v, 10);
      if (Number.isFinite(n) && n > 0) ids.push(n);
    }
    const am = parseInt(autoMs, 10);
    const res = await fetch("/api/store/admin/widgets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        carousel: {
          enabled,
          autoMs: Number.isFinite(am) ? am : 6000,
          maxSlides: ms,
          productIds: ids,
        },
      }),
    });
    const data = await parseResponseJson<{ error?: string }>(res);
    if (!res.ok) {
      setErr(data.error || "No se pudo guardar");
      return;
    }
    setMsg("Configuración del carrusel guardada.");
    await load();
  }

  function useCatalogOrder() {
    const ms = Math.min(SLOT_CAP, Math.max(1, maxSlides));
    setSlots(Array(SLOT_CAP).fill(""));
    setMsg(null);
    setErr(null);
    void (async () => {
      const res = await fetch("/api/store/admin/widgets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          carousel: {
            enabled,
            autoMs: parseInt(autoMs, 10) || 6000,
            maxSlides: ms,
            productIds: [],
          },
        }),
      });
      const data = await parseResponseJson<{ error?: string }>(res);
      if (!res.ok) {
        setErr(data.error || "Error");
        return;
      }
      setMsg("Carrusel en modo automático: se muestran los primeros productos activos del catálogo.");
      await load();
    })();
  }

  if (loading) return <p className={adminStyles.muted}>Cargando widgets…</p>;

  return (
    <div>
      <h1 className={adminStyles.pageTitle}>Widgets</h1>
      <p className={adminStyles.pageLead}>
        Controla el carrusel de la portada (Destacados). Más adelante se pueden registrar otros widgets en esta misma
        pantalla.
      </p>

      {err && <p className={adminStyles.error}>{err}</p>}
      {msg && <p className={adminStyles.banner}>{msg}</p>}

      <div className={adminStyles.panelCard}>
        <h2>Carrusel principal (Destacados)</h2>
        <p className={adminStyles.muted}>
          Elige hasta {SLOT_CAP} productos y el orden. Si dejas la lista vacía y guardas con «Automático», se usan los
          primeros productos activos del catálogo (como hasta ahora).
        </p>

        <form onSubmit={onSave}>
          <label className={adminStyles.label} style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Mostrar carrusel en la tienda
          </label>

          <div className={adminStyles.formGrid} style={{ marginTop: "1rem" }}>
            <label className={adminStyles.label}>
              Máximo de diapositivas (1–{SLOT_CAP})
              <select
                className={adminStyles.input}
                value={maxSlides}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setMaxSlides(Number.isFinite(n) ? n : 6);
                }}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className={adminStyles.label}>
              Rotación automática (ms, 0 = off)
              <input
                className={adminStyles.input}
                value={autoMs}
                onChange={(e) => setAutoMs(e.target.value)}
                placeholder="6000"
              />
            </label>
          </div>

          <h3 className={adminStyles.subTitle} style={{ marginTop: "1.25rem" }}>
            Orden en el carrusel
          </h3>
          <div className={adminStyles.tableWrap}>
            <table className={adminStyles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Producto</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: maxSlides }, (_, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>
                      <select
                        className={adminStyles.input}
                        style={{ width: "100%", maxWidth: "420px" }}
                        value={slots[i] ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setSlots((prev) => {
                            const copy = [...prev];
                            copy[i] = v;
                            return copy;
                          });
                        }}
                      >
                        <option value="">— Vacío —</option>
                        {catalog.map((p) => (
                          <option key={p.id} value={String(p.id)}>
                            #{p.id} · {p.name}
                            {p.active ? "" : " (inactivo)"}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={adminStyles.rowActions} style={{ marginTop: "1rem" }}>
            <button type="submit" className={adminStyles.btnPrimary}>
              Guardar carrusel
            </button>
            <button type="button" className={adminStyles.btn} onClick={useCatalogOrder}>
              Modo automático (catálogo)
            </button>
          </div>
        </form>
      </div>

      <div className={adminStyles.panelCard}>
        <h2>Próximos widgets</h2>
        <p className={adminStyles.muted}>
          Aquí podrás añadir más bloques (banners, segunda fila destacada, texto legal, etc.) cuando los definamos en
          el backend; la misma pantalla podrá guardar más tipos además del carrusel.
        </p>
      </div>
    </div>
  );
}
