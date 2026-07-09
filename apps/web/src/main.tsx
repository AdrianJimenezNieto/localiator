import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { CatalogPage } from './pages/CatalogPage.tsx'

// Rutas de la web. El catálogo público es la home; las fichas y el backoffice se
// añaden como hijas de este layout en tareas siguientes (11, 13).
const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [{ index: true, element: <CatalogPage /> }],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
