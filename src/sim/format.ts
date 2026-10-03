/** Formats whole dollars for player-facing copy, e.g. $1,250,000. */
export function formatMoney(dollars: number): string {
  const sign = dollars < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(dollars)).toLocaleString('en-NZ')}`;
}

/** Formats tonnes of carbon to one decimal place, e.g. 6.5 t. */
export function formatTonnes(tonnes: number): string {
  return `${tonnes.toFixed(1)} t`;
}

export function formatSigned(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}
