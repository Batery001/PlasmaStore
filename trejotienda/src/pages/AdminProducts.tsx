import { FormEvent, useEffect, useState } from "react";
import adminStyles from "../admin/admin.module.css";

type Product = {
  id: number;
  name: string;
  description: string;
  price_cents: number;
  stock: number;
  active: number;
};

export function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("10");
  const [msg, setMsg] = useState<string | null>(null);
  const [rowMsg, setRowMsg] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<string | null>(null);

  const reload = async () => {
    const res = await fetch("/api/store/admin/products", { credentials: "include" });
    const data = await res.json();
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
    const res = await fetch("/api/store/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name,
        description,
        price_cents,
        stock: parseInt(stock, 10) || 0,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || "Error");
      return;
    }
    setMsg(`Producto creado: ${data.product?.name}`);
    setName("");
    setDescription("");
    setPrice("");
    setStock("10");
    await reload();
  }

  async function patchProduct(
    id: number,
    body: Partial<{ name: string; description: string; price_cents: number; stock: number; active: number }>
  ) {
    setRowErr(null);
    setRowMsg(null);
    const res = await fetch(`/api/store/admin/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = await res.json();
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
        Catálogo completo (activos e inactivos). Altas rápidas y edición de stock, precio CLP y
        visibilidad en tienda.
      </p>

      <div className={adminStyles.panelCard}>
        <h2>Añadir producto</h2>
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
          {msg && <p className={adminStyles.banner}>{msg}</p>}
          <button type="submit" className={adminStyles.btnPrimary}>
            Guardar producto
          </button>
        </form>
      </div>

      <div className={adminStyles.panelCard}>
        <h2>Listado de productos</h2>
        {rowErr && <p className={adminStyles.error}>{rowErr}</p>}
        {rowMsg && <p className={adminStyles.banner}>{rowMsg}</p>}
        <div className={adminStyles.tableWrap}>
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Precio</th>
                <th>Stock</th>
                <th>Activo</th>
                <th>Guardar</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <ProductRow key={p.id} product={p} onSave={patchProduct} />
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
}: {
  product: Product;
  onSave: (
    id: number,
    body: Partial<{ name: string; description: string; price_cents: number; stock: number; active: number }>
  ) => void;
}) {
  const [name, setName] = useState(p.name);
  const [price, setPrice] = useState(String(p.price_cents));
  const [stock, setStock] = useState(String(p.stock));
  const [active, setActive] = useState(p.active === 1);

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

  return (
    <tr>
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
