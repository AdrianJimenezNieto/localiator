import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './lib/auth.tsx'
import { CartProvider } from './lib/cart.tsx'
import { HomePage } from './pages/HomePage.tsx'
import { HowItWorksPage } from './pages/HowItWorksPage.tsx'
import { CatalogPage } from './pages/CatalogPage.tsx'
import { DetailPage } from './pages/DetailPage.tsx'
import { CartPage } from './pages/CartPage.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { RegisterPage } from './pages/RegisterPage.tsx'
import { OAuthCallbackPage } from './pages/OAuthCallbackPage.tsx'
import { CheckoutPage } from './pages/CheckoutPage.tsx'
import { CheckoutResultPage } from './pages/CheckoutResultPage.tsx'
import { MyOrdersPage } from './pages/MyOrdersPage.tsx'
import { AuctionPage } from './pages/AuctionPage.tsx'
import { AuctionsListPage } from './pages/AuctionsListPage.tsx'
import { AuctionsCalendarPage } from './pages/AuctionsCalendarPage.tsx'
import { LegalPage } from './pages/LegalPage.tsx'
import { TermsPage } from './pages/TermsPage.tsx'
import { CookiesPage } from './pages/CookiesPage.tsx'
import { PrivacyPage } from './pages/PrivacyPage.tsx'
import { AccountPage } from './pages/AccountPage.tsx'
import { VerifyEmailPage } from './pages/VerifyEmailPage.tsx'
import { ResendVerificationPage } from './pages/ResendVerificationPage.tsx'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage.tsx'
import { ResetPasswordPage } from './pages/ResetPasswordPage.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'
import { ErrorPage } from './pages/ErrorPage.tsx'
import { OrdersAdminPage } from './pages/admin/OrdersAdminPage.tsx'
import { AdminLoginPage } from './pages/admin/AdminLoginPage.tsx'
import { ProtectedAdmin } from './pages/admin/ProtectedAdmin.tsx'
import { AdminLayout } from './pages/admin/AdminLayout.tsx'
import { ItemsAdminPage } from './pages/admin/ItemsAdminPage.tsx'
import { ItemFormPage } from './pages/admin/ItemFormPage.tsx'
import { AuctionsAdminPage } from './pages/admin/AuctionsAdminPage.tsx'
import { AuctionFormPage } from './pages/admin/AuctionFormPage.tsx'

// Rutas de la web: catálogo público (home + fichas) y backoffice /admin protegido
// por rol (ProtectedAdmin en el frontend + @Roles(ADMIN) en el backend).
const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    // errorElement: pantalla genérica de error (equivalente al 500 del servidor)
    // si algo revienta al renderizar cualquier ruta hija.
    errorElement: <ErrorPage />,
    children: [
      // La raíz era el catálogo. Ahora es una portada que explica qué es esto, y
      // el catálogo pasa a /catalogo. Las URLs de ficha, subastas y legales no
      // cambian, así que lo ya indexado en buscadores sigue resolviendo.
      { index: true, element: <HomePage /> },
      { path: 'catalogo', element: <CatalogPage /> },
      { path: 'como-funciona', element: <HowItWorksPage /> },
      { path: 'productos/:id', element: <DetailPage kind="product" /> },
      { path: 'productos/:id/:slug', element: <DetailPage kind="product" /> },
      { path: 'lotes/:id', element: <DetailPage kind="lot" /> },
      { path: 'lotes/:id/:slug', element: <DetailPage kind="lot" /> },
      { path: 'carrito', element: <CartPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'registro', element: <RegisterPage /> },
      { path: 'oauth/callback', element: <OAuthCallbackPage /> },
      { path: 'checkout', element: <CheckoutPage /> },
      { path: 'checkout/resultado', element: <CheckoutResultPage /> },
      { path: 'mis-pedidos', element: <MyOrdersPage /> },
      { path: 'subastas', element: <AuctionsListPage /> },
      // Antes de 'subastas/:id'. React Router prioriza el segmento estático sobre
      // el dinámico y funcionaría en cualquier orden, pero declararlo aquí evita
      // que se lea como si 'calendario' pudiera colarse como un id.
      { path: 'subastas/calendario', element: <AuctionsCalendarPage /> },
      { path: 'subastas/:id', element: <AuctionPage /> },
      { path: 'aviso-legal', element: <LegalPage /> },
      { path: 'condiciones-venta', element: <TermsPage /> },
      { path: 'cookies', element: <CookiesPage /> },
      { path: 'privacidad', element: <PrivacyPage /> },
      { path: 'cuenta', element: <AccountPage /> },
      { path: 'verificar-email', element: <VerifyEmailPage /> },
      { path: 'reenviar-verificacion', element: <ResendVerificationPage /> },
      { path: 'recuperar-password', element: <ForgotPasswordPage /> },
      { path: 'restablecer-password', element: <ResetPasswordPage /> },
      // Comodín: cualquier URL no reconocida cae en el 404 (dentro del layout).
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  { path: '/admin/login', element: <AdminLoginPage /> },
  {
    path: '/admin',
    element: <ProtectedAdmin />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { index: true, element: <Navigate to="/admin/productos" replace /> },
          { path: 'productos', element: <ItemsAdminPage kind="product" /> },
          { path: 'productos/nuevo', element: <ItemFormPage kind="product" /> },
          { path: 'productos/:id', element: <ItemFormPage kind="product" /> },
          { path: 'lotes', element: <ItemsAdminPage kind="lot" /> },
          { path: 'lotes/nuevo', element: <ItemFormPage kind="lot" /> },
          { path: 'lotes/:id', element: <ItemFormPage kind="lot" /> },
          { path: 'pedidos', element: <OrdersAdminPage /> },
          { path: 'subastas', element: <AuctionsAdminPage /> },
          { path: 'subastas/nuevo', element: <AuctionFormPage /> },
          { path: 'subastas/:id', element: <AuctionFormPage /> },
        ],
      },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <CartProvider>
        <RouterProvider router={router} />
      </CartProvider>
    </AuthProvider>
  </StrictMode>,
)
