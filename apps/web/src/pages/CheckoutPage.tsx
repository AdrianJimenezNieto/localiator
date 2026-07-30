import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useAuth, type PersonalData } from '../lib/auth';
import { useCart } from '../lib/cart';
import { createOrder, payOrder, type OrderView } from '../lib/orders';
import { formatPrice } from '../lib/format';
import { PersonalDataFields } from '../components/PersonalDataFields';

// Flujo de checkout. Al entrar crea el pedido en el servidor (tarea 03), que
// devuelve el total REAL y la caducidad de la reserva. El botón "Pagar" lanza la
// Checkout Session de Stripe (tarea 04) y redirige. La confirmación del pedido la
// da el WEBHOOK (tarea 06), no esta pantalla.
export function CheckoutPage() {
  const { user, token, ready } = useAuth();
  const { items } = useCart();

  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  // Evita crear el pedido dos veces (StrictMode invoca el efecto dos veces en dev).
  const created = useRef(false);

  useEffect(() => {
    // Sin perfil completo (identidad + dirección de facturación) no se crea
    // pedido todavía: se pide primero (ver el gate más abajo), para no dejar
    // corriendo el contador de la reserva mientras el usuario rellena datos.
    if (!ready || !user || !token || !user.profileComplete) return;
    if (created.current) return;
    if (items.length === 0) {
      setLoading(false);
      return;
    }
    created.current = true;

    createOrder(
      items.map((i) => ({
        // El carrito guarda 'product'/'lot'; la API espera PRODUCT/LOT.
        itemType: i.itemType === 'lot' ? 'LOT' : 'PRODUCT',
        itemId: i.itemId,
        quantity: i.quantity,
      })),
      token,
    )
      .then((o) => setOrder(o))
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 403) {
          setError(
            'Debes verificar tu email antes de comprar. Revisa tu bandeja de entrada.',
          );
        } else if (err instanceof ApiError && err.status === 409) {
          // Sin stock o reserva expirada: hay que revisar el carrito.
          setError(err.message);
        } else {
          setError(
            err instanceof ApiError ? err.message : 'No se pudo crear el pedido',
          );
        }
      })
      .finally(() => setLoading(false));
  }, [ready, user, token, items]);

  // Gating: sin sesión, a login conservando el destino (el carrito sobrevive solo).
  if (ready && !user) {
    return <Navigate to="/login?redirect=/checkout" replace />;
  }

  // Cuenta sin perfil completo (típico de un primer login con Google): pedimos
  // los datos antes de crear el pedido, con el mismo formulario del registro.
  if (ready && user && !user.profileComplete) {
    return <CompleteProfileGate />;
  }

  if (!ready || loading) {
    return <p className="mx-auto max-w-2xl px-4 py-16 text-center text-neutral-500">Preparando tu pedido…</p>;
  }

  if (items.length === 0 && !order) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="mb-2 text-2xl font-bold">No hay nada que pagar</h1>
        <Link to="/" className="text-neutral-900 underline">
          Ir al catálogo
        </Link>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <p className="mb-6 rounded-md bg-red-50 p-4 text-red-700" role="alert">
          {error ?? 'No se pudo preparar el pedido.'}
        </p>
        <Link to="/carrito" className="text-neutral-900 underline">
          Volver al carrito
        </Link>
      </div>
    );
  }

  async function handlePay() {
    if (!order || !token) return;
    setPaying(true);
    setError(null);
    try {
      const { url } = await payOrder(order.id, token);
      // Redirige a la página de pago alojada por Stripe.
      window.location.href = url;
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo iniciar el pago',
      );
      setPaying(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Confirmar y pagar</h1>

      <ul className="mb-4 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
        {order.lines.map((line) => (
          <li
            key={`${line.itemType}:${line.itemId}`}
            className="flex items-center justify-between gap-4 p-4"
          >
            <span className="min-w-0 truncate">
              {line.nameSnapshot}{' '}
              <span className="text-neutral-500">× {line.quantity}</span>
            </span>
            <span className="font-medium">
              {formatPrice(line.lineTotalCents)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mb-6 flex items-center justify-between">
        <span className="text-lg font-semibold">Total</span>
        <span className="text-lg font-bold">{formatPrice(order.totalCents)}</span>
      </div>

      <ReservationCountdown expiresAt={order.expiresAt} />

      <button
        type="button"
        onClick={handlePay}
        disabled={paying}
        className="mt-4 w-full rounded-md bg-neutral-900 px-6 py-3 font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {paying ? 'Redirigiendo a Stripe…' : 'Pagar con tarjeta'}
      </button>

      <p className="mt-3 text-center text-xs text-neutral-400">
        Pago seguro procesado por Stripe. No guardamos datos de tu tarjeta.
      </p>
    </div>
  );
}

const EMPTY_PROFILE: PersonalData = {
  firstName: '',
  lastName: '',
  birthDate: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  postalCode: '',
  city: '',
  province: '',
  country: 'ES',
};

// Formulario de "completa tu registro" para cuentas sin perfil (login social).
// Mismos campos/validaciones que RegisterPage vía PersonalDataFields; al
// guardar, updateProfile refresca `user.profileComplete` y CheckoutPage
// continúa solo (esta pantalla desaparece porque deja de cumplirse el gate).
function CompleteProfileGate() {
  const { updateProfile } = useAuth();
  const [form, setForm] = useState<PersonalData>(EMPTY_PROFILE);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof PersonalData>(key: K, value: PersonalData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await updateProfile({
        ...form,
        phone: form.phone?.trim() ? form.phone.trim() : undefined,
        addressLine2: form.addressLine2?.trim()
          ? form.addressLine2.trim()
          : undefined,
      });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo guardar tus datos',
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <h1 className="mb-2 text-2xl font-bold">Completa tus datos</h1>
      <p className="mb-6 text-neutral-600">
        Necesitamos tu nombre y dirección de facturación antes de poder
        tramitar el pedido.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <PersonalDataFields form={form} set={set} />

        {error && (
          <p
            className="rounded-md bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="min-h-11 rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Guardando…' : 'Continuar'}
        </button>
      </form>
    </div>
  );
}

// Cuenta atrás de la reserva. Solo informativo: la validación real de la
// expiración la hace el servidor al pagar (tarea 04).
function ReservationCountdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, new Date(expiresAt).getTime() - Date.now()),
  );

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (remaining <= 0) {
    return (
      <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
        La reserva ha caducado. Si el pago falla, vuelve al carrito y tramita el
        pedido de nuevo.
      </p>
    );
  }

  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return (
    <p className="rounded-md bg-neutral-100 p-3 text-sm text-neutral-600">
      Stock reservado durante{' '}
      <span className="font-semibold text-neutral-900">
        {minutes}:{seconds.toString().padStart(2, '0')}
      </span>
      . Completa el pago antes de que expire.
    </p>
  );
}
