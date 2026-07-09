import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ItemCondition, ItemKind } from '@localiator/shared';
import { apiGet, apiSend, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import {
  itemBasePath,
  itemLabels,
  type AdminItem,
  type Category,
} from '../../lib/adminTypes';
import { centsToEuros, CONDITION_OPTIONS, eurosToCents } from '../../lib/format';
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
  const [condition, setCondition] = useState<ItemCondition>(
    CONDITION_OPTIONS[2].value, // GOOD por defecto.
  );
  const [priceEuros, setPriceEuros] = useState('');
  const [discountEuros, setDiscountEuros] = useState('');
  const [stock, setStock] = useState('0');
  const [categoryId, setCategoryId] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);

  const [categories, setCategories] = useState<Category[]>([]);
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
          setCondition(item.condition);
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
      condition,
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

  if (loading) {
    return <p className="text-neutral-500">Cargando…</p>;
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

        <Field label="Estado" htmlFor="condition">
          <select
            id="condition"
            value={condition}
            onChange={(e) => setCondition(e.target.value as ItemCondition)}
            className={inputClass}
          >
            {CONDITION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
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
            className="min-h-11 rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            type="button"
            onClick={() => navigate(listRoute)}
            className="min-h-11 rounded-md border border-neutral-300 px-4 py-2 font-medium hover:bg-neutral-100"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

const inputClass =
  'w-full rounded-md border border-neutral-300 px-3 py-2 focus:border-neutral-900 focus:outline-none';

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
