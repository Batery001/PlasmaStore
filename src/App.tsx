import { useRoutes } from "react-router-dom";
import { adminRoutes } from "./routes/AdminRoutes";
import { storeRoutes } from "./routes/StoreRoutes";

/**
 * Tienda + Admin separados en rutas (misma app local).
 * - /admin/* → backoffice
 * - /*       → tienda del cliente
 */
export default function App() {
  return useRoutes([...adminRoutes, ...storeRoutes]);
}
