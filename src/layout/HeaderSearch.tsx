import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { formatCLP } from "../lib/money";
import { resolveStoreMediaUrl } from "../lib/media";
import { parseResponseJson } from "../lib/parseResponseJson";
import styles from "./layout.module.css";

type Hit = {
  id: number;
  name: string;
  price_cents: number;
  stock: number;
  image_url?: string | null;
};

export function HeaderSearch({ cosmic = false }: { cosmic?: boolean }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(() => (params.get("q") || "").trim());
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setQ((params.get("q") || "").trim());
  }, [params]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      if (!rootRef.current?.contains(ev.target as Node)) setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    const handle = window.setTimeout(() => {
      fetch(`/api/store/products?limit=80`, { credentials: "include" })
        .then(async (r) => parseResponseJson<{ products?: Hit[] }>(r))
        .then((d) => {
          if (!alive) return;
          const list = Array.isArray(d.products) ? d.products : [];
          const filtered = list
            .filter((p) => String(p.name || "").toLowerCase().includes(needle))
            .slice(0, 8);
          setHits(filtered);
        })
        .catch(() => {
          if (alive) setHits([]);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 220);
    return () => {
      alive = false;
      window.clearTimeout(handle);
    };
  }, [q, open]);

  function goCatalog(term: string) {
    const trimmed = term.trim();
    const qs = new URLSearchParams();
    if (trimmed) qs.set("q", trimmed);
    const tag = params.get("tag");
    if (tag) qs.set("tag", tag);
    const suffix = qs.toString();
    setOpen(false);
    navigate(suffix ? `/catalogo?${suffix}` : "/catalogo");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    goCatalog(q);
  }

  return (
    <div
      className={`${styles.headerSearchWrap} ${cosmic ? styles.headerSearchCosmic : ""}`}
      ref={rootRef}
    >
      <button
        type="button"
        className={`${styles.headerSearchToggle} ${open ? styles.headerSearchToggleOn : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Cerrar búsqueda" : "Buscar productos"}
        title="Buscar"
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
        </svg>
      </button>

      {open ? (
        <div className={styles.headerSearchPanel} id={panelId} role="search">
          <form className={styles.headerSearchForm} onSubmit={onSubmit}>
            <input
              ref={inputRef}
              className={styles.headerSearchInput}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar en la tienda…"
              aria-label="Buscar productos"
              autoComplete="off"
            />
            <button type="submit" className={styles.headerSearchBtn}>
              Ver todo
            </button>
          </form>

          <div className={styles.headerSearchResults} aria-live="polite">
            {q.trim().length < 2 ? (
              <p className={styles.headerSearchHint}>Escribe al menos 2 letras…</p>
            ) : loading ? (
              <p className={styles.headerSearchHint}>Buscando…</p>
            ) : hits.length === 0 ? (
              <p className={styles.headerSearchHint}>Sin resultados. Prueba otra palabra.</p>
            ) : (
              <ul className={styles.headerSearchList}>
                {hits.map((p) => {
                  const img = resolveStoreMediaUrl(p.image_url);
                  return (
                    <li key={p.id}>
                      <Link
                        to={`/producto/${p.id}`}
                        className={styles.headerSearchHit}
                        onClick={() => setOpen(false)}
                      >
                        <span className={styles.headerSearchThumb} aria-hidden>
                          {img ? <img src={img} alt="" /> : null}
                        </span>
                        <span className={styles.headerSearchHitText}>
                          <strong>{p.name}</strong>
                          <span>
                            {formatCLP(p.price_cents)}
                            {p.stock > 0 ? ` · stock ${p.stock}` : " · agotado"}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {q.trim().length >= 2 ? (
              <button type="button" className={styles.headerSearchAll} onClick={() => goCatalog(q)}>
                Ver todos los resultados en el catálogo
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
