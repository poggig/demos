// Seeded RNG (mulberry32) + seed hashing. Pure — same seed, same sequence, in Node and browsers.

export function hashSeed(...parts) {
  // FNV-1a over the string form of every part → 32-bit unsigned
  let h = 0x811c9dc5;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x7c; // part separator
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rng {
  constructor(seed) { this.s = (seed >>> 0) || 0x9e3779b9; }
  next() { // [0, 1)
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); } // inclusive
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  weighted(w) { // w: { key: weight }
    let total = 0;
    for (const k in w) total += w[k];
    let r = this.next() * total;
    for (const k in w) { r -= w[k]; if (r < 0) return k; }
    return Object.keys(w)[0];
  }
}

/** Parse a ?seed= value: integers are used as-is, any other text is hashed. */
export function parseSeed(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  if (/^\d{1,9}$/.test(s)) return Number(s) >>> 0;
  return hashSeed('seed', s);
}

export function randomSeed() {
  try {
    const a = new Uint32Array(1);
    globalThis.crypto.getRandomValues(a);
    return a[0] % 1000000000;
  } catch {
    return Math.floor(Math.random() * 1e9);
  }
}
