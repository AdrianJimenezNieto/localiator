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
import { CatalogPage } from './pages/CatalogPage.tsx'
import { DetailPage } from './pages/DetailPage.tsx'
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
      { path: 'lotes/:id', element: <DetailPage kind="lot" /> },
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
        ],
      },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
)
