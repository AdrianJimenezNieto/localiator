// Normaliza un texto a slug kebab-case apto para URLs (SEO): sin acentos, en
// minúsculas y con guiones. Se usa para autogenerar el slug de una categoría a
// partir de su nombre cuando el admin no lo indica a mano.
export function slugify(input: string): string {
  return input
    .normalize('NFD') // separa cada letra de su tilde (á → "a" + acento combinable).
    .replace(/[̀-ͯ]/g, '') // elimina los diacríticos ya separados.
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-') // todo lo no alfanumérico → guion.
    .replace(/^-+|-+$/g, ''); // sin guiones sobrantes al principio/final.
}
