// Convierte duraciones tipo "15m", "24h", "15d" a milisegundos. Se usa para
// calcular expiresAt del refresh token a partir de la config (.env). El access
// token no lo necesita: @nestjs/jwt acepta el string directamente en expiresIn.
const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

export function parseDurationMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) {
    throw new Error(
      `Duración no válida: "${value}". Usa formato como "15m", "24h", "15d".`,
    );
  }
  const amount = Number(match[1]);
  return amount * UNIT_MS[match[2]];
}
