// Identidad enmascarada de un postor para mostrar en la UI sin revelar quién es
// (RGPD, CLAUDE.md). Nunca se emite email ni nombre por el canal en vivo. Se usan
// los últimos 4 caracteres del id (cuid): estable por usuario, así en la UI se ve
// que "Postor a1b2" sigue pujando, pero no se puede reconstruir la identidad.
export function maskBidder(userId: string): string {
  return `Postor ${userId.slice(-4)}`;
}
