import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ItemKind } from '@localiator/shared';
import { apiGet, apiSend, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import {
  itemBasePath,
  itemLabels,
  type AdminItem,
  type Category,
} from '../../lib/adminTypes';
import { centsToEuros, eurosToCents } from '../../lib/format';
import { PhotoManager } from '../../components/admin/PhotoManager';

// Formulario de alta/edición de producto o lote. Si la ruta trae :id, es edición
// (precarga el artículo); si no, es alta. La validación cliente refleja los DTOs
// del backend, que es quien valida de verdad.
export function ItemFormPage({ kind }: { kind: ItemKind }) {
  const { token } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const labels = itemLabels(kind);
  const listRoute = `/admin/${kind === 'lot' ? 'lotes' : 'productos'}`;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priceEuros, setPriceEuros] = useState('');
  const [discountEuros, setDiscountEuros] = useState('');
  const [stock, setStock] = useState('0');
  const [categoryId, setCategoryId] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);

  const [categories, setCategories] = useState<Category[]>([]);
  // Alta rápida de categoría sin salir del formulario del artículo.
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  // Carga categorías (para el selector) y, si es edición, el artículo a editar.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cats = await apiGet<Category[]>('/categories', token ?? undefined);
        if (!cancelled) setCategories(cats);

        if (isEdit) {
          const item = await apiGet<AdminItem>(
            `${itemBasePath(kind)}/${id}`,
            token ?? undefined,
          );
          if (cancelled) return;
          setName(item.name);
          setDescription(item.description);
          setPriceEuros(centsToEuros(item.priceCents));
          setDiscountEuros(item.discountCents ? centsToEuros(item.discountCents) : '');
          setStock(String(item.stock));
          setCategoryId(item.categoryId);
          setPhotos(item.photos);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof ApiError ? err.message : 'No se pudo cargar');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isEdit, kind, token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const priceCents = eurosToCents(priceEuros);
    const discountCents = discountEuros === '' ? 0 : eurosToCents(discountEuros);
    if (priceCents === undefined || discountCents === undefined) {
      setError('Precio o descuento no válidos');
      return;
    }
    if (discountCents > priceCents) {
      setError('El descuento no puede ser mayor que el precio');
      return;
    }
    if (!categoryId) {
      setError('Elige una categoría');
      return;
    }

    const payload = {
      name,
      description,
      priceCents,
      discountCents,
      stock: Number(stock) || 0,
      categoryId,
      photos,
    };

    setSaving(true);
    try {
      if (isEdit) {
        await apiSend('PATCH', `${itemBasePath(kind)}/${id}`, payload, token ?? undefined);
      } else {
        await apiSend('POST', itemBasePath(kind), payload, token ?? undefined);
      }
      navigate(listRoute);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  // Crea la categoría vía API y la deja ya seleccionada en el desplegable. No es un
  // submit: vive dentro del <form> del artículo, así que se dispara con onClick.
  async function handleCreateCategory() {
    const name = newCategoryName.trim();
    if (!name) return;

    setError(null);
    setCategoryBusy(true);
    try {
      const cat = await apiSend<Category>(
        'POST',
        '/categories',
        { name },
        token ?? undefined,
      );
      setCategories((prev) =>
        [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setCategoryId(cat.id);
      setNewCategoryName('');
      setCreatingCategory(false);
    } catch (err) {
      // Típico: 409 si ya existe una categoría con ese slug.
      setError(err instanceof ApiError ? err.message : 'No se pudo crear la categoría');
    } finally {
      setCategoryBusy(false);
    }
  }

  if (loading) {
    return <p className="text-ink-500">Cargando…</p>;
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">
        {isEdit ? `Editar ${labels.singular.toLowerCase()}` : `Nuevo ${labels.singular.toLowerCase()}`}
      </h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Nombre" htmlFor="name">
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className={inputClass}
          />
        </Field>

        <Field label="Descripción" htmlFor="description">
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={4}
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Precio (€)" htmlFor="price">
            <input
              id="price"
              type="number"
              min="0"
              step="0.01"
              value={priceEuros}
              onChange={(e) => setPriceEuros(e.target.value)}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Descuento (€)" htmlFor="discount">
            <input
              id="discount"
              type="number"
              min="0"
              step="0.01"
              value={discountEuros}
              onChange={(e) => setDiscountEuros(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Stock" htmlFor="stock">
            <input
              id="stock"
              type="number"
              min="0"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Categoría" htmlFor="category">
            <div className="flex gap-2">
              <select
                id="category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                required
                className={inputClass}
              >
                <option value="">Elige…</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setCreatingCategory((v) => !v)}
                aria-expanded={creatingCategory}
                title="Nueva categoría"
                className="shrink-0 rounded-md border border-ink-300 px-3 py-2 font-medium hover:bg-ink-100"
              >
                {creatingCategory ? '×' : '+'}
              </button>
            </div>

            {creatingCategory && (
              <div className="mt-2 flex gap-2">
                <input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  // Enter aquí crearía el artículo (estamos dentro de su <form>),
                  // así que lo interceptamos para crear la categoría.
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleCreateCategory();
                    }
                  }}
                  placeholder="Nombre de la categoría"
                  aria-label="Nombre de la nueva categoría"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => void handleCreateCategory()}
                  disabled={categoryBusy || newCategoryName.trim() === ''}
                  className="shrink-0 rounded-md bg-ink-900 px-3 py-2 font-medium text-white disabled:opacity-50"
                >
                  {categoryBusy ? 'Creando…' : 'Crear'}
                </button>
              </div>
            )}
          </Field>
        </div>

        <PhotoManager photos={photos} onChange={setPhotos} />

        {error && (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="min-h-11 rounded-md bg-ink-900 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            type="button"
            onClick={() => navigate(listRoute)}
            className="min-h-11 rounded-md border border-ink-300 px-4 py-2 font-medium hover:bg-ink-100"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

const inputClass =
  'w-full rounded-md border border-ink-300 px-3 py-2 focus:border-ink-900 focus:outline-none';

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}
