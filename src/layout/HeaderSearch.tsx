import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import styles from "./layout.module.css";

export function HeaderSearch({ cosmic = false }: { cosmic?: boolean }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(() => (params.get("q") || "").trim());

  useEffect(() => {
    setQ((params.get("q") || "").trim());
  }, [params]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = q.trim();
    const qs = new URLSearchParams();
    if (trimmed) qs.set("q", trimmed);
    const tag = params.get("tag");
    if (tag) qs.set("tag", tag);
    const suffix = qs.toString();
    navigate(suffix ? `/catalogo?${suffix}` : "/catalogo");
  }

  return (
    <form
      className={`${styles.headerSearch} ${cosmic ? styles.headerSearchCosmic : ""}`}
      onSubmit={onSubmit}
      role="search"
    >
      <input
        className={styles.headerSearchInput}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar en la tienda…"
        aria-label="Buscar productos"
        autoComplete="off"
      />
      <button type="submit" className={styles.headerSearchBtn}>
        Buscar
      </button>
    </form>
  );
}
