import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { CatalogPage } from './pages/CatalogPage.tsx'
import { DetailPage } from './pages/DetailPage.tsx'

// Rutas de la web. El catálogo público es la home; las fichas cuelgan del mismo
// layout. El backoffice se añade en la tarea 13.
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
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
