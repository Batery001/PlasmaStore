import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  sales_channel?: "both" | "store_only";
  barcode?: string | null;
  category?: string | null;
  subcategory?: string | null;
  cost_cents?: number;
  vat_19_enabled?: boolean;
  margin_percent?: number;
  min_stock?: number;
  discount_percent?: number;
  promo_min_qty?: number;
  promo_bundle_total_cents?: number;
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
  const [barcode, setBarcode] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [cost, setCost] = useState("");
  const [vat19, setVat19] = useState(true);
  const [marginPct, setMarginPct] = useState("0");
  const [price, setPrice] = useState("");
  const [comparePrice, setComparePrice] = useState("");
  const [stock, setStock] = useState("0");
  const [stockAdd, setStockAdd] = useState("1");
  const [minStock, setMinStock] = useState("");
  const [discountPct, setDiscountPct] = useState("0");
  const [promoMinQty, setPromoMinQty] = useState("0");
  const [promoTotal, setPromoTotal] = useState("");
  const [salesChannel, setSalesChannel] = useState<"both" | "store_only">("both");
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
  const [tagDraft, setTagDraft] = useState("");
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

  const priceBreakdown = useMemo(() => {
    const costPesos = parseInt(String(cost || "").replace(/[^\d]/g, "") || "0", 10) || 0;
    const salePesos = parseInt(String(price || "").replace(/[^\d]/g, "") || "0", 10) || 0;
    if (costPesos <= 0) {
      return "Costo (X): —  ·  IVA: —  ·  X+IVA: —\nPrecio sugerido: —  ·  Ganancia: —";
    }
    let y = (parseInt(marginPct, 10) || 0) / 100;
    if (y >= 0.999) y = 0.95;
    const ivaRate = vat19 ? 0.19 : 0;
    const iva = Math.round(costPesos * ivaRate);
    const xPlusIva = costPesos + iva;
    const suggested = Math.round(xPlusIva / Math.max(0.05, 1 - y));
    const profit = salePesos > 0 ? Math.max(0, salePesos - xPlusIva) : null;
    const fmt = (n: number) => `$${n.toLocaleString("es-CL")}`;
    return `Costo (X): ${fmt(costPesos)}  ·  IVA: ${fmt(iva)}  ·  X+IVA: ${fmt(xPlusIva)}\nPrecio sugerido: ${fmt(suggested)}  ·  Ganancia: ${
      profit == null ? "—" : fmt(profit)
    }`;
  }, [cost, price, vat19, marginPct]);

  const tagSuggestions = useMemo(
    () =>
      tags
        .filter((t) => t.active !== 0)
        .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name)),
    [tags]
  );

  function slugifyClient(raw: string) {
    return raw
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
  }

  function addTagLabel(raw: string) {
    const label = String(raw || "").trim();
    if (!label) return;
    const slug = slugifyClient(label);
    if (!slug) return;
    setSelectedTags((prev) => {
      const exists = prev.some((x) => slugifyClient(x) === slug);
      if (exists) return prev;
      return [...prev, label];
    });
    setTagDraft("");
  }

  function removeTagLabel(label: string) {
    const slug = slugifyClient(label);
    if (fixedTagSlug && slug === fixedTagSlug) return;
    setSelectedTags((prev) => prev.filter((x) => slugifyClient(x) !== slug));
  }

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
    if (fixedTagSlug) {
      setSelectedTags((prev) => {
        if (prev.some((x) => slugifyClient(x) === fixedTagSlug)) return prev;
        const named = tags.find((t) => t.slug === fixedTagSlug)?.name || fixedTagSlug;
        return [...prev, named];
      });
    }
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
    const addQty = parseInt(stockAdd, 10) || 0;
    if (addQty > 0) fd.append("stock_add", String(addQty));
    fd.append("sales_channel", salesChannel);
    fd.append("barcode", barcode.trim());
    fd.append("category", category.trim());
    fd.append("subcategory", subcategory.trim());
    fd.append("cost_cents", String(parseInt(String(cost || "").replace(/[^\d]/g, "") || "0", 10) || 0));
    fd.append("vat_19_enabled", vat19 ? "1" : "0");
    fd.append("margin_percent", String(parseInt(marginPct, 10) || 0));
    fd.append("min_stock", String(parseInt(minStock, 10) || 0));
    fd.append("discount_percent", String(parseInt(discountPct, 10) || 0));
    fd.append("promo_min_qty", String(parseInt(promoMinQty, 10) || 0));
    fd.append(
      "promo_bundle_total_cents",
      String(parseInt(String(promoTotal || "").replace(/[^\d]/g, "") || "0", 10) || 0)
    );
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
    setBarcode("");
    setCategory("");
    setSubcategory("");
    setCost("");
    setVat19(true);
    setMarginPct("0");
    setPrice("");
    setComparePrice("");
    setStock("0");
    setStockAdd("1");
    setMinStock("");
    setDiscountPct("0");
    setPromoMinQty("0");
    setPromoTotal("");
    setSalesChannel("both");
    setImageFiles([]);
    setSelectedTags([]);
    setTagDraft("");
    setLtSet("");
    setLtNumber("");
    setLtQuery("");
    setLtResults([]);
    setLtOpen(false);
    setLtErr(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setShowAdd(false);
    await reload();
    // refrescar sugerencias con etiquetas recién creadas
    try {
      const tr = await fetch("/api/store/admin/tags", { credentials: "include" });
      const tj = await tr.json();
      if (tr.ok && tj?.ok) setTags(Array.isArray(tj.tags) ? tj.tags : []);
    } catch {
      /* ignore */
    }
  }

  async function exportProductsCsv() {
    setRowErr(null);
    setRowMsg(null);
    try {
      const res = await fetch("/api/store/admin/products/export.csv", { credentials: "include" });
      if (!res.ok) {
        const data = await parseResponseJson<{ error?: string }>(res).catch(() => ({} as { error?: string }));
        throw new Error(data.error || "No se pudo exportar el CSV.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "productos.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setRowMsg("CSV descargado.");
    } catch (e) {
      setRowErr(e instanceof Error ? e.message : "Error al exportar.");
    }
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
      sales_channel: "both" | "store_only";
      clear_image: boolean;
      tags_json: string;
      barcode: string | null;
      category: string | null;
      subcategory: string | null;
      cost_cents: number;
      vat_19_enabled: boolean;
      margin_percent: number;
      min_stock: number;
      discount_percent: number;
      promo_min_qty: number;
      promo_bundle_total_cents: number;
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
        <button type="button" className={adminStyles.btn} onClick={() => void exportProductsCsv()}>
          Exportar CSV
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
            <h2 id="add-product-title">Alta / edición rápida</h2>
            <form onSubmit={onCreate}>
              <div className={adminStyles.formGrid}>
                <label className={adminStyles.label}>
                  Código
                  <input
                    className={adminStyles.input}
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="Opcional — código de barras"
                  />
                </label>
                <label className={adminStyles.label}>
                  Etiqueta
                  <input
                    className={adminStyles.input}
                    list="pos-category-list"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Ej: Mitos, Pokémon… (elegir o escribir)"
                  />
                  <datalist id="pos-category-list">
                    {tagSuggestions.map((t) => (
                      <option key={t._id} value={t.name} />
                    ))}
                  </datalist>
                </label>
                <label className={adminStyles.label}>
                  Subetiqueta
                  <input
                    className={adminStyles.input}
                    list="pos-subcategory-list"
                    value={subcategory}
                    onChange={(e) => setSubcategory(e.target.value)}
                    placeholder="Ej: Primera Era, Primer Bloque…"
                  />
                  <datalist id="pos-subcategory-list">
                    {tagSuggestions.map((t) => (
                      <option key={`s-${t._id}`} value={t.name} />
                    ))}
                  </datalist>
                </label>
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
                  Costo (compra)
                  <input
                    className={adminStyles.input}
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    placeholder="Costo compra, ej: 15000"
                  />
                </label>
                <div className={adminStyles.label}>
                  Opciones precio
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", alignItems: "center", marginTop: "0.35rem" }}>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontWeight: 500 }}>
                      <input type="checkbox" checked={vat19} onChange={(e) => setVat19(e.target.checked)} />
                      IVA 19%
                    </label>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontWeight: 500 }}>
                      Margen
                      <input
                        className={adminStyles.input}
                        style={{ width: "5.5rem" }}
                        value={marginPct}
                        onChange={(e) => setMarginPct(e.target.value.replace(/[^\d]/g, ""))}
                        inputMode="numeric"
                      />
                      %
                    </label>
                  </div>
                  <pre
                    style={{
                      margin: "0.55rem 0 0",
                      whiteSpace: "pre-wrap",
                      fontFamily: "inherit",
                      fontSize: "0.85rem",
                      color: "#4ade80",
                      fontWeight: 600,
                    }}
                  >
                    {priceBreakdown}
                  </pre>
                  <button
                    type="button"
                    className={adminStyles.btn}
                    style={{ marginTop: "0.45rem" }}
                    onClick={() => {
                      const costPesos = parseInt(String(cost || "").replace(/[^\d]/g, "") || "0", 10) || 0;
                      if (costPesos <= 0) return;
                      let y = (parseInt(marginPct, 10) || 0) / 100;
                      if (y >= 0.999) y = 0.95;
                      const iva = vat19 ? Math.round(costPesos * 0.19) : 0;
                      const suggested = Math.round((costPesos + iva) / Math.max(0.05, 1 - y));
                      setPrice(String(suggested));
                    }}
                  >
                    Usar precio sugerido
                  </button>
                </div>
                <label className={adminStyles.label}>
                  Precio (venta)
                  <input
                    className={adminStyles.input}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="Precio venta, ej: 26000"
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
                  Stock
                  <input className={adminStyles.input} value={stock} onChange={(e) => setStock(e.target.value)} />
                </label>
                <label className={adminStyles.label}>
                  + Stock
                  <input
                    className={adminStyles.input}
                    value={stockAdd}
                    onChange={(e) => setStockAdd(e.target.value)}
                    placeholder="Cantidad a sumar al guardar"
                  />
                </label>
                <label className={adminStyles.label}>
                  Mín. stock
                  <input
                    className={adminStyles.input}
                    value={minStock}
                    onChange={(e) => setMinStock(e.target.value)}
                    placeholder="0 = sin alerta"
                  />
                </label>
                <label className={adminStyles.label}>
                  Descuento
                  <input
                    className={adminStyles.input}
                    value={discountPct}
                    onChange={(e) => setDiscountPct(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="0 %"
                  />
                </label>
                <label className={adminStyles.label}>
                  Promo cant.
                  <input
                    className={adminStyles.input}
                    value={promoMinQty}
                    onChange={(e) => setPromoMinQty(e.target.value.replace(/[^\d]/g, ""))}
                  />
                </label>
                <label className={adminStyles.label}>
                  Promo total
                  <input
                    className={adminStyles.input}
                    value={promoTotal}
                    onChange={(e) => setPromoTotal(e.target.value)}
                    placeholder="Total lote en pesos, ej: 5000"
                  />
                </label>
                <label className={adminStyles.label}>
                  Canal de venta
                  <select
                    className={adminStyles.input}
                    value={salesChannel}
                    onChange={(e) => setSalesChannel(e.target.value === "store_only" ? "store_only" : "both")}
                  >
                    <option value="both">Web + tienda</option>
                    <option value="store_only">Solo tienda física</option>
                  </select>
                </label>
              </div>

              <label className={adminStyles.label}>
                Etiquetas web (categorías del menú)
                <p className={adminStyles.muted} style={{ margin: "0.25rem 0 0.5rem", fontWeight: 400 }}>
                  Escribe y pulsa Enter o Agregar. Si la etiqueta no existe, se crea sola y queda disponible en el menú.
                </p>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.4rem",
                    marginBottom: "0.55rem",
                    minHeight: "2rem",
                  }}
                >
                  {selectedTags.length === 0 ? (
                    <span className={adminStyles.muted}>Sin etiquetas aún.</span>
                  ) : (
                    selectedTags.map((label) => {
                      const locked = Boolean(fixedTagSlug && slugifyClient(label) === fixedTagSlug);
                      return (
                        <span
                          key={slugifyClient(label)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.35rem",
                            padding: "0.28rem 0.55rem",
                            borderRadius: 999,
                            border: "1px solid rgba(56, 189, 248, 0.35)",
                            background: "rgba(14, 165, 233, 0.12)",
                            color: "#e0f2fe",
                            fontSize: "0.88rem",
                            fontWeight: 600,
                          }}
                        >
                          {label}
                          {!locked ? (
                            <button
                              type="button"
                              onClick={() => removeTagLabel(label)}
                              aria-label={`Quitar ${label}`}
                              style={{
                                border: "none",
                                background: "transparent",
                                color: "#7dd3fc",
                                cursor: "pointer",
                                padding: 0,
                                lineHeight: 1,
                                fontSize: "1rem",
                              }}
                            >
                              ×
                            </button>
                          ) : null}
                        </span>
                      );
                    })
                  )}
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <input
                    className={adminStyles.input}
                    list="web-tags-suggest"
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addTagLabel(tagDraft.replace(/,/g, ""));
                      }
                    }}
                    placeholder="Escribe una etiqueta… (Enter para agregar)"
                    style={{ flex: "1 1 220px" }}
                  />
                  <datalist id="web-tags-suggest">
                    {tagSuggestions.map((t) => (
                      <option key={t._id} value={t.name} />
                    ))}
                  </datalist>
                  <button type="button" className={adminStyles.btn} onClick={() => addTagLabel(tagDraft)}>
                    Agregar
                  </button>
                </div>
                {tagSuggestions.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.55rem" }}>
                    {tagSuggestions.slice(0, 24).map((t) => {
                      const on = selectedTags.some((x) => slugifyClient(x) === t.slug);
                      return (
                        <button
                          key={t._id}
                          type="button"
                          className={adminStyles.btn}
                          style={{
                            padding: "0.25rem 0.55rem",
                            fontSize: "0.8rem",
                            opacity: on ? 0.45 : 1,
                          }}
                          disabled={on}
                          onClick={() => addTagLabel(t.name)}
                        >
                          + {t.name}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
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
                <button
                  type="button"
                  className={adminStyles.btn}
                  onClick={() => {
                    setName("");
                    setDescription("");
                    setBarcode("");
                    setCategory("");
                    setSubcategory("");
                    setCost("");
                    setVat19(true);
                    setMarginPct("0");
                    setPrice("");
                    setComparePrice("");
                    setStock("0");
                    setStockAdd("1");
                    setMinStock("");
                    setDiscountPct("0");
                    setPromoMinQty("0");
                    setPromoTotal("");
                    setSalesChannel("both");
                    setImageFiles([]);
                    setSelectedTags(fixedTagSlug ? [fixedTagSlug] : []);
                    setTagDraft("");
                    setMsg(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                >
                  Limpiar
                </button>
                <button type="button" className={adminStyles.btn} onClick={() => setShowAdd(false)}>
                  Cancelar
                </button>
                <button type="submit" className={adminStyles.btnPrimary}>
                  Guardar
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
                <th>Canal</th>
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
      sales_channel: "both" | "store_only";
      clear_image: boolean;
      barcode: string | null;
      category: string | null;
      subcategory: string | null;
      cost_cents: number;
      vat_19_enabled: boolean;
      margin_percent: number;
      min_stock: number;
      discount_percent: number;
      promo_min_qty: number;
      promo_bundle_total_cents: number;
    }>
  ) => void | Promise<void>;
  onReload: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(p.name);
  const [description, setDescription] = useState(p.description || "");
  const [price, setPrice] = useState(String(p.price_cents));
  const [comparePrice, setComparePrice] = useState(p.compare_price_cents != null ? String(p.compare_price_cents) : "");
  const [stock, setStock] = useState(String(p.stock));
  const [active, setActive] = useState(p.active === 1);
  const [salesChannel, setSalesChannel] = useState<"both" | "store_only">(
    p.sales_channel === "store_only" ? "store_only" : "both"
  );
  const [barcode, setBarcode] = useState(p.barcode || "");
  const [category, setCategory] = useState(p.category || "");
  const [subcategory, setSubcategory] = useState(p.subcategory || "");
  const [cost, setCost] = useState(String(p.cost_cents ?? 0));
  const [vat19, setVat19] = useState(p.vat_19_enabled !== false);
  const [marginPct, setMarginPct] = useState(String(p.margin_percent ?? 0));
  const [minStock, setMinStock] = useState(String(p.min_stock ?? 0));
  const [discountPct, setDiscountPct] = useState(String(p.discount_percent ?? 0));
  const [promoMinQty, setPromoMinQty] = useState(String(p.promo_min_qty ?? 0));
  const [promoTotal, setPromoTotal] = useState(
    p.promo_bundle_total_cents ? String(p.promo_bundle_total_cents) : ""
  );
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function syncFromProduct() {
    setName(p.name);
    setDescription(p.description || "");
    setPrice(String(p.price_cents));
    setComparePrice(p.compare_price_cents != null ? String(p.compare_price_cents) : "");
    setStock(String(p.stock));
    setActive(p.active === 1);
    setSalesChannel(p.sales_channel === "store_only" ? "store_only" : "both");
    setBarcode(p.barcode || "");
    setCategory(p.category || "");
    setSubcategory(p.subcategory || "");
    setCost(String(p.cost_cents ?? 0));
    setVat19(p.vat_19_enabled !== false);
    setMarginPct(String(p.margin_percent ?? 0));
    setMinStock(String(p.min_stock ?? 0));
    setDiscountPct(String(p.discount_percent ?? 0));
    setPromoMinQty(String(p.promo_min_qty ?? 0));
    setPromoTotal(p.promo_bundle_total_cents ? String(p.promo_bundle_total_cents) : "");
  }

  function openEdit() {
    syncFromProduct();
    setOpen(true);
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
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
    const cost_cents = parseInt(String(cost || "").replace(/[^\d]/g, "") || "0", 10) || 0;
    const promo_bundle_total_cents =
      parseInt(String(promoTotal || "").replace(/[^\d]/g, "") || "0", 10) || 0;
    setSaving(true);
    try {
      await onSave(p.id, {
        name: nm,
        description: description.trim(),
        price_cents,
        compare_price_cents,
        stock: st,
        active: active ? 1 : 0,
        sales_channel: salesChannel,
        barcode: barcode.trim() || null,
        category: category.trim() || null,
        subcategory: subcategory.trim() || null,
        cost_cents,
        vat_19_enabled: vat19,
        margin_percent: parseInt(marginPct, 10) || 0,
        min_stock: parseInt(minStock, 10) || 0,
        discount_percent: parseInt(discountPct, 10) || 0,
        promo_min_qty: parseInt(promoMinQty, 10) || 0,
        promo_bundle_total_cents,
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
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
    await onSave(p.id, { clear_image: true });
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
  const metaBits = [p.category, p.subcategory, p.barcode ? `Código: ${p.barcode}` : null].filter(Boolean);

  return (
    <>
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
              <button type="button" className={adminStyles.btnLink} onClick={() => void clearImage()}>
                Quitar
              </button>
            ) : null}
          </div>
        </td>
        <td>{p.id}</td>
        <td>
          <div style={{ fontWeight: 600 }}>{p.name}</div>
          {p.description ? (
            <div className={adminStyles.muted} style={{ marginTop: "0.25rem", maxWidth: "280px" }}>
              {p.description.length > 80 ? `${p.description.slice(0, 80)}…` : p.description}
            </div>
          ) : null}
          {metaBits.length > 0 ? (
            <div className={adminStyles.muted} style={{ marginTop: "0.25rem", fontSize: "0.8rem" }}>
              {metaBits.join(" · ")}
            </div>
          ) : null}
        </td>
        <td>{p.price_cents.toLocaleString("es-CL")}</td>
        <td>{p.compare_price_cents != null ? p.compare_price_cents.toLocaleString("es-CL") : "—"}</td>
        <td>{p.stock}</td>
        <td>{p.sales_channel === "store_only" ? "Solo tienda" : "Web + tienda"}</td>
        <td>{p.active === 1 ? "Sí" : "No"}</td>
        <td>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="button" className={adminStyles.btnPrimary} onClick={openEdit}>
              Editar
            </button>
            <button type="button" className={adminStyles.btnDanger} onClick={() => void deleteProduct()}>
              Eliminar
            </button>
          </div>
        </td>
      </tr>

      {open
        ? createPortal(
            <div className={adminStyles.modalBackdrop} role="presentation" onClick={() => setOpen(false)}>
              <div
                className={adminStyles.modal}
                role="dialog"
                aria-labelledby={`edit-product-${p.id}`}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id={`edit-product-${p.id}`}>Editar producto #{p.id}</h2>
                <form onSubmit={(e) => void saveEdit(e)}>
                  <div className={adminStyles.formGrid}>
                    <label className={adminStyles.label}>
                      Código
                      <input
                        className={adminStyles.input}
                        value={barcode}
                        onChange={(e) => setBarcode(e.target.value)}
                        placeholder="Opcional — código de barras"
                      />
                    </label>
                    <label className={adminStyles.label}>
                      Etiqueta
                      <input
                        className={adminStyles.input}
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        placeholder="Ej: Mitos, Pokémon…"
                      />
                    </label>
                    <label className={adminStyles.label}>
                      Subetiqueta
                      <input
                        className={adminStyles.input}
                        value={subcategory}
                        onChange={(e) => setSubcategory(e.target.value)}
                        placeholder="Ej: Primera Era…"
                      />
                    </label>
                    <label className={adminStyles.label}>
                      Nombre
                      <input
                        className={adminStyles.input}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                    </label>
                    <label className={adminStyles.label} style={{ gridColumn: "1 / -1" }}>
                      Descripción
                      <textarea
                        className={adminStyles.input}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                      />
                    </label>
                    <label className={adminStyles.label}>
                      Costo (compra)
                      <input
                        className={adminStyles.input}
                        value={cost}
                        onChange={(e) => setCost(e.target.value)}
                        placeholder="Ej: 15000"
                      />
                    </label>
                    <div className={adminStyles.label}>
                      Opciones precio
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.65rem",
                          alignItems: "center",
                          marginTop: "0.35rem",
                        }}
                      >
                        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontWeight: 500 }}>
                          <input type="checkbox" checked={vat19} onChange={(e) => setVat19(e.target.checked)} />
                          IVA 19%
                        </label>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontWeight: 500 }}>
                          Margen
                          <input
                            className={adminStyles.input}
                            style={{ width: "5.5rem" }}
                            value={marginPct}
                            onChange={(e) => setMarginPct(e.target.value.replace(/[^\d]/g, ""))}
                            inputMode="numeric"
                          />
                          %
                        </label>
                      </div>
                    </div>
                    <label className={adminStyles.label}>
                      Precio (venta)
                      <input
                        className={adminStyles.input}
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
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
                      Stock
                      <input className={adminStyles.input} value={stock} onChange={(e) => setStock(e.target.value)} />
                    </label>
                    <label className={adminStyles.label}>
                      Stock mínimo
                      <input
                        className={adminStyles.input}
                        value={minStock}
                        onChange={(e) => setMinStock(e.target.value)}
                      />
                    </label>
                    <label className={adminStyles.label}>
                      Descuento %
                      <input
                        className={adminStyles.input}
                        value={discountPct}
                        onChange={(e) => setDiscountPct(e.target.value.replace(/[^\d]/g, ""))}
                      />
                    </label>
                    <label className={adminStyles.label}>
                      Promo: cantidad mín.
                      <input
                        className={adminStyles.input}
                        value={promoMinQty}
                        onChange={(e) => setPromoMinQty(e.target.value.replace(/[^\d]/g, ""))}
                      />
                    </label>
                    <label className={adminStyles.label}>
                      Promo: total pack ($)
                      <input
                        className={adminStyles.input}
                        value={promoTotal}
                        onChange={(e) => setPromoTotal(e.target.value)}
                        placeholder="Ej: 19990"
                      />
                    </label>
                    <label className={adminStyles.label}>
                      Canal
                      <select
                        className={adminStyles.input}
                        value={salesChannel}
                        onChange={(e) =>
                          setSalesChannel(e.target.value === "store_only" ? "store_only" : "both")
                        }
                      >
                        <option value="both">Web + tienda</option>
                        <option value="store_only">Solo tienda</option>
                      </select>
                    </label>
                    <label className={adminStyles.label}>
                      Activo
                      <span style={{ display: "block", marginTop: "0.45rem" }}>
                        <input
                          type="checkbox"
                          className={adminStyles.check}
                          checked={active}
                          onChange={(e) => setActive(e.target.checked)}
                        />
                      </span>
                    </label>
                  </div>
                  <div className={adminStyles.modalActions}>
                    <button type="button" className={adminStyles.btn} onClick={() => setOpen(false)}>
                      Cancelar
                    </button>
                    <button type="submit" className={adminStyles.btnPrimary} disabled={saving}>
                      {saving ? "Guardando…" : "Guardar cambios"}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
