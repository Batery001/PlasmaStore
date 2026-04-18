import { FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { formatCLP } from "../lib/money";
import { useAuth } from "../auth/AuthContext";
import styles from "./pages.module.css";

type Product = {
  id: number;
  name: string;
  description: string;
  price_cents: number;
  stock: number;
};

export function AdminProducts() {
  const { user, loading } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("10");
  const [msg, setMsg] = useState<string | null>(null);

  const reload = () =>
    fetch("/api/store/products")
      .then((r) => r.json())
      .then((d) => setProducts(d.products || []));

  useEffect(() => {
    reload();
  }, []);

  if (loading) return <p className={styles.muted}>Cargando…</p>;
  if (!user || user.role !== "admin") return <Navigate to="/" replace />;

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const price_cents = Math.round(parseFloat(price.replace(",", ".")) * 100);
    if (!Number.isFinite(price_cents) || price_cents < 0) {
      setMsg("Precio inválido (usa pesos, ej. 4990)");
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
    reload();
  }

  return (
    <div>
      <h1 className={styles.pageTitle}>Admin — productos</h1>
      <p className={styles.muted}>Alta rápida de productos (solo rol admin).</p>

      <form className={styles.formCard} onSubmit={onCreate}>
        <h2 className={styles.subTitle}>Nuevo producto</h2>
        <label className={styles.label}>
          Nombre
          <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className={styles.label}>
          Descripción
          <textarea className={styles.textarea} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className={styles.label}>
          Precio (CLP, sin decimales)
          <input className={styles.input} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="4990" required />
        </label>
        <label className={styles.label}>
          Stock inicial
          <input className={styles.input} value={stock} onChange={(e) => setStock(e.target.value)} />
        </label>
        {msg && <p className={styles.banner}>{msg}</p>}
        <button type="submit" className={styles.btnPrimary}>
          Guardar producto
        </button>
      </form>

      <h2 className={styles.subTitle}>En catálogo</h2>
      <ul className={styles.adminList}>
        {products.map((p) => (
          <li key={p.id}>
            <strong>{p.name}</strong> — {formatCLP(p.price_cents)} · stock {p.stock}
          </li>
        ))}
      </ul>
    </div>
  );
}
