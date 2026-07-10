// Seed idempotente de datos de prueba (desarrollo). Usa `upsert` en todos los
// modelos para poder re-ejecutarse sin duplicar filas.
import {
  PrismaClient,
  ItemCondition,
  Role,
  OrderStatus,
  OrderItemType,
} from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Contraseña de desarrollo para los usuarios del seed. Ya existe el login con
// argon2 (Fase 1), así que guardamos un hash REAL (mismo algoritmo que
// PasswordService: argon2id) y estos usuarios pueden autenticarse de verdad.
// Es una credencial de DESARROLLO conocida, no un secreto: solo aplica a la BD
// local sembrada con datos de prueba.
const DEV_PASSWORD = 'Localiator123';

async function main() {
  const passwordHash = await argon2.hash(DEV_PASSWORD, {
    type: argon2.argon2id,
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@localiator.dev' },
    // update también, para que re-sembrar arregle el hash de una BD antigua.
    update: { passwordHash },
    create: {
      email: 'admin@localiator.dev',
      role: Role.ADMIN,
      passwordHash,
      emailVerifiedAt: new Date(),
    },
  });

  const buyer = await prisma.user.upsert({
    where: { email: 'buyer@localiator.dev' },
    update: { passwordHash },
    create: {
      email: 'buyer@localiator.dev',
      role: Role.BUYER,
      passwordHash,
      emailVerifiedAt: new Date(),
    },
  });

  const electronica = await prisma.category.upsert({
    where: { slug: 'electronica' },
    update: {},
    create: { name: 'Electrónica', slug: 'electronica' },
  });

  const herramientas = await prisma.category.upsert({
    where: { slug: 'herramientas' },
    update: {},
    create: { name: 'Herramientas', slug: 'herramientas' },
  });

  const hogar = await prisma.category.upsert({
    where: { slug: 'hogar' },
    update: {},
    create: { name: 'Hogar', slug: 'hogar' },
  });

  // Product y Lot no tienen ningún campo único aparte de `id` (son entidades
  // de seed, no de negocio, así que no se les añade un slug solo para esto).
  // Se fuerza el `id` en el `create` y se usa como clave del `upsert` para que
  // el seed sea idempotente sin tocar el schema.
  await prisma.product.upsert({
    where: { id: 'seed-product-taladro' },
    update: {},
    create: {
      id: 'seed-product-taladro',
      name: 'Taladro percutor Bosch',
      description: 'Taladro percutor semiprofesional, procedente de subasta.',
      condition: ItemCondition.GOOD,
      priceCents: 4500,
      discountCents: 0,
      stock: 3,
      photos: [],
      categoryId: herramientas.id,
    },
  });

  await prisma.product.upsert({
    where: { id: 'seed-product-auriculares' },
    update: {},
    create: {
      id: 'seed-product-auriculares',
      name: 'Auriculares inalámbricos',
      description: 'Auriculares con caja de carga, embalaje original abierto.',
      condition: ItemCondition.LIKE_NEW,
      priceCents: 2500,
      discountCents: 500,
      stock: 10,
      photos: [],
      categoryId: electronica.id,
    },
  });

  await prisma.product.upsert({
    where: { id: 'seed-product-batidora' },
    update: {},
    create: {
      id: 'seed-product-batidora',
      name: 'Batidora de vaso',
      description: 'Batidora de vaso, funciona correctamente, carcasa rayada.',
      condition: ItemCondition.FAIR,
      priceCents: 1800,
      discountCents: 0,
      stock: 5,
      photos: [],
      categoryId: hogar.id,
    },
  });

  await prisma.lot.upsert({
    where: { id: 'seed-lot-electronica-variado' },
    update: {},
    create: {
      id: 'seed-lot-electronica-variado',
      name: 'Lote electrónica variada',
      description: 'Palet de pequeña electrónica sin probar individualmente.',
      condition: ItemCondition.DAMAGED,
      priceCents: 12000,
      discountCents: 2000,
      stock: 1,
      photos: [],
      categoryId: electronica.id,
    },
  });

  await prisma.lot.upsert({
    where: { id: 'seed-lot-herramientas-taller' },
    update: {},
    create: {
      id: 'seed-lot-herramientas-taller',
      name: 'Lote herramientas de taller',
      description: 'Conjunto de herramientas manuales de distintos estados.',
      condition: ItemCondition.GOOD,
      priceCents: 9000,
      discountCents: 0,
      stock: 2,
      photos: [],
      categoryId: herramientas.id,
    },
  });

  // Pedido de ejemplo YA pagado (sin reserva viva, para no interferir con el
  // barrido de reservas expiradas de la tarea 07). Sirve para desarrollar la
  // vista "Mis pedidos" y el backoffice de pedidos sin tener que pasar por el
  // checkout completo. Idempotente por id fijo, como Product/Lot.
  const auricularesUnitPrice = 2500 - 500; // precio con descuento aplicado.
  await prisma.order.upsert({
    where: { id: 'seed-order-buyer-pagado' },
    update: {},
    create: {
      id: 'seed-order-buyer-pagado',
      userId: buyer.id,
      status: OrderStatus.PAID,
      totalCents: auricularesUnitPrice * 2,
      currency: 'eur',
      paidAt: new Date(),
      lines: {
        create: [
          {
            itemType: OrderItemType.PRODUCT,
            itemId: 'seed-product-auriculares',
            nameSnapshot: 'Auriculares inalámbricos',
            unitPriceCents: auricularesUnitPrice,
            quantity: 2,
            lineTotalCents: auricularesUnitPrice * 2,
          },
        ],
      },
    },
  });

  console.log('Seed completado:', {
    usuarios: [admin.email, buyer.email],
    categorias: [electronica.slug, herramientas.slug, hogar.slug],
    pedidos: ['seed-order-buyer-pagado'],
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
