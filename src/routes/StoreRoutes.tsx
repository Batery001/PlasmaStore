import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import type { RouteObject } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { Layout } from "../layout/Layout";
import { LandingHome } from "../screens/LandingHome";
import { Login } from "../screens/Login";
import { Register } from "../screens/Register";

const Catalog = lazy(() => import("../screens/Catalog").then((m) => ({ default: m.Catalog })));
const Cart = lazy(() => import("../screens/Cart").then((m) => ({ default: m.Cart })));
const Checkout = lazy(() => import("../screens/Checkout").then((m) => ({ default: m.Checkout })));
const CheckoutReserved = lazy(() => import("../screens/Checkout").then((m) => ({ default: m.CheckoutReserved })));
const ProductDetail = lazy(() => import("../screens/ProductDetail").then((m) => ({ default: m.ProductDetail })));
const SinglesCatalog = lazy(() => import("../screens/SinglesCatalog").then((m) => ({ default: m.SinglesCatalog })));
const EventsPage = lazy(() => import("../screens/EventsPage").then((m) => ({ default: m.EventsPage })));
const AboutPage = lazy(() => import("../screens/AboutPage").then((m) => ({ default: m.AboutPage })));
const Profile = lazy(() => import("../screens/Profile").then((m) => ({ default: m.Profile })));
const WebpayReturn = lazy(() => import("../screens/WebpayReturn").then((m) => ({ default: m.WebpayReturn })));
const TuuReturn = lazy(() => import("../screens/TuuReturn").then((m) => ({ default: m.TuuReturn })));
const ForgotPassword = lazy(() => import("../screens/ForgotPassword").then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import("../screens/ResetPassword").then((m) => ({ default: m.ResetPassword })));
const VerifyEmail = lazy(() => import("../screens/VerifyEmail").then((m) => ({ default: m.VerifyEmail })));
const LegalPage = lazy(() => import("../screens/LegalPage").then((m) => ({ default: m.LegalPage })));
const MyDecks = lazy(() => import("../screens/MyDecks").then((m) => ({ default: m.MyDecks })));
const DeckEdit = lazy(() => import("../screens/DeckEdit").then((m) => ({ default: m.DeckEdit })));
const DeckPdf = lazy(() => import("../screens/DeckPdf").then((m) => ({ default: m.DeckPdf })));

function Lazy({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p style={{ padding: "1.5rem", color: "#94a3b8" }}>Cargando…</p>}>{children}</Suspense>
  );
}

function SinglesOrRedirect() {
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/store/site-content")
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive) return;
        setEnabled(Boolean(ok && j?.ok && j.content?.singles_enabled));
        setReady(true);
      })
      .catch(() => {
        if (alive) {
          setEnabled(false);
          setReady(true);
        }
      });
    return () => {
      alive = false;
    };
  }, []);
  if (!ready) return <p style={{ padding: "1.5rem", color: "#94a3b8" }}>Cargando…</p>;
  if (!enabled) return <Navigate to="/eventos" replace />;
  return (
    <Lazy>
      <SinglesCatalog />
    </Lazy>
  );
}

/** Tienda: lo que ve el cliente. Landing/login se cargan ya; el resto bajo demanda. */
export const storeRoutes: RouteObject[] = [
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <LandingHome /> },
      { path: "login", element: <Login /> },
      { path: "registro", element: <Register /> },
      {
        path: "webpay/return",
        element: (
          <Lazy>
            <WebpayReturn />
          </Lazy>
        ),
      },
      {
        path: "tuu/return",
        element: (
          <Lazy>
            <TuuReturn />
          </Lazy>
        ),
      },
      {
        path: "olvide-password",
        element: (
          <Lazy>
            <ForgotPassword />
          </Lazy>
        ),
      },
      {
        path: "recuperar",
        element: (
          <Lazy>
            <ResetPassword />
          </Lazy>
        ),
      },
      {
        path: "verificar-email",
        element: (
          <Lazy>
            <VerifyEmail />
          </Lazy>
        ),
      },
      {
        path: "perfil",
        element: (
          <Lazy>
            <Profile />
          </Lazy>
        ),
      },
      {
        path: "mazos",
        element: (
          <Lazy>
            <MyDecks />
          </Lazy>
        ),
      },
      {
        path: "mazos/nuevo",
        element: (
          <Lazy>
            <DeckEdit />
          </Lazy>
        ),
      },
      {
        path: "mazos/:id/pdf",
        element: (
          <Lazy>
            <DeckPdf />
          </Lazy>
        ),
      },
      {
        path: "mazos/:id",
        element: (
          <Lazy>
            <DeckEdit />
          </Lazy>
        ),
      },
      {
        path: "catalogo",
        element: (
          <Lazy>
            <Catalog />
          </Lazy>
        ),
      },
      {
        path: "singles",
        element: <SinglesOrRedirect />,
      },
      {
        path: "eventos",
        element: (
          <Lazy>
            <EventsPage />
          </Lazy>
        ),
      },
      {
        path: "quienes-somos",
        element: (
          <Lazy>
            <AboutPage />
          </Lazy>
        ),
      },
      {
        path: "privacidad",
        element: (
          <Lazy>
            <LegalPage kind="privacidad" />
          </Lazy>
        ),
      },
      {
        path: "terminos",
        element: (
          <Lazy>
            <LegalPage kind="terminos" />
          </Lazy>
        ),
      },
      {
        path: "cookies",
        element: (
          <Lazy>
            <LegalPage kind="cookies" />
          </Lazy>
        ),
      },
      {
        path: "devoluciones",
        element: (
          <Lazy>
            <LegalPage kind="devoluciones" />
          </Lazy>
        ),
      },
      {
        path: "producto/:id",
        element: (
          <Lazy>
            <ProductDetail />
          </Lazy>
        ),
      },
      {
        path: "carrito",
        element: (
          <Lazy>
            <Cart />
          </Lazy>
        ),
      },
      {
        path: "checkout",
        element: (
          <Lazy>
            <Checkout />
          </Lazy>
        ),
      },
      {
        path: "checkout/listo",
        element: (
          <Lazy>
            <CheckoutReserved />
          </Lazy>
        ),
      },
      { path: "*", element: <Navigate to="catalogo" replace /> },
    ],
  },
];
