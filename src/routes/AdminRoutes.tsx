import { lazy, Suspense, type ReactNode } from "react";
import type { RouteObject } from "react-router-dom";
import { Navigate } from "react-router-dom";

const AdminLayout = lazy(() => import("../admin/AdminLayout").then((m) => ({ default: m.AdminLayout })));
const AdminDashboard = lazy(() => import("../screens/AdminDashboard").then((m) => ({ default: m.AdminDashboard })));
const AdminProducts = lazy(() => import("../screens/AdminProducts").then((m) => ({ default: m.AdminProducts })));
const AdminCarts = lazy(() => import("../screens/AdminCarts").then((m) => ({ default: m.AdminCarts })));
const AdminWidgets = lazy(() => import("../screens/AdminWidgets").then((m) => ({ default: m.AdminWidgets })));
const AdminTags = lazy(() => import("../screens/AdminTags").then((m) => ({ default: m.AdminTags })));
const AdminOrders = lazy(() => import("../screens/AdminOrders").then((m) => ({ default: m.AdminOrders })));
const AdminPayments = lazy(() => import("../screens/AdminPayments").then((m) => ({ default: m.AdminPayments })));
const AdminShipping = lazy(() => import("../screens/AdminShipping").then((m) => ({ default: m.AdminShipping })));
const AdminMail = lazy(() => import("../screens/AdminMail").then((m) => ({ default: m.AdminMail })));
const AdminSiteContent = lazy(() =>
  import("../screens/AdminSiteContent").then((m) => ({ default: m.AdminSiteContent }))
);
const AdminEvents = lazy(() => import("../screens/AdminEvents").then((m) => ({ default: m.AdminEvents })));
const AdminOps = lazy(() => import("../screens/AdminOps").then((m) => ({ default: m.AdminOps })));
const AdminCoupons = lazy(() => import("../screens/AdminCoupons").then((m) => ({ default: m.AdminCoupons })));
const AdminPosPage = lazy(() => import("../screens/AdminPosPage").then((m) => ({ default: m.AdminPosPage })));

function Lazy({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p style={{ padding: "1.5rem", color: "#94a3b8" }}>Cargando panel…</p>}>{children}</Suspense>
  );
}

/** Backoffice: no se descarga al abrir la tienda. */
export const adminRoutes: RouteObject[] = [
  {
    path: "/admin/pos",
    element: (
      <Lazy>
        <AdminPosPage />
      </Lazy>
    ),
  },
  {
    path: "/admin",
    element: (
      <Lazy>
        <AdminLayout />
      </Lazy>
    ),
    children: [
      { index: true, element: <Navigate to="panel" replace /> },
      {
        path: "panel",
        element: (
          <Lazy>
            <AdminDashboard />
          </Lazy>
        ),
      },
      { path: "venta", element: <Navigate to="/admin/pos" replace /> },
      {
        path: "productos",
        element: (
          <Lazy>
            <AdminProducts />
          </Lazy>
        ),
      },
      {
        path: "singles",
        element: <Navigate to="/admin/sitio" replace />,
      },
      {
        path: "sitio",
        element: (
          <Lazy>
            <AdminSiteContent />
          </Lazy>
        ),
      },
      {
        path: "eventos",
        element: (
          <Lazy>
            <AdminEvents />
          </Lazy>
        ),
      },
      {
        path: "etiquetas",
        element: (
          <Lazy>
            <AdminTags />
          </Lazy>
        ),
      },
      {
        path: "widgets",
        element: (
          <Lazy>
            <AdminWidgets />
          </Lazy>
        ),
      },
      {
        path: "carritos",
        element: (
          <Lazy>
            <AdminCarts />
          </Lazy>
        ),
      },
      {
        path: "ordenes",
        element: (
          <Lazy>
            <AdminOrders />
          </Lazy>
        ),
      },
      {
        path: "pagos",
        element: (
          <Lazy>
            <AdminPayments />
          </Lazy>
        ),
      },
      {
        path: "cupones",
        element: (
          <Lazy>
            <AdminCoupons />
          </Lazy>
        ),
      },
      {
        path: "envio",
        element: (
          <Lazy>
            <AdminShipping />
          </Lazy>
        ),
      },
      {
        path: "correo",
        element: (
          <Lazy>
            <AdminMail />
          </Lazy>
        ),
      },
      {
        path: "ops",
        element: (
          <Lazy>
            <AdminOps />
          </Lazy>
        ),
      },
    ],
  },
];
