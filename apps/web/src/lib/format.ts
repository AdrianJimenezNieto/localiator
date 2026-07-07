/** Formatea céntimos como euros, p. ej. 4500 -> "45,00 €" */
export function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}
