import { Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "./admin/AdminLayout";
import { Layout } from "./layout/Layout";
import { Login } from "./screens/Login";
import { Register } from "./screens/Register";
import { Catalog } from "./screens/Catalog";
import { Cart } from "./screens/Cart";
import { AdminDashboard } from "./screens/AdminDashboard";
import { AdminProducts } from "./screens/AdminProducts";
import { AdminCarts } from "./screens/AdminCarts";
import { AdminWidgets } from "./screens/AdminWidgets";
import { AdminTournamentSprites } from "./screens/AdminTournamentSprites";
import { Torneos } from "./screens/Torneos";

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
