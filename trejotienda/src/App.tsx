import { Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "./admin/AdminLayout";
import { Layout } from "./layout/Layout";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Catalog } from "./pages/Catalog";
import { Cart } from "./pages/Cart";
import { AdminDashboard } from "./pages/AdminDashboard";
import { AdminProducts } from "./pages/AdminProducts";
import { AdminCarts } from "./pages/AdminCarts";
import { AdminWidgets } from "./pages/AdminWidgets";
import { AdminTournamentSprites } from "./pages/AdminTournamentSprites";
import { Torneos } from "./pages/Torneos";

export default function App() {
  return (
    <Routes>
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="panel" replace />} />
        <Route path="panel" element={<AdminDashboard />} />
        <Route path="productos" element={<AdminProducts />} />
        <Route path="widgets" element={<AdminWidgets />} />
        <Route path="carritos" element={<AdminCarts />} />
        <Route path="torneos-sprites" element={<AdminTournamentSprites />} />
      </Route>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="catalogo" replace />} />
        <Route path="login" element={<Login />} />
        <Route path="registro" element={<Register />} />
        <Route path="catalogo" element={<Catalog />} />
        <Route path="torneos" element={<Torneos />} />
        <Route path="carrito" element={<Cart />} />
        <Route path="*" element={<Navigate to="catalogo" replace />} />
      </Route>
    </Routes>
  );
}
