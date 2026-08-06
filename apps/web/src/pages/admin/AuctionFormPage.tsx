import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiGet, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import {
  adminCreateAuction,
  adminGetAuction,
  adminUpdateAuction,
  type ApiAuctionStatus,
} from '../../lib/auctions';
import type { OrderItemType } from '../../lib/orders';
import { itemBasePath, type AdminItem } from '../../lib/adminTypes';
import { centsToEuros, eurosToCents } from '../../lib/format';

// Estados en los que updateAuction (backend) todavía deja editar algo.
const EDITABLE_STATUSES: ApiAuctionStatus[] = ['SCHEDULED', 'LIVE'];

// Formulario de alta/edición de subasta. Si la ruta trae :id, es edición. El
// tipo y el artículo de una subasta NO se pueden cambiar tras el alta
// (UpdateAuctionDto los excluye a propósito, ver auctions.service.ts): repuntar
// una subasta a otro producto a mitad de camino no tiene sentido de negocio.
export function AuctionFormPage() {
  const { token } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [itemType, setItemType] = useState<OrderItemType>('PRODUCT');
  const [itemId, setItemId] = useState('');
  const [startingPriceEuros, setStartingPriceEuros] = useState('');
  const [minIncrementEuros, setMinIncrementEuros] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  // Si hay pujas, el backend ya no deja tocar precio de salida, incremento ni
  // inicio (solo alargar el cierre): se refleja aquí para no dejar que el
  // admin rellene un formulario que el servidor va a rechazar igualmente.
  const [bidCount, setBidCount] = useState(0);
  const [status, setStatus] = useState<ApiAuctionStatus>('SCHEDULED');

  const [items, setItems] = useState<AdminItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  // Carga el catálogo del tipo elegido (para el selector de artículo) y, si es
  // edición, la subasta a editar.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const kind = itemType === 'LOT' ? 'lot' : 'product';
        const list = await apiGet<AdminItem[]>(itemBasePath(kind), token ?? undefined);
        if (!cancelled) setItems(list);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof ApiError ? err.message : 'No se pudo cargar el catálogo');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemType, token]);

  useEffect(() => {
    if (!isEdit) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const auction = await adminGetAuction(id!, token ?? '');
        if (cancelled) return;
        setItemType(auction.itemType);
        setItemId(auction.itemId);
        setStartingPriceEuros(centsToEuros(auction.startingPriceCents));
        setMinIncrementEuros(centsToEuros(auction.minIncrementCents));
        setStartsAt(toDatetimeLocal(auction.startsAt));
        setEndsAt(toDatetimeLocal(auction.endsAt));
        setBidCount(auction.bidCount);
        setStatus(auction.status);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof ApiError ? err.message : 'No se pudo cargar la subasta');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isEdit, token]);

  const hasBids = isEdit && bidCount > 0;
  const editable = !isEdit || EDITABLE_STATUSES.includes(status);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const startingPriceCents = eurosToCents(startingPriceEuros);
    const minIncrementCents = eurosToCents(minIncrementEuros);
    if (startingPriceCents === undefined || minIncrementCents === undefined) {
      setError('Precio de salida o incremento no válidos');
      return;
    }
    if (!itemId) {
      setError('Elige un artículo');
      return;
    }
    if (!startsAt || !endsAt) {
      setError('Falta la fecha de inicio o de cierre');
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        await adminUpdateAuction(
          id!,
          {
            ...(hasBids
              ? {}
              : { startingPriceCents, minIncrementCents, startsAt: fromDatetimeLocal(startsAt) }),
            endsAt: fromDatetimeLocal(endsAt),
          },
          token ?? '',
        );
      } else {
        await adminCreateAuction(
          {
            itemType,
            itemId,
            startingPriceCents,
            minIncrementCents,
            startsAt: fromDatetimeLocal(startsAt),
            endsAt: fromDatetimeLocal(endsAt),
          },
          token ?? '',
        );
      }
      navigate('/admin/subastas');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-ink-500">Cargando…</p>;
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">
        {isEdit ? 'Editar subasta' : 'Nueva subasta'}
      </h1>

      {!editable && (
        <p className="mb-4 rounded-md bg-ink-100 p-3 text-sm text-ink-600">
          Esta subasta ya está cerrada: no se puede editar.
        </p>
      )}
      {hasBids && editable && (
        <p className="mb-4 rounded-md bg-ink-100 p-3 text-sm text-ink-600">
          Ya tiene {bidCount} {bidCount === 1 ? 'puja' : 'pujas'}: solo se puede alargar el cierre.
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tipo de artículo" htmlFor="itemType">
            <select
              id="itemType"
              value={itemType}
              onChange={(e) => {
                setItemType(e.target.value as OrderItemType);
                setItemId('');
              }}
              disabled={isEdit}
              className={inputClass}
            >
              <option value="PRODUCT">Producto</option>
              <option value="LOT">Lote</option>
            </select>
          </Field>
          <Field label="Artículo" htmlFor="itemId">
            <select
              id="itemId"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              disabled={isEdit}
              required
              className={inputClass}
            >
              <option value="">Elige…</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Precio de salida (€)" htmlFor="startingPrice">
            <input
              id="startingPrice"
              type="number"
              min="0"
              step="0.01"
              value={startingPriceEuros}
              onChange={(e) => setStartingPriceEuros(e.target.value)}
              disabled={!editable || hasBids}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Incremento mínimo (€)" htmlFor="minIncrement">
            <input
              id="minIncrement"
              type="number"
              min="0"
              step="0.01"
              value={minIncrementEuros}
              onChange={(e) => setMinIncrementEuros(e.target.value)}
              disabled={!editable || hasBids}
              required
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Inicio" htmlFor="startsAt">
            <input
              id="startsAt"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              disabled={!editable || hasBids}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Cierre" htmlFor="endsAt">
            <input
              id="endsAt"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              disabled={!editable}
              required
              className={inputClass}
            />
          </Field>
        </div>

        {error && (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving || !editable}
            className="min-h-11 rounded-md bg-ink-900 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/subastas')}
            className="min-h-11 rounded-md border border-ink-300 px-4 py-2 font-medium hover:bg-ink-100"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

// datetime-local trabaja en hora LOCAL del navegador ("YYYY-MM-DDTHH:mm"), a
// diferencia del ISO en UTC que da la API: hay que convertir en los dos sentidos.
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(value: string): string {
  return new Date(value).toISOString();
}

const inputClass =
  'w-full rounded-md border border-ink-300 px-3 py-2 focus:border-ink-900 focus:outline-none disabled:bg-ink-100 disabled:text-ink-500';

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
