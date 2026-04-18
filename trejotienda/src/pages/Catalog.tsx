import { useEffect, useState } from "react";
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

export function Catalog() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/store/products")
      .then((r) => r.json())
      .then((d) => setProducts(d.products || []));
  }, []);

  async function addToCart(p: Product) {
    setMsg(null);
    if (!user) {
      setMsg("Inicia sesión para agregar al carrito.");
      return;
    }
    const res = await fetch("/api/store/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ productId: p.id, quantity: 1 }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || "No se pudo agregar");
      return;
    }
    setMsg(`Agregado: ${p.name}`);
  }

  return (
    <div>
      <h1 className={styles.pageTitle}>Catálogo</h1>
      {msg && <p className={styles.banner}>{msg}</p>}
      <div className={styles.grid}>
        {products.map((p) => (
          <article key={p.id} className={styles.card}>
            <h2 className={styles.cardTitle}>{p.name}</h2>
            <p className={styles.cardDesc}>{p.description}</p>
            <p className={styles.price}>{formatCLP(p.price_cents)}</p>
            <p className={styles.stock}>Stock: {p.stock}</p>
            <button type="button" className={styles.btnPrimary} onClick={() => addToCart(p)} disabled={p.stock < 1}>
              {p.stock < 1 ? "Agotado" : "Al carrito"}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
