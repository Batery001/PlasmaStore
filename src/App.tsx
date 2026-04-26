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
import { AdminTags } from "./screens/AdminTags";
import { AdminOrders } from "./screens/AdminOrders";
import { Torneos } from "./screens/Torneos";
import { LandingHome } from "./screens/LandingHome";
import { WebpayReturn } from "./screens/WebpayReturn";
import { ProductDetail } from "./screens/ProductDetail";
import { SinglesCatalog } from "./screens/SinglesCatalog";
import { AdminSingles } from "./screens/AdminSingles";
import { Profile } from "./screens/Profile";

export default function App() {
  return (
    <Routes>
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="panel" replace />} />
        <Route path="panel" element={<AdminDashboard />} />
        <Route path="productos" element={<AdminProducts />} />
        <Route path="singles" element={<AdminSingles />} />
        <Route path="etiquetas" element={<AdminTags />} />
        <Route path="widgets" element={<AdminWidgets />} />
        <Route path="carritos" element={<AdminCarts />} />
        <Route path="ordenes" element={<AdminOrders />} />
        <Route path="torneos-sprites" element={<AdminTournamentSprites />} />
      </Route>
      <Route path="/" element={<Layout />}>
        <Route index element={<LandingHome />} />
        <Route path="webpay/return" element={<WebpayReturn />} />
        <Route path="login" element={<Login />} />
        <Route path="registro" element={<Register />} />
        <Route path="perfil" element={<Profile />} />
        <Route path="catalogo" element={<Catalog />} />
        <Route path="singles" element={<SinglesCatalog />} />
        <Route path="producto/:id" element={<ProductDetail />} />
        <Route path="torneos" element={<Torneos />} />
        <Route path="carrito" element={<Cart />} />
        <Route path="*" element={<Navigate to="catalogo" replace />} />
      </Route>
    </Routes>
  );
}
