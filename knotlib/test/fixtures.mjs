// Curves to test against. Deliberately self-contained: knotlib must not import
// anything from the editor, and the tests must not either, or the boundary is
// only a claim.

const TAU = Math.PI * 2;
const sample = (n, f) => Array.from({ length: n }, (_, i) => f((i / n) * TAU));
const closed = (points) => ({ points, closed: true });

/** A (p, q) curve on a torus. gcd(p,q) = 1 gives the (p,q) torus knot. */
export const torus = (p, q, { n = 200, tube = 0.42, phase = 0 } = {}) =>
  closed(
    sample(n, (t) => {
      const r = 1 + tube * Math.cos(q * t + phase);
      return [r * Math.cos(p * t), r * Math.sin(p * t), tube * Math.sin(q * t + phase)];
    }),
  );

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/** The (p, q) torus link: gcd(p, q) components evenly spaced round the tube. */
export const torusLink = (p, q, opts = {}) => {
  const d = gcd(p, q);
  return Array.from({ length: d }, (_, k) => torus(p / d, q / d, { ...opts, phase: (TAU * k) / d }));
};

export const circle = ({ n = 80, r = 1, at = [0, 0, 0] } = {}) =>
  closed(sample(n, (t) => [at[0] + r * Math.cos(t), at[1] + r * Math.sin(t), at[2]]));

/** The figure-eight knot, 4₁ — the smallest amphichiral knot. */
export const figureEight = ({ n = 220 } = {}) =>
  closed(sample(n, (t) => [(2 + Math.cos(2 * t)) * Math.cos(3 * t), (2 + Math.cos(2 * t)) * Math.sin(3 * t), Math.sin(4 * t)]));

/** Two circles in perpendicular planes, each through the other. */
export const hopf = ({ n = 100, r = 1 } = {}) => [
  closed(sample(n, (t) => [r * Math.cos(t), r * Math.sin(t), 0])),
  closed(sample(n, (t) => [r + r * Math.cos(t), 0, r * Math.sin(t)])),
];

/** Borromean rings: three mutually perpendicular ellipses. Pairwise unlinked. */
export const borromean = ({ n = 140, a = 1, b = 0.55 } = {}) => [
  closed(sample(n, (t) => [0, a * Math.cos(t), b * Math.sin(t)])),
  closed(sample(n, (t) => [b * Math.sin(t), 0, a * Math.cos(t)])),
  closed(sample(n, (t) => [a * Math.cos(t), b * Math.sin(t), 0])),
];

/**
 * Two overlapping circles, one wholly above the other. Two crossings, the same
 * strand over at both — a removable bigon, and the unlink underneath it.
 */
export const overlappingPair = ({ n = 90 } = {}) => [
  circle({ n, at: [-0.7, 0, 0] }),
  circle({ n, at: [0.7, 0, 0.5] }),
];

/**
 * Three circles in Venn position at three different heights. Six crossings and
 * a central triangular face whose over-relation is a total order, so R3 applies
 * there. The counterexample is `borromean`, where it is cyclic.
 */
export const venn3 = ({ n = 110, r = 1, spread = 0.6 } = {}) =>
  [0, 1, 2].map((k) => {
    const a = (k / 3) * TAU + Math.PI / 2;
    return circle({ n, r, at: [spread * Math.cos(a), spread * Math.sin(a), k * 0.4] });
  });

/** Down the diagonal — the only view where all three Borromean rings read as rings. */
export const DIAGONAL = [1, 1, 1];
