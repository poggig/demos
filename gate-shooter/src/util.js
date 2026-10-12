// Small shared helpers.

/** Compact number, truncated (never rounds up a bracket): 9999 → "9999", 12345 → "12.3K",
 *  99999 → "99.9K", 999999 → "999K", 1234567 → "1.23M", 9999999 → "9.99M". */
export function fmtNum(n) {
  n = Math.max(0, Math.floor(n));
  if (n < 1e4) return String(n);
  if (n < 1e5) return (Math.floor(n / 100) / 10).toFixed(1) + 'K';
  if (n < 1e6) return Math.floor(n / 1e3) + 'K';
  if (n < 1e7) return (Math.floor(n / 1e4) / 100).toFixed(2) + 'M';
  return (Math.floor(n / 1e5) / 10).toFixed(1) + 'M';
}

/** Distance in px → metres shown to the player (1 m = 10 px). */
export const metres = px => Math.floor(px / 10);

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
