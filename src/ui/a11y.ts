/**
 * Mirrors focused UI text into an aria-live region, since screen readers
 * can't read the canvas.
 */
export function announce(message: string): void {
  const el = document.getElementById('sr-live');
  if (el) el.textContent = message;
}

/** True when the player has asked their system for less motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}
