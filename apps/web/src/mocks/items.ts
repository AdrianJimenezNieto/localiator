import { ItemKind } from '@localiator/shared'
import type { Item } from '../types/domain'

export const items: Item[] = [
  {
    kind: ItemKind.PRODUCT,
    id: 'p-1',
    title: 'Taladro percutor Bosch',
    description: 'Taladro percutor con maletín y dos baterías. Probado, funciona correctamente.',
    price: 4500,
    originalPrice: 6900,
    images: [],
    categorySlug: 'herramientas',
    warehouseId: 'wh-madrid',
    stock: 1,
    condition: 'usado',
  },
  {
    kind: ItemKind.PRODUCT,
    id: 'p-2',
    title: 'Auriculares inalámbricos',
    description: 'Auriculares con cancelación de ruido, caja de carga incluida.',
    price: 2500,
    images: [],
    categorySlug: 'electronica',
    warehouseId: 'wh-madrid',
    stock: 3,
    condition: 'nuevo',
  },
  {
    kind: ItemKind.PRODUCT,
    id: 'p-3',
    title: 'Bicicleta estática',
    description: 'Bicicleta estática plegable, devolución de cliente sin usar.',
    price: 9000,
    originalPrice: 12000,
    images: [],
    categorySlug: 'deporte',
    warehouseId: 'wh-valencia',
    stock: 1,
    condition: 'devolucion',
  },
  {
    kind: ItemKind.LOT,
    id: 'l-1',
    title: 'Lote de menaje de cocina',
    description: 'Conjunto de ollas, sartenes y utensilios variados.',
    price: 3200,
    images: [],
    categorySlug: 'hogar',
    warehouseId: 'wh-madrid',
    condition: 'usado',
    items: [
      { name: 'Sartén 24cm', qty: 2, condition: 'usado' },
      { name: 'Olla 5L', qty: 1, condition: 'usado' },
      { name: 'Juego de cubiertos', qty: 1, condition: 'nuevo' },
    ],
  },
  {
    kind: ItemKind.LOT,
    id: 'l-2',
    title: 'Lote de juguetes surtidos',
    description: 'Juguetes variados de diferentes marcas, algunos sin abrir.',
    price: 1800,
    images: [],
    categorySlug: 'juguetes',
    warehouseId: 'wh-valencia',
    condition: 'nuevo',
    items: [
      { name: 'Set construcción', qty: 3, condition: 'nuevo' },
      { name: 'Peluche', qty: 5, condition: 'nuevo' },
    ],
  },
]

export function getItemById(id: string): Item | undefined {
  return items.find((item) => item.id === id)
}
