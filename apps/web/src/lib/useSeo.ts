import { useEffect } from 'react'

interface SeoOptions {
  title: string
  description?: string
  // Imagen para compartir (og:image). Absoluta o relativa al origen.
  image?: string
  // Ruta canónica de la página (p. ej. /productos/:id/:slug). Deduplica ante los
  // buscadores las variantes de URL que apuntan al mismo contenido (id con o sin
  // slug). Si se omite, se usa la URL actual.
  canonicalPath?: string
}

// Actualiza los metadatos de <head> por página en la SPA: título, descripción,
// Open Graph y <link rel="canonical">. Es SEO client-side (coste cero, sin SSR):
// suficiente para el MVP; el prerender/SSR queda como mejora futura si hiciera
// falta más ranking (ver tarea 06).
//
// Trabaja sobre etiquetas ya presentes en index.html cuando existen, y crea las
// que falten. No limpia al desmontar: la siguiente página que use el hook
// sobrescribe los valores.
export function useSeo({ title, description, image, canonicalPath }: SeoOptions) {
  useEffect(() => {
    document.title = title
    setMeta('name', 'description', description)
    setMeta('property', 'og:title', title)
    setMeta('property', 'og:description', description)
    setMeta('property', 'og:image', image)

    const href = canonicalPath
      ? `${window.location.origin}${canonicalPath}`
      : window.location.href
    setCanonical(href)
  }, [title, description, image, canonicalPath])
}

// Crea o actualiza <meta [attr]="key" content="value">. Si value es undefined, no
// toca nada (deja el valor por defecto de index.html).
function setMeta(attr: 'name' | 'property', key: string, value?: string) {
  if (value === undefined) return
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', value)
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}
