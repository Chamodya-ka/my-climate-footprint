/**
 * Mirrors focused UI text into an aria-live region, since screen readers
 * can't read the canvas.
 */
export function announce(message: string): void {
  const el = document.getElementById('sr-live');
  if (el) el.textContent = message;
}
