import { Link } from 'react-router-dom';
import { useSeo } from '../lib/useSeo';
import { useReveal } from '../lib/useReveal';
import { btnPrimary, btnSecondary, card, container } from '../lib/ui';

// "Cómo funciona": la página que responde a las dudas que frenan una primera
// compra en una web desconocida (¿de dónde sale esto?, ¿en qué estado está?,
// ¿cómo lo recojo?, ¿cómo va lo de pujar?).
//
// El contenido es deliberadamente conservador con lo que promete: no inventa
// plazos, ni horarios de almacén, ni política de devoluciones concreta, porque
// esos datos todavía no están fijados. Donde hace falta un dato real, remite a
// las condiciones de venta en vez de arriesgar una cifra.
export function HowItWorksPage() {
  useSeo({
    title: 'Cómo funciona — Localiator',
    description:
      'Cómo comprar en Localiator: de dónde salen los artículos, en qué estado están, cómo se paga, cómo se recoge en almacén y cómo funcionan las subastas con puja automática.',
    canonicalPath: '/como-funciona',
  });

  const revealRef = useReveal<HTMLDivElement>();

  return (
    <div ref={revealRef}>
      <header className="border-b border-ink-200 bg-white">
        <div className={`${container} py-14`}>
          <h1 className="max-w-3xl text-3xl font-bold leading-tight text-ink-900 sm:text-4xl">
            Cómo funciona Localiator
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-600">
            Compramos lotes en plataformas de subastas profesionales, los
            revisamos en nuestro almacén y los publicamos aquí de uno en uno. Esto
            es todo lo que pasa entre medias.
          </p>
        </div>
      </header>

      <div className={`${container} grid gap-12 py-14 lg:grid-cols-[1fr_20rem]`}>
        <div className="space-y-10">
          <Block title="De dónde salen los artículos">
            <p>
              Compramos lotes completos en plataformas de subastas industriales.
              Suelen ser devoluciones, excedentes de almacén o material de
              liquidación. Todo se adquiere en España, así que no hay aduanas ni
              trámites de importación de por medio.
            </p>
            <p>
              Un lote puede llegar con decenas de artículos distintos. Lo abrimos,
              lo revisamos pieza a pieza y decidimos qué se vende suelto y qué se
              vende como lote completo.
            </p>
          </Block>

          <Block title="En qué estado están">
            <p>
              Muchos artículos tienen desperfectos: cajas abiertas, golpes,
              faltas de accesorios. No lo escondemos. Cada ficha lleva{' '}
              <strong className="font-semibold text-ink-900">
                fotografías reales del artículo concreto
              </strong>{' '}
              que vas a recibir, no imágenes de catálogo del fabricante, y la
              descripción cuenta lo que le pasa.
            </p>
            <p>
              Al ser material de subasta, cada artículo es único: cuando se vende,
              se acabó. No hay reposición de la misma unidad.
            </p>
          </Block>

          <Block title="Cómo se paga">
            <p>
              El pago es online con tarjeta, a través de Stripe. No pasamos por
              nuestros servidores ningún dato de tu tarjeta: los introduces
              directamente en la pasarela.
            </p>
            <p>
              Mientras completas el pedido te reservamos el artículo durante un
              rato, para que nadie te lo quite a mitad del pago. Si el pago no
              llega a completarse, la reserva caduca y el artículo vuelve al
              catálogo.
            </p>
          </Block>

          <Block title="Cómo se recoge">
            <p>
              De momento{' '}
              <strong className="font-semibold text-ink-900">no hacemos envíos</strong>
              : todos los pedidos se recogen en nuestro almacén. Te avisamos por
              email cuando el pedido esté preparado, y desde{' '}
              <Link to="/mis-pedidos" className="text-brand-700 underline underline-offset-2 hover:text-brand-800">
                Mis pedidos
              </Link>{' '}
              puedes seguir en qué punto está.
            </p>
            <p>
              Los datos concretos de dirección y horario van en el correo de
              confirmación y en las{' '}
              <Link to="/condiciones-venta" className="text-brand-700 underline underline-offset-2 hover:text-brand-800">
                condiciones de venta
              </Link>
              .
            </p>
          </Block>

          <Block title="Cómo funcionan las subastas">
            <p>
              Algunos artículos no salen a precio fijo, sino a subasta. Funcionan
              con{' '}
              <strong className="font-semibold text-ink-900">puja automática por máximo</strong>
              : no indicas cuánto quieres pujar ahora, sino el máximo que estás
              dispuesto a pagar.
            </p>
            <p>
              A partir de ahí el sistema puja por ti lo mínimo necesario para ir
              en cabeza, y va subiendo solo cuando alguien te disputa el artículo,
              sin pasar nunca de tu máximo. Tu máximo no lo ve nadie. Si alguien
              lo supera, te avisamos.
            </p>
            <p>
              Si llegan pujas en el último momento, el cierre se retrasa unos
              minutos automáticamente. Así nadie gana por pujar en el último
              segundo, y quien iba en cabeza tiene ocasión de responder.
            </p>
          </Block>
        </div>

        {/* Columna lateral: se pega al hacer scroll en escritorio para que la
            llamada a la acción siga a la vista durante toda la lectura. */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className={`reveal ${card} p-6`}>
            <h2 className="text-lg font-semibold text-ink-900">¿Lo vemos?</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">
              El catálogo cambia cada semana según lo que vaya entrando en el
              almacén.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Link to="/catalogo" className={btnPrimary}>
                Ver el catálogo
              </Link>
              <Link to="/subastas" className={btnSecondary}>
                Ver las subastas
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="reveal">
      <h2 className="text-xl font-bold text-ink-900 sm:text-2xl">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-ink-600">{children}</div>
    </section>
  );
}
