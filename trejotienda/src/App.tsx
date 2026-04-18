import { Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "./admin/AdminLayout";
import { Layout } from "./layout/Layout";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Catalog } from "./pages/Catalog";
import { Cart } from "./pages/Cart";
import { AdminDashboard } from "./pages/AdminDashboard";
import { AdminProducts } from "./pages/AdminProducts";
import { AdminCarts } from "./pages/AdminCarts";

export default function App() {
  return (
    <Routes>
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="panel" replace />} />
        <Route path="panel" element={<AdminDashboard />} />
        <Route path="productos" element={<AdminProducts />} />
        <Route path="carritos" element={<AdminCarts />} />
      </Route>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="login" element={<Login />} />
        <Route path="registro" element={<Register />} />
        <Route path="catalogo" element={<Catalog />} />
        <Route path="carrito" element={<Cart />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
