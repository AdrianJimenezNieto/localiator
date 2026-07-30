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
import { CategoriesAdminPage } from './pages/admin/CategoriesAdminPage.tsx'

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
      { index: true, element: <CatalogPage /> },
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
          { path: 'categorias', element: <CategoriesAdminPage /> },
          { path: 'pedidos', element: <OrdersAdminPage /> },
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
