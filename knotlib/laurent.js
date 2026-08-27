// Laurent polynomials in one variable over ℤ.
//
// Small enough to be obvious, which is the point: the Kauffman bracket is a sum
// over 2ⁿ states and a polynomial bug there is invisible until an invariant
// quietly stops being invariant.
//
// Representation: { lo, c } where c[i] is the coefficient of x^(lo + i).
// Always trimmed, so `equal` can compare structurally and the zero polynomial
// has exactly one representation.

export const ZERO = Object.freeze({ lo: 0, c: [] });

function trim(lo, c) {
  let a = 0;
  let b = c.length;
  while (a < b && c[a] === 0) a++;
  while (b > a && c[b - 1] === 0) b--;
  return a === b ? ZERO : { lo: lo + a, c: c.slice(a, b) };
}

/** The monomial `coeff · x^k`. */
export function mono(k, coeff = 1) {
  return coeff === 0 ? ZERO : { lo: k, c: [coeff] };
}

export const one = () => mono(0, 1);

export function isZero(p) {
  return p.c.length === 0;
}

export function add(a, b) {
  if (isZero(a)) return b;
  if (isZero(b)) return a;
  const lo = Math.min(a.lo, b.lo);
  const hi = Math.max(a.lo + a.c.length, b.lo + b.c.length);
  const c = new Array(hi - lo).fill(0);
  for (let i = 0; i < a.c.length; i++) c[a.lo + i - lo] += a.c[i];
  for (let i = 0; i < b.c.length; i++) c[b.lo + i - lo] += b.c[i];
  return trim(lo, c);
}

export function mul(a, b) {
  if (isZero(a) || isZero(b)) return ZERO;
  const c = new Array(a.c.length + b.c.length - 1).fill(0);
  for (let i = 0; i < a.c.length; i++) {
    if (a.c[i] === 0) continue;
    for (let j = 0; j < b.c.length; j++) c[i + j] += a.c[i] * b.c[j];
  }
  return trim(a.lo + b.lo, c);
}

/** Multiply by `k · x^shift`. */
export function scale(p, k, shift = 0) {
  return k === 0 ? ZERO : trim(p.lo + shift, p.c.map((v) => v * k));
}

/** x ↦ x⁻¹. Mirroring a knot does exactly this to its Jones polynomial. */
export function reflect(p) {
  return isZero(p) ? ZERO : { lo: 1 - p.lo - p.c.length, c: [...p.c].reverse() };
}

export function pow(p, k) {
  let out = one();
  for (let i = 0; i < k; i++) out = mul(out, p);
  return out;
}

export function equal(a, b) {
  return a.lo === b.lo && a.c.length === b.c.length && a.c.every((v, i) => v === b.c[i]);
}

/** Non-zero terms as `[exponent, coefficient]`, lowest exponent first. */
export function terms(p) {
  return p.c.map((v, i) => [p.lo + i, v]).filter(([, v]) => v !== 0);
}

/** True if the coefficient sequence reads the same backwards — an amphichiral knot's Jones polynomial does. */
export function palindromic(p) {
  return equal(p, reflect(p));
}

export function toString(p, v = 'A') {
  const t = terms(p);
  if (!t.length) return '0';
  return t
    .map(([e, k], i) => {
      const sign = k < 0 ? '-' : i ? '+' : '';
      const mag = Math.abs(k);
      const num = mag === 1 && e !== 0 ? '' : String(mag);
      const va = e === 0 ? '' : e === 1 ? v : `${v}^${e}`;
      return `${sign}${num}${va}`;
    })
    .join(' ')
    .replace(/^- /, '-');
}
