// Seed idempotente de datos de prueba (desarrollo). Usa `upsert` en todos los
// modelos para poder re-ejecutarse sin duplicar filas.
import { PrismaClient, ItemCondition, Role } from '@prisma/client';

const prisma = new PrismaClient();

// TODO(07-login-password): esto NO es un hash real. La tarea de login con
// argon2/bcrypt aún no existe, así que nadie puede autenticarse con estos
// usuarios todavía. Sustituir por un hash real cuando esa tarea se implemente
// (regla del repo: nunca commitear contraseñas en claro).
const TODO_HASH_PENDING = 'TODO_HASH_PENDING_ARGON2';

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: 'admin@localiator.dev' },
    update: {},
    create: {
      email: 'admin@localiator.dev',
      role: Role.ADMIN,
      passwordHash: TODO_HASH_PENDING,
      emailVerifiedAt: new Date(),
    },
  });

  const buyer = await prisma.user.upsert({
    where: { email: 'buyer@localiator.dev' },
    update: {},
    create: {
      email: 'buyer@localiator.dev',
      role: Role.BUYER,
      passwordHash: TODO_HASH_PENDING,
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

  console.log('Seed completado:', {
    usuarios: [admin.email, buyer.email],
    categorias: [electronica.slug, herramientas.slug, hogar.slug],
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
