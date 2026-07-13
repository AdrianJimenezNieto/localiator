import type { ReactNode } from 'react'
import { LEGAL_LAST_UPDATED } from '../lib/legal'

// Marco común de las páginas legales (aviso legal, condiciones, privacidad,
// cookies): mismo ancho, mismo título y misma nota de "última actualización".
// Centralizarlo evita repetir estilos y mantiene los cuatro documentos coherentes.
export function LegalLayout({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-3xl font-bold text-neutral-900">{title}</h1>
      {/* space-y-4 da separación uniforme entre párrafos y secciones sin tener
          que ponerla en cada elemento. */}
      <div className="space-y-4 leading-relaxed text-neutral-700">{children}</div>
      <p className="mt-10 border-t border-neutral-200 pt-4 text-sm text-neutral-400">
        Última actualización: {LEGAL_LAST_UPDATED}
      </p>
    </div>
  )
}

// Encabezado de sección reutilizable dentro de un documento legal.
export function LegalSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-2">
      <h2 className="pt-4 text-xl font-semibold text-neutral-900">{title}</h2>
      {children}
    </section>
  )
}
