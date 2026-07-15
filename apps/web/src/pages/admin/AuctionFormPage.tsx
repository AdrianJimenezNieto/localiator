import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiSend } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAuthedData } from '../../lib/useAuthedData';
import { type AdminAuction, type AdminItem } from '../../lib/adminTypes';
import { centsToEuros, eurosToCents } from '../../lib/format';
import { humanizeError } from './AuctionsAdminPage';

// Alta y edición de una subasta. En edición, la API decide qué se puede tocar según
// el estado; aquí se refleja deshabilitando los campos congelados. La UI NO valida:
// el servidor manda. Pero ofrecer un campo que siempre va a devolver
// AUCTION_HAS_BIDS es una trampa para el admin.
export function AuctionFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const { token } = useAuth();
  const navigate = useNavigate();

  // En alta hace falta la lista de artículos para elegir uno. Desplegable simple:
  // con el catálogo actual basta; en cuanto crezca hará falta un buscador.
  const { data: products } = useAuthedData<AdminItem[]>('/products', token);
  const { data: lots } = useAuthedData<AdminItem[]>('/lots', token);
  const { data: auctions } = useAuthedData<AdminAuction[]>(
    '/admin/auctions',
    token,
  );
  const existing = isEdit ? auctions?.find((a) => a.id === id) : undefined;

  const [itemType, setItemType] = useState<'PRODUCT' | 'LOT'>('PRODUCT');
  const [itemId, setItemId] = useState('');
  const [startingPrice, setStartingPrice] = useState('');
  const [minIncrement, setMinIncrement] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Al llegar la subasta a editar, se vuelca en el formulario.
  useEffect(() => {
    if (!existing) return;
    setItemType(existing.itemType);
    setItemId(existing.itemId);
    setStartingPrice(centsToEuros(existing.startingPriceCents));
    setMinIncrement(centsToEuros(existing.minIncrementCents));
    setStartsAt(toLocalInput(existing.startsAt));
    setEndsAt(toLocalInput(existing.endsAt));
  }, [existing]);

  // Con pujas puestas, las reglas y el inicio quedan congelados: cambiarlos
  // invalidaría pujas hechas bajo las reglas viejas (lo rechaza el servidor).
  const frozen = Boolean(existing && existing.bidCount > 0);
  // El artículo no se cambia nunca en una subasta ya creada: repuntarla a otro
  // producto cambiaría lo que la gente creía estar pujando.
  const itemLocked = isEdit;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (isEdit && existing) {
        // PATCH: SOLO lo que ha cambiado de verdad. Mandarlo todo sería incorrecto
        // por dos motivos. Semántico: un PATCH describe cambios. Y práctico: el
        // input datetime-local no tiene segundos, así que reenviar un `startsAt`
        // intacto lo recortaría a :00 y el servidor lo leería como una modificación
        // de las reglas, rechazando con AUCTION_HAS_BIDS una edición que no tocaba
        // el inicio.
        const payload: Record<string, number | string> = {};
        const nextStarting = eurosToCents(startingPrice);
        const nextIncrement = eurosToCents(minIncrement);
        if (
          nextStarting !== undefined &&
          nextStarting !== existing.startingPriceCents
        ) {
          payload.startingPriceCents = nextStarting;
        }
        if (
          nextIncrement !== undefined &&
          nextIncrement !== existing.minIncrementCents
        ) {
          payload.minIncrementCents = nextIncrement;
        }
        if (startsAt !== toLocalInput(existing.startsAt)) {
          payload.startsAt = new Date(startsAt).toISOString();
        }
        if (endsAt !== toLocalInput(existing.endsAt)) {
          payload.endsAt = new Date(endsAt).toISOString();
        }
        await apiSend(
          'PATCH',
          `/admin/auctions/${id}`,
          payload,
          token ?? undefined,
        );
      } else {
        await apiSend(
          'POST',
          '/admin/auctions',
          {
            itemType,
            itemId,
            startingPriceCents: eurosToCents(startingPrice),
            minIncrementCents: eurosToCents(minIncrement),
            startsAt: new Date(startsAt).toISOString(),
            endsAt: new Date(endsAt).toISOString(),
          },
          token ?? undefined,
        );
      }
      void navigate('/admin/subastas');
    } catch (err) {
      setError(humanizeError(err));
      setSaving(false);
    }
  }

  const items = itemType === 'LOT' ? lots : products;

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">
        {isEdit ? 'Editar subasta' : 'Nueva subasta'}
      </h1>

      {isEdit && !existing && <p className="text-neutral-500">Cargando…</p>}

      {frozen && (
        <p className="mb-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Esta subasta ya tiene {existing?.bidCount} puja(s). El precio de salida, el
          incremento y la fecha de inicio quedan bloqueados, porque cambiarlos
          invalidaría las pujas ya hechas. El cierre solo se puede <b>alargar</b>.
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo de artículo">
            <select
              value={itemType}
              disabled={itemLocked}
              onChange={(e) => {
                setItemType(e.target.value as 'PRODUCT' | 'LOT');
                setItemId('');
              }}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 disabled:bg-neutral-100"
            >
              <option value="PRODUCT">Producto</option>
              <option value="LOT">Lote</option>
            </select>
          </Field>

          <Field label="Artículo">
            <select
              value={itemId}
              disabled={itemLocked}
              required
              onChange={(e) => setItemId(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 disabled:bg-neutral-100"
            >
              <option value="">Selecciona…</option>
              {items?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Precio de salida (€)">
            <input
              type="number"
              step="0.01"
              min="0"
              required
              disabled={frozen}
              value={startingPrice}
              onChange={(e) => setStartingPrice(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 disabled:bg-neutral-100"
            />
          </Field>

          <Field label="Incremento mínimo (€)">
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              disabled={frozen}
              value={minIncrement}
              onChange={(e) => setMinIncrement(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 disabled:bg-neutral-100"
            />
          </Field>

          <Field label="Empieza">
            <input
              type="datetime-local"
              required
              disabled={frozen}
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 disabled:bg-neutral-100"
            />
          </Field>

          <Field label="Cierra">
            <input
              type="datetime-local"
              required
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
          </Field>
        </div>

        {!isEdit && (
          <p className="text-sm text-neutral-500">
            La subasta se crea <b>programada</b> y se abre sola al llegar su fecha de
            inicio (en el minuto siguiente), aunque la pongas en el pasado.
          </p>
        )}

        {error && (
          <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-neutral-900 px-5 py-2 font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            type="button"
            onClick={() => void navigate('/admin/subastas')}
            className="rounded-md border border-neutral-300 px-5 py-2 font-medium"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-neutral-700">
        {label}
      </span>
      {children}
    </label>
  );
}

// El input datetime-local trabaja en HORA LOCAL y sin zona ("2026-07-15T18:30"),
// mientras que la API habla ISO en UTC. Esta conversión (y el new Date(...) al
// enviar) es la frontera entre ambos: sin ella, una subasta se programaría con el
// desfase de la zona horaria.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const offsetMs = d.getTimezoneOffset() * 60 * 1000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
}
