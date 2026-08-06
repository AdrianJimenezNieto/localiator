import { Link } from 'react-router-dom';
import type {
  AuctionListItem,
  CatalogItem,
  Paginated,
} from '@localiator/shared';
import { useApi } from '../lib/useApi';
import { useSeo } from '../lib/useSeo';
import { useReveal } from '../lib/useReveal';
import {
  btnOnDark,
  btnOnDarkOutline,
  btnPrimary,
  btnSecondary,
  card,
  container,
} from '../lib/ui';
import { ProductCard } from '../components/ProductCard';
import { AuctionCard } from '../components/AuctionCard';
import { Logo } from '../components/Logo';

// Página de inicio. Antes la raíz era directamente el catálogo, lo que obligaba a
// quien llegaba de un buscador a deducir qué es esto a partir de una rejilla de
// productos sueltos. Ahora el catálogo vive en /catalogo y el inicio explica la
// propuesta en una frase, enseña producto real (destacados y subastas en curso,
// que es lo que de verdad convence) y deja dos caminos claros: comprar ya o pujar.
export function HomePage() {
  useSeo({
    title: 'Localiator — Lotes y productos de subasta a precio de saldo',
    description:
      'Compra lotes y productos individuales procedentes de subastas, con recogida en almacén. Artículos únicos, fotografiados uno a uno y con su estado real descrito.',
    canonicalPath: '/',
  });

  // 8 destacados: dos filas de cuatro en escritorio. Suficiente para dar
  // sensación de surtido sin convertir el inicio en un segundo catálogo.
  const products = useApi<Paginated<CatalogItem>>(
    '/catalog/products?page=1&pageSize=8',
  );
  // Solo subastas en curso (LIVE): una subasta programada para dentro de dos
  // semanas no genera urgencia y ocuparía el sitio de una que sí.
  const auctions = useApi<Paginated<AuctionListItem>>(
    '/auctions?page=1&pageSize=3&status=LIVE',
  );

  const revealRef = useReveal<HTMLDivElement>();

  return (
    <div ref={revealRef}>
      <Hero />
      <HowItWorks />

      {/* Destacados. Si la petición falla no se pinta un error a toda página:
          el inicio sigue siendo útil aunque esta sección no cargue. */}
      {!products.error && (
        <Section
          title="Recién llegado al almacén"
          subtitle="Lo último que hemos dado de alta. Cada artículo es único: cuando vuela, vuela."
          action={{ to: '/catalogo', label: 'Ver todo el catálogo' }}
        >
          {products.loading ? (
            <CardGridSkeleton count={8} />
          ) : products.data && products.data.items.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {products.data.items.map((item) => (
                <div key={item.id} className="reveal">
                  <ProductCard item={item} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyNote>Estamos dando de alta los primeros artículos.</EmptyNote>
          )}
        </Section>
      )}

      {/* Subastas en curso: solo aparece si hay alguna viva. Una sección vacía
          titulada "Subastas en curso" transmite lo contrario de lo que busca. */}
      {!auctions.error &&
        !auctions.loading &&
        auctions.data &&
        auctions.data.items.length > 0 && (
          <Section
            title="Subastas en curso"
            subtitle="Puja por tu máximo y el sistema puja por ti lo mínimo necesario para ir en cabeza."
            action={{ to: '/subastas', label: 'Ver todas las subastas' }}
            tone="accent"
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {auctions.data.items.map((auction) => (
                <div key={auction.id} className="reveal">
                  <AuctionCard auction={auction} />
                </div>
              ))}
            </div>
          </Section>
        )}

      <FinalCta />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-ink-200 bg-white">
      {/* Fondo decorativo: dos manchas de color muy tenues y una rejilla. Da
          profundidad sin competir con el texto. aria-hidden porque no aporta
          nada a quien usa lector de pantalla. */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="absolute -right-20 top-10 h-72 w-72 rounded-full bg-accent-200/40 blur-3xl" />
      </div>

      <div
        className={`${container} relative grid items-center gap-10 py-16 lg:grid-cols-[1.1fr_1fr] lg:py-24`}
      >
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800 animate-fade-in">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-brand-500" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-600" />
            </span>
            Recogida en almacén · Sin gastos de envío
          </span>

          <h1 className="mt-5 text-4xl font-bold leading-[1.1] text-ink-900 sm:text-5xl lg:text-6xl">
            Lo que otros liquidan,{' '}
            <span className="relative inline-block">
              <span className="relative z-10">tú lo estrenas</span>
              {/* Subrayado a mano alzada bajo la frase clave: le da carácter sin
                  recurrir al degradado de rigor en los titulares. */}
              <svg
                className="absolute -bottom-1 left-0 h-3 w-full text-accent-400"
                viewBox="0 0 200 12"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d="M2 8c40-5 78-6 118-3 28 2 52 1 78-2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-600">
            Compramos lotes y productos sueltos en plataformas de subastas y los
            ponemos aquí a precio de saldo. Todo está en nuestro almacén,
            fotografiado uno a uno y con su estado descrito tal cual es. Lo
            compras online y lo recoges cuando te venga bien.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/catalogo" className={btnPrimary}>
              Ver el catálogo
            </Link>
            <Link to="/subastas" className={btnSecondary}>
              Ir a las subastas
            </Link>
          </div>
        </div>

        {/* Ilustración: el búho grande sobre un círculo de marca. Oculta en móvil
            porque ahí lo que importa es llegar antes al botón. */}
        <div className="relative hidden justify-center lg:flex">
          <div className="relative flex h-72 w-72 items-center justify-center rounded-full bg-accent-500 shadow-card">
            <Logo className="h-40 w-auto animate-float" title={null} />
          </div>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    title: 'Elige tu artículo',
    body: 'Producto suelto o lote completo. Filtra por categoría y precio, y mira las fotos reales antes de decidir.',
  },
  {
    title: 'Págalo online',
    body: 'Pago con tarjeta a través de Stripe. Te reservamos el artículo mientras completas el pedido.',
  },
  {
    title: 'Recógelo en el almacén',
    body: 'Te avisamos cuando esté listo. Sin gastos de envío ni esperas de mensajería.',
  },
];

function HowItWorks() {
  return (
    <section className={`${container} py-16`}>
      <div className="grid gap-6 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <div key={step.title} className={`reveal ${card} p-6`}>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 font-heading text-lg font-bold text-brand-700">
              {i + 1}
            </span>
            <h2 className="mt-4 text-lg font-semibold text-ink-900">
              {step.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Section({
  title,
  subtitle,
  action,
  tone = 'brand',
  children,
}: {
  title: string;
  subtitle: string;
  action: { to: string; label: string };
  tone?: 'brand' | 'accent';
  children: React.ReactNode;
}) {
  return (
    <section
      className={tone === 'accent' ? 'border-y border-ink-200 bg-accent-50/50' : ''}
    >
      <div className={`${container} py-16`}>
        <div className="reveal mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-ink-900 sm:text-3xl">{title}</h2>
            <p className="mt-2 max-w-2xl text-ink-600">{subtitle}</p>
          </div>
          <Link
            to={action.to}
            className={`text-sm font-semibold ${
              tone === 'accent'
                ? 'text-accent-700 hover:text-accent-800'
                : 'text-brand-700 hover:text-brand-800'
            }`}
          >
            {action.label} →
          </Link>
        </div>
        {children}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className={`${container} py-16`}>
      <div className="reveal overflow-hidden rounded-2xl bg-brand-800 px-8 py-14 text-center">
        <h2 className="text-2xl font-bold text-white sm:text-3xl">
          ¿Buscas algo en concreto?
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-brand-100">
          El almacén cambia cada semana. Échale un ojo al catálogo o mira qué
          subastas tenemos programadas para los próximos días.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/catalogo" className={btnOnDark}>
            Explorar el catálogo
          </Link>
          <Link to="/subastas/calendario" className={btnOnDarkOutline}>
            Ver el calendario
          </Link>
        </div>
      </div>
    </section>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-ink-300 py-12 text-center text-ink-500">
      {children}
    </p>
  );
}

// Rejilla fantasma mientras llega la respuesta, con la misma forma que las
// tarjetas reales para que al cargar no salte el layout.
function CardGridSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`${card} overflow-hidden`}>
          <div className="aspect-square w-full animate-pulse bg-ink-100" />
          <div className="space-y-2 p-4">
            <div className="h-4 w-3/4 animate-pulse rounded bg-ink-100" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-ink-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
