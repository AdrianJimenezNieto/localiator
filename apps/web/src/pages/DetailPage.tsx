import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { CatalogDetail, ItemKind } from '@localiator/shared';
import { useApi } from '../lib/useApi';
import { useCart } from '../lib/cart';
import { conditionLabel, finalPriceCents, formatPrice } from '../lib/format';
import { Gallery } from '../components/Gallery';

// Página de ficha. `kind` lo fija la ruta (/productos/:id → 'product',
// /lotes/:id → 'lot') y decide qué endpoint público se consulta.
export function DetailPage({ kind }: { kind: ItemKind }) {
  const { id } = useParams<{ id: string }>();
  const basePath = kind === 'lot' ? 'lots' : 'products';
  const { data, error, status, loading } = useApi<CatalogDetail>(
    `/catalog/${basePath}/${id}`,
  );

  if (loading) {
    return <DetailSkeleton />;
  }

  // 404 (o artículo agotado/no visible): página limpia, no un crash.
  if (status === 404) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="mb-2 text-2xl font-bold">Este artículo no está disponible</h1>
        <p className="mb-6 text-neutral-500">
          Puede que se haya vendido o que el enlace no sea correcto.
        </p>
        <Link to="/" className="text-neutral-900 underline">
          Volver al catálogo
        </Link>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="rounded-md bg-red-50 p-4 text-red-700" role="alert">
          {error ?? 'No se pudo cargar el artículo.'}
        </p>
      </div>
    );
  }

  const hasDiscount = data.discountCents > 0;
  const finalCents = finalPriceCents(data.priceCents, data.discountCents);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="grid gap-8 md:grid-cols-2">
        <Gallery photos={data.photos} name={data.name} />

        <div className="flex flex-col gap-4">
          <div>
            <Link
              to={`/?categoryId=${data.category.id}`}
              className="text-sm text-neutral-500 underline hover:text-neutral-900"
            >
              {data.category.name}
            </Link>
            <h1 className="mt-1 text-2xl font-bold text-neutral-900">
              {data.name}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded bg-neutral-100 px-2 py-1 text-sm text-neutral-700">
              {conditionLabel(data.condition)}
            </span>
            <span
              className={`text-sm ${data.available ? 'text-green-700' : 'text-neutral-500'}`}
            >
              {data.available ? 'Disponible' : 'Agotado'}
            </span>
          </div>

          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold text-neutral-900">
              {formatPrice(finalCents)}
            </span>
            {hasDiscount && (
              <span className="text-lg text-neutral-400 line-through">
                {formatPrice(data.priceCents)}
              </span>
            )}
          </div>

          <p className="whitespace-pre-line text-neutral-700">{data.description}</p>

          {/* El estado y los desperfectos descritos arriba forman parte de lo
              acordado en la compra: lo enlazamos con la garantía de las condiciones
              de venta (tarea 04) para dar transparencia al comprador. */}
          <p className="text-sm text-neutral-500">
            Artículo de subasta: su estado ({conditionLabel(data.condition)}) y los
            desperfectos descritos forman parte de la venta. Consulta la{' '}
            <Link
              to="/condiciones-venta"
              className="underline hover:text-neutral-900"
            >
              garantía y condiciones de venta
            </Link>
            .
          </p>

          <AddToCart item={data} finalCents={finalCents} />
        </div>
      </div>
    </div>
  );
}

// Botón de añadir al carrito. Solo si el artículo está disponible; si no, se
// muestra deshabilitado. El feedback ("Añadido") es efímero para no navegar fuera
// de la ficha. La validación fuerte de stock la hace el servidor en la reserva
// (tarea 03); aquí solo respetamos `available`, ya que la ficha pública no expone
// el stock exacto a propósito.
function AddToCart({
  item,
  finalCents,
}: {
  item: CatalogDetail;
  finalCents: number;
}) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);

  if (!item.available) {
    return (
      <button
        type="button"
        disabled
        className="mt-2 w-full cursor-not-allowed rounded-md bg-neutral-200 px-4 py-3 font-medium text-neutral-500 sm:w-auto"
      >
        Agotado
      </button>
    );
  }

  function handleAdd() {
    add({
      itemType: item.kind,
      itemId: item.id,
      nameSnapshot: item.name,
      unitPriceCents: finalCents,
      photo: item.photos[0] ?? null,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={handleAdd}
      className="mt-2 w-full rounded-md bg-neutral-900 px-4 py-3 font-medium text-white hover:bg-neutral-800 sm:w-auto"
    >
      {added ? '✓ Añadido al carrito' : 'Añadir al carrito'}
    </button>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="grid gap-8 md:grid-cols-2">
        <div className="aspect-square w-full animate-pulse rounded-lg bg-neutral-200" />
        <div className="space-y-4">
          <div className="h-4 w-1/4 animate-pulse rounded bg-neutral-200" />
          <div className="h-8 w-3/4 animate-pulse rounded bg-neutral-200" />
          <div className="h-6 w-1/3 animate-pulse rounded bg-neutral-200" />
          <div className="h-24 w-full animate-pulse rounded bg-neutral-200" />
        </div>
      </div>
    </div>
  );
}
