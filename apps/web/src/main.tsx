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
import { CheckoutPage } from './pages/CheckoutPage.tsx'
import { CheckoutResultPage } from './pages/CheckoutResultPage.tsx'
import { MyOrdersPage } from './pages/MyOrdersPage.tsx'
import { LegalPage } from './pages/LegalPage.tsx'
import { TermsPage } from './pages/TermsPage.tsx'
import { CookiesPage } from './pages/CookiesPage.tsx'
import { PrivacyPage } from './pages/PrivacyPage.tsx'
import { AccountPage } from './pages/AccountPage.tsx'
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
    children: [
      { index: true, element: <CatalogPage /> },
      { path: 'productos/:id', element: <DetailPage kind="product" /> },
      { path: 'productos/:id/:slug', element: <DetailPage kind="product" /> },
      { path: 'lotes/:id', element: <DetailPage kind="lot" /> },
      { path: 'lotes/:id/:slug', element: <DetailPage kind="lot" /> },
      { path: 'carrito', element: <CartPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'registro', element: <RegisterPage /> },
      { path: 'checkout', element: <CheckoutPage /> },
      { path: 'checkout/resultado', element: <CheckoutResultPage /> },
      { path: 'mis-pedidos', element: <MyOrdersPage /> },
      { path: 'aviso-legal', element: <LegalPage /> },
      { path: 'condiciones-venta', element: <TermsPage /> },
      { path: 'cookies', element: <CookiesPage /> },
      { path: 'privacidad', element: <PrivacyPage /> },
      { path: 'cuenta', element: <AccountPage /> },
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
