import { createBrowserRouter } from 'react-router'
import { AppLayout } from './components/layout/AppLayout'
import { Home } from './pages/Home'
import { Catalog } from './pages/Catalog'
import { ProductDetail } from './pages/ProductDetail'
import { Favorites } from './pages/Favorites'
import { Cart } from './pages/Cart'
import { Checkout } from './pages/Checkout'
import { OrderConfirmation } from './pages/OrderConfirmation'
import { Auth } from './pages/Auth'
import { Account } from './pages/account/Account'
import { Orders } from './pages/account/Orders'
import { Coupons } from './pages/account/Coupons'
import { Profile } from './pages/account/Profile'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'buscar', element: <Catalog /> },
      { path: 'categoria/:slug', element: <Catalog /> },
      { path: 'producto/:id', element: <ProductDetail /> },
      { path: 'favoritos', element: <Favorites /> },
      { path: 'carrito', element: <Cart /> },
      { path: 'checkout', element: <Checkout /> },
      { path: 'pedido/:id', element: <OrderConfirmation /> },
      { path: 'login', element: <Auth /> },
      { path: 'cuenta', element: <Account /> },
      { path: 'cuenta/pedidos', element: <Orders /> },
      { path: 'cuenta/favoritos', element: <Favorites /> },
      { path: 'cuenta/cupones', element: <Coupons /> },
      { path: 'cuenta/datos', element: <Profile /> },
    ],
  },
])
