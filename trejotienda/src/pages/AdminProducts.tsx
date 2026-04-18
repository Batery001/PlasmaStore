import { FormEvent, useEffect, useRef, useState } from "react";
import { resolveStoreMediaUrl } from "../lib/media";
import { parseResponseJson } from "../lib/parseResponseJson";
import adminStyles from "../admin/admin.module.css";

type Product = {
  id: number;
  name: string;
  description: string;
  price_cents: number;
  stock: number;
  active: number;
  image_url?: string | null;
};

export function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("10");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [rowMsg, setRowMsg] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    const res = await fetch("/api/store/admin/products", { credentials: "include" });
    const data = await parseResponseJson<{ error?: string; products?: Product[] }>(res);
    if (!res.ok) throw new Error(data.error || "Error");
    setProducts(data.products || []);
  };

  useEffect(() => {
    reload().catch(() => {});
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const price_cents = Math.round(parseFloat(price.replace(",", ".")));
    if (!Number.isFinite(price_cents) || price_cents < 0) {
      setMsg("Precio inválido: ingresa pesos CLP enteros (ej. 5990).");
      return;
    }
    const fd = new FormData();
    fd.append("name", name.trim());
    fd.append("description", description.trim());
    fd.append("price_cents", String(price_cents));
    fd.append("stock", String(parseInt(stock, 10) || 0));
    if (imageFile) fd.append("image", imageFile);

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
    setStock("10");
    setImageFile(null);
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
      stock: number;
      active: number;
      clear_image: boolean;
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
      <h1 className={adminStyles.pageTitle}>Productos</h1>
      <p className={adminStyles.pageLead}>
        Catálogo completo (activos e inactivos). Usa el botón para dar de alta un producto y subir una
        imagen opcional (se muestra en la tienda).
      </p>

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
                  Stock inicial
                  <input
                    className={adminStyles.input}
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                  />
                </label>
              </div>
              <label className={adminStyles.label}>
                Descripción
                <textarea
                  className={adminStyles.textarea}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <label className={adminStyles.label}>
                Imagen del producto{" "}
                <span className={adminStyles.fileHint}>(JPEG, PNG, WebP, GIF, AVIF; máx. 4 MB)</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
                  className={adminStyles.input}
                  onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                />
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
      stock: number;
      active: number;
      clear_image: boolean;
    }>
  ) => void;
  onReload: () => Promise<void>;
}) {
  const [name, setName] = useState(p.name);
  const [price, setPrice] = useState(String(p.price_cents));
  const [stock, setStock] = useState(String(p.stock));
  const [active, setActive] = useState(p.active === 1);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(p.name);
    setPrice(String(p.price_cents));
    setStock(String(p.stock));
    setActive(p.active === 1);
  }, [p.id, p.name, p.price_cents, p.stock, p.active]);

  function save() {
    const price_cents = Math.round(parseFloat(price.replace(",", ".")));
    const st = parseInt(stock, 10);
    const nm = name.trim();
    if (!nm || !Number.isFinite(price_cents) || price_cents < 0) return;
    if (!Number.isFinite(st) || st < 0) return;
    onSave(p.id, {
      name: nm,
      price_cents,
      stock: st,
      active: active ? 1 : 0,
    });
  }

  async function onPickImage(file: File | undefined) {
    if (!file) return;
    const fd = new FormData();
    fd.append("image", file);
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

  const imgSrc = resolveStoreMediaUrl(p.image_url);

  return (
    <tr>
      <td>
        <div className={adminStyles.thumbCell}>
          {imgSrc ? <img className={adminStyles.thumbImg} src={imgSrc} alt="" /> : <span>—</span>}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
          style={{ display: "none" }}
          onChange={(e) => onPickImage(e.target.files?.[0])}
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
        <button type="button" className={adminStyles.btnPrimary} onClick={save}>
          Guardar
        </button>
      </td>
    </tr>
  );
}
