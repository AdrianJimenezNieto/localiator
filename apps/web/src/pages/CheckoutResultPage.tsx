import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCart } from '../lib/cart';

// Pantalla de retorno de Stripe. OJO: la verdad del pedido la da el WEBHOOK
// (tarea 06), no esta pantalla; aquí solo reflejamos el retorno del usuario. Por
// eso, en éxito vaciamos el carrito (por UX, el usuario ya pagó) pero NO marcamos
// nada como pagado desde el front.
export function CheckoutResultPage() {
  const [params] = useSearchParams();
  const status = params.get('status');
  const { clear } = useCart();
  const cleared = useRef(false);

  useEffect(() => {
    if (status === 'success' && !cleared.current) {
      cleared.current = true;
      clear();
    }
  }, [status, clear]);

  if (status === 'success') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="mb-2 text-2xl font-bold">¡Pago recibido!</h1>
        <p className="mb-6 text-neutral-600">
          Tu pedido está en preparación. Te avisaremos por email cuando esté
          listo para recoger en el almacén. Puedes ver su estado en tus pedidos.
        </p>
        <div className="flex justify-center gap-4">
          <Link to="/mis-pedidos" className="text-neutral-900 underline">
            Ver mis pedidos
          </Link>
          <Link to="/" className="text-neutral-900 underline">
            Seguir comprando
          </Link>
        </div>
      </div>
    );
  }

  // Cancelado o vuelta sin completar: el pedido sigue PENDING hasta que expire.
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="mb-2 text-2xl font-bold">Pago no completado</h1>
      <p className="mb-6 text-neutral-600">
        No se ha realizado ningún cargo. Tu carrito sigue disponible por si
        quieres intentarlo de nuevo.
      </p>
      <Link to="/carrito" className="text-neutral-900 underline">
        Volver al carrito
      </Link>
    </div>
  );
}
