import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { resolveStoreMediaUrl } from "../lib/media";
import { parseResponseJson } from "../lib/parseResponseJson";
import adminStyles from "../admin/admin.module.css";

type Product = {
  id: number;
  name: string;
  description: string;
  price_cents: number;
  compare_price_cents?: number | null;
  stock: number;
  active: number;
  image_url?: string | null;
  image_urls?: string[];
  tags?: string[];
};

type TagRow = { _id: number; name: string; slug: string; order?: number; active?: number };

export function AdminProducts({
  fixedTagSlug,
  title = "Productos",
  lead = "Catálogo completo (activos e inactivos). Usa el botón para dar de alta un producto y subir una imagen opcional (se muestra en la tienda).",
}: {
  fixedTagSlug?: string;
  title?: string;
  lead?: string;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [comparePrice, setComparePrice] = useState("");
  const [stock, setStock] = useState("10");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [ltSet, setLtSet] = useState("");
  const [ltNumber, setLtNumber] = useState("");
  const [ltLang, setLtLang] = useState<"EN" | "ES">("EN");
  const [ltSize, setLtSize] = useState<"XS" | "SM" | "LG">("XS");
  const [ltQuery, setLtQuery] = useState("");
  const [ltResults, setLtResults] = useState<Array<{ key: string; set: string; number: string; name: string; image_url?: string | null }>>(
    []
  );
  const [ltOpen, setLtOpen] = useState(false);
  const [ltLoading, setLtLoading] = useState(false);
  const [ltErr, setLtErr] = useState<string | null>(null);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [rowMsg, setRowMsg] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreImagesRef = useRef<HTMLInputElement>(null);
  const ltBoxRef = useRef<HTMLDivElement>(null);

  const limitlessImageUrl = useMemo(() => {
    if (fixedTagSlug !== "singles") return "";
    const set = String(ltSet || "").trim().toUpperCase();
    const numRaw = String(ltNumber || "").trim();
    const n = numRaw.replace(/[^\d]/g, "");
    if (!set || !n) return "";
    const num = n.padStart(3, "0");
    // Patrón común del CDN de Limitless (tpci)
    return `https://limitlesstcg.nyc3.digitaloceanspaces.com/tpci/${encodeURIComponent(set)}/${encodeURIComponent(
      set
    )}_${num}_R_${ltLang}_${ltSize}.png`;
  }, [fixedTagSlug, ltSet, ltNumber, ltLang, ltSize]);

  // Autocomplete Limitless (Admin → Singles)
  useEffect(() => {
    if (fixedTagSlug !== "singles" || !showAdd) return;
    const onDown = (ev: MouseEvent) => {
      if (!ltBoxRef.current) return;
      const t = ev.target;
      if (t instanceof Node && !ltBoxRef.current.contains(t)) setLtOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("mousedown", onDown);
    };
  }, [fixedTagSlug, showAdd]);

  useEffect(() => {
    if (fixedTagSlug !== "singles" || !showAdd) return;
    let alive = true;
    const q = ltQuery.trim();
    setLtErr(null);
    if (q.length < 2) {
      setLtResults([]);
      setLtOpen(false);
      setLtLoading(false);
      return;
    }
    setLtLoading(true);
    setLtOpen(true);
    const t = window.setTimeout(() => {
      fetch(`/api/store/admin/limitless/cards?q=${encodeURIComponent(q)}&lang=${encodeURIComponent(ltLang.toLowerCase())}&limit=12`, {
        credentials: "include",
      })
        .then(async (r) => {
          const j = await r.json().catch(() => ({}));
          if (!alive) return;
          if (!r.ok || j?.ok === false) throw new Error(j?.error || "No se pudo buscar en Limitless");
          setLtResults(Array.isArray(j?.items) ? j.items : []);
        })
        .catch((e) => {
          if (!alive) return;
          setLtErr(e instanceof Error ? e.message : "No se pudo buscar en Limitless");
          setLtResults([]);
        })
        .finally(() => {
          if (!alive) return;
          setLtLoading(false);
        });
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [fixedTagSlug, showAdd, ltQuery, ltLang]);

  const reload = async () => {
    setLoadErr(null);
    const res = await fetch("/api/store/admin/products", { credentials: "include" });
    const ct = res.headers.get("content-type") || "";
    if (res.status === 404 && !ct.includes("application/json")) {
      throw new Error(
        "El servidor respondió 404 (HTML) en lugar de la API de admin: revisa despliegue y que las rutas /api lleguen al backend (Next + Express)."
      );
    }
    const data = await parseResponseJson<{ error?: string; products?: Product[] }>(res);
    if (!res.ok) throw new Error(data.error || "Error al cargar el listado");
    const rows = data.products || [];
    const filtered = fixedTagSlug ? rows.filter((p) => Array.isArray(p.tags) && p.tags.includes(fixedTagSlug)) : rows;
    setProducts(filtered);
  };

  useEffect(() => {
    reload().catch((e) => {
      setLoadErr(e instanceof Error ? e.message : "No se pudo cargar el catálogo admin");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!showAdd) return;
    if (fixedTagSlug) setSelectedTags((prev) => (prev.includes(fixedTagSlug) ? prev : [...prev, fixedTagSlug]));
    fetch("/api/store/admin/tags", { credentials: "include" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok || !j?.ok) return;
        setTags(Array.isArray(j.tags) ? j.tags : []);
      })
      .catch(() => {
        /* ignore */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAdd]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const priceParsed = String(price || "")
      .trim()
      .replace(/[^\d]/g, "");
    const price_cents = parseInt(priceParsed || "0", 10);
    if (!Number.isFinite(price_cents) || price_cents < 0) {
      setMsg("Precio inválido: ingresa pesos CLP enteros (ej. 5990).");
      return;
    }
    const compareParsed = String(comparePrice || "")
      .trim()
      .replace(/[^\d]/g, "");
    const compare_price_cents = compareParsed === "" ? null : parseInt(compareParsed, 10);
    if (compare_price_cents != null && (!Number.isFinite(compare_price_cents) || compare_price_cents < 0)) {
      setMsg("Precio anterior inválido: ingresa pesos CLP enteros (ej. 7990) o déjalo vacío.");
      return;
    }
    const fd = new FormData();
    fd.append("name", name.trim());
    fd.append("description", description.trim());
    fd.append("price_cents", String(price_cents));
    if (compare_price_cents != null) fd.append("compare_price_cents", String(compare_price_cents));
    fd.append("stock", String(parseInt(stock, 10) || 0));
    const tagsOut = fixedTagSlug
      ? Array.from(new Set([...(selectedTags || []), fixedTagSlug])).filter(Boolean)
      : selectedTags;
    fd.append("tags_json", JSON.stringify(tagsOut));
    for (const f of imageFiles) fd.append("images", f);
    // Opción B (Singles): si no suben archivos, usar URL de Limitless
    if (fixedTagSlug === "singles" && imageFiles.length === 0 && limitlessImageUrl) {
      fd.append("image_url", limitlessImageUrl);
    }

    const res = await fetch("/api/store/admin/products", {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    const data = await parseResponseJson<{ error?: string; product?: { name?: string } }>(res);
    if (!res.ok) {
      setMsg(data.error || "Error");
      return;
    }
    setMsg(`Producto creado: ${data.product?.name}`);
    setName("");
    setDescription("");
    setPrice("");
    setComparePrice("");
    setStock("10");
    setImageFiles([]);
    setSelectedTags([]);
    setLtSet("");
    setLtNumber("");
    setLtQuery("");
    setLtResults([]);
    setLtOpen(false);
    setLtErr(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setShowAdd(false);
    await reload();
  }

  async function patchProduct(
    id: number,
    body: Partial<{
      name: string;
      description: string;
      price_cents: number;
      compare_price_cents: number | null;
      stock: number;
      active: number;
      clear_image: boolean;
      tags_json: string;
    }>
  ) {
    setRowErr(null);
    setRowMsg(null);
    const res = await fetch(`/api/store/admin/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = await parseResponseJson<{ error?: string }>(res);
    if (!res.ok) {
      setRowErr(data.error || "Error al guardar");
      return;
    }
    setRowMsg("Cambios guardados.");
    await reload();
  }

  return (
    <div>
      <h1 className={adminStyles.pageTitle}>{title}</h1>
      <p className={adminStyles.pageLead}>{lead}</p>

      <div className={adminStyles.toolbar}>
        <button type="button" className={adminStyles.btnPrimary} onClick={() => setShowAdd(true)}>
          + Añadir producto
        </button>
      </div>

      {showAdd && (
        <div
          className={adminStyles.modalBackdrop}
          role="presentation"
          onClick={() => {
            setShowAdd(false);
            setMsg(null);
          }}
        >
          <div
            className={adminStyles.modal}
            role="dialog"
            aria-labelledby="add-product-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="add-product-title">Nuevo producto</h2>
            <form onSubmit={onCreate}>
              <div className={adminStyles.formGrid}>
                <label className={adminStyles.label}>
                  Nombre
                  <input
                    className={adminStyles.input}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </label>
                <label className={adminStyles.label}>
                  Precio CLP (entero)
                  <input
                    className={adminStyles.input}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="5990"
                    required
                  />
                </label>
                <label className={adminStyles.label}>
                  Precio anterior (opcional)
                  <input
                    className={adminStyles.input}
                    value={comparePrice}
                    onChange={(e) => setComparePrice(e.target.value)}
                    placeholder="Ej: 7990"
                  />
                </label>
                <label className={adminStyles.label}>
                  Stock inicial
                  <input
                    className={adminStyles.input}
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                  />
                </label>
              </div>

              <label className={adminStyles.label}>
                Etiquetas (categorías)
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.5rem" }}>
                  {tags.length === 0 ? (
                    <div className={adminStyles.muted}>Aún no hay etiquetas. Crea en Admin → Etiquetas.</div>
                  ) : (
                    tags
                      .filter((t) => t.active !== 0)
                      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name))
                      .map((t) => (
                        <label
                          key={t._id}
                          className={adminStyles.muted}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            border: "1px solid rgba(139, 92, 246, 0.25)",
                            padding: "0.5rem 0.6rem",
                            borderRadius: 10,
                            background: "rgba(2, 6, 23, 0.25)",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedTags.includes(t.slug)}
                            disabled={fixedTagSlug === t.slug}
                            onChange={(e) => {
                              const on = e.target.checked;
                              setSelectedTags((prev) => (on ? [...prev, t.slug] : prev.filter((x) => x !== t.slug)));
                            }}
                          />
                          <span style={{ color: "rgba(241,245,249,0.95)" }}>{t.name}</span>
                        </label>
                      ))
                  )}
                </div>
              </label>

              {fixedTagSlug === "singles" ? (
                <div className={adminStyles.panelCard} style={{ padding: "0.9rem", marginTop: "0.25rem" }}>
                  <div className={adminStyles.subTitle} style={{ margin: 0 }}>
                    Buscar carta (Limitless)
                  </div>
                  <p className={adminStyles.muted} style={{ marginTop: "0.25rem" }}>
                    Escribe nombre, set o número y selecciona una carta. Si no subes archivos, se usará la URL generada automáticamente.
                  </p>
                  <div ref={ltBoxRef} style={{ position: "relative" }}>
                    <div className={adminStyles.formGrid}>
                      <label className={adminStyles.label} style={{ gridColumn: "1 / -1" }}>
                        Nombre / Set / Nº
                        <input
                          className={adminStyles.input}
                          value={ltQuery}
                          onChange={(e) => setLtQuery(e.target.value)}
                          placeholder="Ej: Pikachu / AOR / 001"
                          onFocus={() => {
                            if (ltQuery.trim().length >= 2) setLtOpen(true);
                          }}
                        />
                        <div className={adminStyles.muted} style={{ marginTop: "0.25rem" }}>
                          {ltLoading ? "Buscando…" : ltErr ? ltErr : ltResults.length ? `${ltResults.length} resultado(s).` : "Escribe 2+ letras para buscar."}
                        </div>
                      </label>
                      <label className={adminStyles.label}>
                        Idioma
                      <select
                        className={adminStyles.input}
                        value={ltLang}
                        onChange={(e) => setLtLang(e.target.value === "ES" ? "ES" : "EN")}
                      >
                          <option value="EN">EN</option>
                          <option value="ES">ES</option>
                        </select>
                      </label>
                      <label className={adminStyles.label}>
                        Tamaño
                      <select
                        className={adminStyles.input}
                        value={ltSize}
                        onChange={(e) => setLtSize(e.target.value === "LG" ? "LG" : e.target.value === "SM" ? "SM" : "XS")}
                      >
                          <option value="XS">XS</option>
                          <option value="SM">SM</option>
                          <option value="LG">LG</option>
                        </select>
                      </label>
                      <label className={adminStyles.label}>
                        Set
                        <input className={adminStyles.input} value={ltSet} onChange={(e) => setLtSet(e.target.value)} placeholder="AOR" />
                      </label>
                      <label className={adminStyles.label}>
                        Nº
                        <input className={adminStyles.input} value={ltNumber} onChange={(e) => setLtNumber(e.target.value)} placeholder="1 → 001" />
                      </label>
                    </div>

                    {ltOpen && ltResults.length > 0 ? (
                      <div
                        style={{
                          position: "absolute",
                          top: "4.15rem",
                          left: 0,
                          right: 0,
                          zIndex: 50,
                          background: "#0b1220",
                          border: "1px solid rgba(139, 92, 246, 0.35)",
                          borderRadius: 12,
                          overflow: "hidden",
                          maxHeight: 320,
                          overflowY: "auto",
                          boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
                        }}
                        role="listbox"
                      >
                        {ltResults.map((it) => (
                          <button
                            key={it.key}
                            type="button"
                            onClick={() => {
                              setLtSet(String(it.set || "").toUpperCase());
                              setLtNumber(String(it.number || ""));
                              setLtQuery(it.name || ltQuery);
                              // Autorrellenar nombre si está vacío o si estaban buscando
                              setName((prev) => (prev.trim() ? prev : it.name || prev));
                              setLtOpen(false);
                            }}
                            style={{
                              width: "100%",
                              display: "grid",
                              gridTemplateColumns: "44px 1fr auto",
                              gap: "0.65rem",
                              alignItems: "center",
                              padding: "0.55rem 0.7rem",
                              border: "none",
                              background: "transparent",
                              color: "rgba(241,245,249,0.95)",
                              textAlign: "left",
                              cursor: "pointer",
                            }}
                          >
                            <div
                              style={{
                                width: 44,
                                height: 44,
                                borderRadius: 10,
                                background: "rgba(255,255,255,0.08)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                display: "grid",
                                placeItems: "center",
                                overflow: "hidden",
                              }}
                            >
                              {it.image_url ? (
                                <img src={it.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              ) : (
                                <span style={{ opacity: 0.8 }}>🎴</span>
                              )}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</div>
                              <div className={adminStyles.muted} style={{ marginTop: "0.15rem" }}>
                                {String(it.set || "").toUpperCase()} · {it.number}
                              </div>
                            </div>
                            <div className={adminStyles.muted} style={{ paddingLeft: "0.5rem" }}>
                              Seleccionar
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {limitlessImageUrl ? (
                    <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: "0.75rem", alignItems: "center" }}>
                      <div className={adminStyles.thumbCell} style={{ width: 96, height: 96 }}>
                        <img className={adminStyles.thumbImg} src={limitlessImageUrl} alt="" />
                      </div>
                      <div className={adminStyles.muted} style={{ wordBreak: "break-all" }}>
                        {limitlessImageUrl}
                      </div>
                    </div>
                  ) : (
                    <div className={adminStyles.muted}>Completa Set y Nº para ver el preview.</div>
                  )}
                </div>
              ) : null}

              <label className={adminStyles.label}>
                Descripción
                <textarea
                  className={adminStyles.textarea}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <label className={adminStyles.label}>
                Imágenes del producto{" "}
                <span className={adminStyles.fileHint}>(múltiples; JPEG, PNG, WebP, GIF, AVIF; máx. 4 MB c/u)</span>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
                    className={adminStyles.input}
                    onChange={(e) => {
                      const list = Array.from(e.target.files || []);
                      setImageFiles(list);
                    }}
                  />
                  <button
                    type="button"
                    className={adminStyles.btn}
                    onClick={() => addMoreImagesRef.current?.click()}
                    title="Agregar otra imagen"
                  >
                    +
                  </button>
                  <span className={adminStyles.muted}>
                    {imageFiles.length > 0 ? `${imageFiles.length} seleccionada(s)` : "Sin imágenes"}
                  </span>
                </div>
                <input
                  ref={addMoreImagesRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setImageFiles((prev) => [...prev, f].slice(0, 10));
                    // permitir volver a seleccionar el mismo archivo si quieren
                    e.currentTarget.value = "";
                  }}
                />
                {imageFiles.length > 0 ? (
                  <div className={adminStyles.muted} style={{ marginTop: "0.4rem" }}>
                    {imageFiles.map((f, i) => (
                      <span key={`${f.name}-${i}`} style={{ marginRight: "0.5rem" }}>
                        {f.name}
                      </span>
                    ))}
                  </div>
                ) : null}
              </label>
              {msg && <p className={adminStyles.banner}>{msg}</p>}
              <div className={adminStyles.modalActions}>
                <button type="button" className={adminStyles.btn} onClick={() => setShowAdd(false)}>
                  Cancelar
                </button>
                <button type="submit" className={adminStyles.btnPrimary}>
                  Guardar producto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className={adminStyles.panelCard}>
        <h2>Listado de productos</h2>
        {loadErr && <p className={adminStyles.error}>{loadErr}</p>}
        {rowErr && <p className={adminStyles.error}>{rowErr}</p>}
        {rowMsg && <p className={adminStyles.banner}>{rowMsg}</p>}
        <div className={adminStyles.tableWrap}>
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Imagen</th>
                <th>ID</th>
                <th>Nombre</th>
                <th>Precio</th>
                <th>Precio anterior</th>
                <th>Stock</th>
                <th>Activo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <ProductRow key={p.id} product={p} onSave={patchProduct} onReload={() => reload()} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProductRow({
  product: p,
  onSave,
  onReload,
}: {
  product: Product;
  onSave: (
    id: number,
    body: Partial<{
      name: string;
      description: string;
      price_cents: number;
      compare_price_cents: number | null;
      stock: number;
      active: number;
      clear_image: boolean;
    }>
  ) => void;
  onReload: () => Promise<void>;
}) {
  const [name, setName] = useState(p.name);
  const [price, setPrice] = useState(String(p.price_cents));
  const [comparePrice, setComparePrice] = useState(p.compare_price_cents != null ? String(p.compare_price_cents) : "");
  const [stock, setStock] = useState(String(p.stock));
  const [active, setActive] = useState(p.active === 1);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(p.name);
    setPrice(String(p.price_cents));
    setComparePrice(p.compare_price_cents != null ? String(p.compare_price_cents) : "");
    setStock(String(p.stock));
    setActive(p.active === 1);
  }, [p.id, p.name, p.price_cents, p.compare_price_cents, p.stock, p.active]);

  function save() {
    const priceParsed = String(price || "")
      .trim()
      .replace(/[^\d]/g, "");
    const price_cents = parseInt(priceParsed || "0", 10);
    const compareParsed = String(comparePrice || "")
      .trim()
      .replace(/[^\d]/g, "");
    const compare_price_cents = compareParsed === "" ? null : parseInt(compareParsed, 10);
    const st = parseInt(stock, 10);
    const nm = name.trim();
    if (!nm || !Number.isFinite(price_cents) || price_cents < 0) return;
    if (compare_price_cents != null && (!Number.isFinite(compare_price_cents) || compare_price_cents < 0)) return;
    if (!Number.isFinite(st) || st < 0) return;
    onSave(p.id, {
      name: nm,
      price_cents,
      compare_price_cents,
      stock: st,
      active: active ? 1 : 0,
    });
  }

  async function onPickImages(files: FileList | null | undefined) {
    const list = Array.from(files || []);
    if (list.length === 0) return;
    const fd = new FormData();
    for (const f of list) fd.append("images", f);
    const res = await fetch(`/api/store/admin/products/${p.id}`, {
      method: "PATCH",
      credentials: "include",
      body: fd,
    });
    const data = await parseResponseJson<{ error?: string }>(res);
    if (!res.ok) {
      alert(data.error || "No se pudo subir la imagen");
      return;
    }
    if (fileRef.current) fileRef.current.value = "";
    await onReload();
  }

  async function clearImage() {
    if (!window.confirm("¿Quitar la imagen de este producto?")) return;
    onSave(p.id, { clear_image: true });
  }

  async function deleteProduct() {
    if (!window.confirm(`¿Eliminar el producto “${p.name}” (ID ${p.id})? Esta acción no se puede deshacer.`)) return;
    const res = await fetch(`/api/store/admin/products/${p.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = await parseResponseJson<{ error?: string }>(res);
    if (!res.ok) {
      alert(data.error || "No se pudo eliminar el producto");
      return;
    }
    await onReload();
  }

    const imgSrc = resolveStoreMediaUrl((Array.isArray(p.image_urls) && p.image_urls[0]) || p.image_url);

  return (
    <tr>
      <td>
        <div className={adminStyles.thumbCell}>
          {imgSrc ? <img className={adminStyles.thumbImg} src={imgSrc} alt="" /> : <span>—</span>}
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
          style={{ display: "none" }}
          onChange={(e) => onPickImages(e.target.files)}
        />
        <div className={adminStyles.rowActions} style={{ marginTop: "0.35rem" }}>
          <button type="button" className={adminStyles.btnLink} onClick={() => fileRef.current?.click()}>
            Subir
          </button>
          {imgSrc ? (
            <button type="button" className={adminStyles.btnLink} onClick={() => clearImage()}>
              Quitar
            </button>
          ) : null}
        </div>
      </td>
      <td>{p.id}</td>
      <td>
        <input className={adminStyles.input} value={name} onChange={(e) => setName(e.target.value)} />
        {p.description ? (
          <div className={adminStyles.muted} style={{ marginTop: "0.25rem", maxWidth: "280px" }}>
            {p.description.length > 80 ? `${p.description.slice(0, 80)}…` : p.description}
          </div>
        ) : null}
      </td>
      <td>
        <input
          className={adminStyles.input}
          style={{ width: "6.5rem" }}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </td>
      <td>
        <input
          className={adminStyles.input}
          style={{ width: "6.5rem" }}
          value={comparePrice}
          onChange={(e) => setComparePrice(e.target.value)}
          placeholder="Anterior"
        />
      </td>
      <td>
        <input
          className={adminStyles.input}
          style={{ width: "4.5rem" }}
          value={stock}
          onChange={(e) => setStock(e.target.value)}
        />
      </td>
      <td>
        <input
          type="checkbox"
          className={adminStyles.check}
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
      </td>
      <td>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button type="button" className={adminStyles.btnPrimary} onClick={save}>
            Guardar
          </button>
          <button type="button" className={adminStyles.btnDanger} onClick={deleteProduct}>
            Eliminar
          </button>
        </div>
      </td>
    </tr>
  );
}
