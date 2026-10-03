/** Formats whole dollars for player-facing copy, e.g. $1,250,000. */
export function formatMoney(dollars: number): string {
  const sign = dollars < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(dollars)).toLocaleString('en-NZ')}`;
}

/** Formats tonnes of carbon to at least one and at most two decimal places, e.g. 8.0 t, 8.25 t. */
export function formatTonnes(tonnes: number): string {
  return `${tonnes.toFixed(Number.isInteger(tonnes * 10) ? 1 : 2)} t`;
}

export function formatSigned(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/** Short prices for map tags, e.g. $595k or $1.35m. */
export function formatPriceShort(dollars: number): string {
  const MILLION = 1_000_000;
  const THOUSAND = 1_000;
  if (dollars >= MILLION) return `$${Number((dollars / MILLION).toFixed(2))}m`;
  return `$${Math.round(dollars / THOUSAND)}k`;
}
