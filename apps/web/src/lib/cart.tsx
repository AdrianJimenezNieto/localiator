import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ItemKind } from '@localiator/shared';

// Línea del carrito. Guarda un SNAPSHOT de lo mostrado (nombre, precio, foto) solo
// para pintar el carrito; el precio "de verdad" lo recalcula el servidor en el
// checkout (tarea 03) releyendo la BD. Nunca se confía en el precio del cliente.
export interface CartItem {
  itemType: ItemKind; // 'product' | 'lot'; se mapea a PRODUCT/LOT al hacer el pedido.
  itemId: string;
  nameSnapshot: string;
  unitPriceCents: number; // precio con descuento ya aplicado, solo informativo.
  photo: string | null;
  quantity: number;
}

interface CartContextValue {
  items: CartItem[];
  count: number; // nº total de unidades (para el indicador de la cabecera).
  totalCents: number; // total informativo; el vinculante lo fija el servidor.
  add: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void;
  remove: (itemType: ItemKind, itemId: string) => void;
  setQuantity: (itemType: ItemKind, itemId: string, quantity: number) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

// Clave VERSIONADA: si la forma de CartItem cambia en el futuro, subir a cart:v2
// evita leer datos viejos con otra estructura (que romperían la UI).
const STORAGE_KEY = 'cart:v1';

// Dos líneas son la misma si coinciden tipo + id (producto y lote comparten id
// space distinto, así que hace falta el tipo para no colisionar).
function sameItem(a: CartItem, key: { itemType: ItemKind; itemId: string }) {
  return a.itemType === key.itemType && a.itemId === key.itemId;
}

function loadInitial(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    // Validación defensiva: si el localStorage está corrupto o es de otra versión,
    // se descarta en vez de romper la app al arrancar.
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (i): i is CartItem =>
        typeof i === 'object' &&
        i !== null &&
        typeof (i as CartItem).itemId === 'string' &&
        typeof (i as CartItem).quantity === 'number',
    );
  } catch {
    return [];
  }
}

// Carrito EN CLIENTE (localStorage), no en servidor: más simple y barato, sin
// carritos huérfanos que limpiar en BD y coherente con el principio de coste
// mínimo (CLAUDE.md). La contrapartida (no se sincroniza entre dispositivos) es
// asumible en el MVP; si hiciera falta, se migra a servidor sin tocar el checkout.
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(loadInitial);

  // Persistir en cada cambio para sobrevivir a recargas.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const api = useMemo<CartContextValue>(() => {
    const add: CartContextValue['add'] = (item, quantity = 1) => {
      setItems((prev) => {
        const existing = prev.find((i) => sameItem(i, item));
        if (existing) {
          return prev.map((i) =>
            sameItem(i, item) ? { ...i, quantity: i.quantity + quantity } : i,
          );
        }
        return [...prev, { ...item, quantity }];
      });
    };

    const remove: CartContextValue['remove'] = (itemType, itemId) => {
      setItems((prev) =>
        prev.filter((i) => !sameItem(i, { itemType, itemId })),
      );
    };

    const setQuantity: CartContextValue['setQuantity'] = (
      itemType,
      itemId,
      quantity,
    ) => {
      // Cantidad 0 o negativa = quitar la línea (evita estados raros).
      if (quantity <= 0) {
        remove(itemType, itemId);
        return;
      }
      setItems((prev) =>
        prev.map((i) =>
          sameItem(i, { itemType, itemId }) ? { ...i, quantity } : i,
        ),
      );
    };

    const clear = () => setItems([]);

    return {
      items,
      count: items.reduce((n, i) => n + i.quantity, 0),
      totalCents: items.reduce((n, i) => n + i.unitPriceCents * i.quantity, 0),
      add,
      remove,
      setQuantity,
      clear,
    };
  }, [items]);

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart debe usarse dentro de <CartProvider>');
  }
  return ctx;
}
