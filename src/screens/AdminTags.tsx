import { useEffect, useMemo, useState } from "react";
import pageStyles from "./pages.module.css";

type TagRow = {
  _id: number;
  name: string;
  slug: string;
  order?: number;
  active?: number;
};

function slugify(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function AdminTags() {
  const [rows, setRows] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [order, setOrder] = useState("999");
  const [active, setActive] = useState(true);

  const [busy, setBusy] = useState(false);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name));
  }, [rows]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/store/admin/tags", { credentials: "include" });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "No se pudo cargar.");
      setRows(Array.isArray(j.tags) ? j.tags : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createTag() {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        slug: slugify(slug || name),
        order: parseInt(order || "999", 10),
        active,
      };
      const r = await fetch("/api/store/admin/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "No se pudo crear.");
      setName("");
      setSlug("");
      setOrder("999");
      setActive(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(t: TagRow) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/store/admin/tags/${t._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ active: t.active === 0 ? 1 : 0 }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "No se pudo actualizar.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className={pageStyles.pageTitle}>Etiquetas / categorías</h1>
      <p className={pageStyles.lead}>
        Aquí defines etiquetas como <b>Pokémon</b>, <b>Mitos y Leyendas</b>, <b>Singles</b>, etc. El menú PRODUCTOS se
        alimenta de esta lista automáticamente.
      </p>

      {error && <p className={pageStyles.error}>{error}</p>}

      <div className={pageStyles.formCard}>
        <h2 className={pageStyles.subTitle} style={{ marginTop: 0 }}>
          Crear etiqueta
        </h2>

        <div className={pageStyles.form}>
          <label className={pageStyles.label}>
            Nombre
            <input className={pageStyles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Pokémon" />
          </label>

          <label className={pageStyles.label}>
            Slug (opcional)
            <input
              className={pageStyles.input}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="pokemon"
            />
          </label>

          <label className={pageStyles.label}>
            Orden
            <input className={pageStyles.input} value={order} onChange={(e) => setOrder(e.target.value)} />
          </label>

          <label className={pageStyles.label} style={{ flexDirection: "row", alignItems: "center", gap: "0.6rem" }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Activa
          </label>

          <button className={pageStyles.btnPrimary} type="button" disabled={busy || !name.trim()} onClick={createTag}>
            {busy ? "Guardando…" : "Crear"}
          </button>
        </div>
      </div>

      <div className={pageStyles.formCard}>
        <h2 className={pageStyles.subTitle} style={{ marginTop: 0 }}>
          Etiquetas existentes
        </h2>

        {loading ? (
          <p className={pageStyles.muted}>Cargando…</p>
        ) : sorted.length === 0 ? (
          <p className={pageStyles.muted}>Aún no hay etiquetas.</p>
        ) : (
          <div className={pageStyles.grid} style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {sorted.map((t) => (
              <div key={t._id} className={pageStyles.card}>
                <h3 className={pageStyles.cardTitle} style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
                  <span>{t.name}</span>
                  <span style={{ color: t.active === 0 ? "rgba(148,163,184,0.9)" : "rgba(74,222,128,0.9)" }}>
                    {t.active === 0 ? "Inactiva" : "Activa"}
                  </span>
                </h3>
                <p className={pageStyles.cardDesc}>
                  <b>slug:</b> {t.slug}
                  <br />
                  <b>orden:</b> {t.order ?? 999}
                </p>
                <button className={pageStyles.btnGhost} type="button" disabled={busy} onClick={() => toggleActive(t)}>
                  {t.active === 0 ? "Activar" : "Desactivar"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

