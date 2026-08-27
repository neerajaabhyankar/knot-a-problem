// Tetrahedrally symmetric 4-component configurations, by construction.
//
// The symmetry is not something we hope for and then check. It is built in:
// we design ONE component, force it to be invariant under the 3-fold rotation
// about its own axis, and generate the other three as its images under the
// tetrahedral rotation group T. Whatever comes out has |T| = 12 symmetry
// exactly, for every parameter value, because there is no way for it not to.
//
// Labelling, throughout: component `i` belongs to face `F_i`, the face opposite
// vertex `v_i`. That pairing is what makes the problem fit the tetrahedron —
// the four 3-element subsets of the faces are exactly the four vertices, since
// the three faces meeting at `v_k` are precisely `{F_i : i != k}`. So
// "every 3-sublink is Borromean" reads as "the rings weave Borromean-style
// around each of the four vertices".

const SQRT3 = Math.sqrt(3);

/** A regular tetrahedron centred at the origin. Indices are 1-based: V[i]. */
export const V = [null, [1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];

/** +120 degrees about the (1,1,1) axis. Fixes v1, cycles v2 -> v3 -> v4. */
const R = ([x, y, z]) => [z, x, y];

/** The three 2-fold rotations, about the coordinate axes. Each maps v1 to v_i. */
const U = {
  2: ([x, y, z]) => [x, -y, -z], // (v1 v2)(v3 v4)
  3: ([x, y, z]) => [-x, y, -z], // (v1 v3)(v2 v4)
  4: ([x, y, z]) => [-x, -y, z], // (v1 v4)(v2 v3)
};

/** Coset representatives of stab(F_1) = {I, R, R^2} in T. g[i](C_1) = C_i. */
export const g = [null, (p) => p, U[2], U[3], U[4]];

/** An orthonormal basis of the plane perpendicular to v1 = (1,1,1). */
const E1 = [1 / Math.SQRT2, -1 / Math.SQRT2, 0];
const E2 = [1 / Math.sqrt(6), 1 / Math.sqrt(6), -2 / Math.sqrt(6)];
const N1 = [1 / SQRT3, 1 / SQRT3, 1 / SQRT3];

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/**
 * A flat regular k-gon in a plane perpendicular to v1, centred on that axis.
 * Invariant under R for every parameter value, because R restricted to this
 * plane is rotation by exactly 2*pi/3 and 3 | k. This is the family that
 * ReadMe.md section 4 proves cannot work.
 */
export function seed({ r = 1, theta = 0, t = -1 / 3, k = 3, per = 8 } = {}) {
  const centre = mul(V[1], t);
  const corner = (j) => {
    const a = theta + (2 * Math.PI * j) / k;
    return add(centre, add(mul(E1, r * Math.cos(a)), mul(E2, r * Math.sin(a))));
  };
  const points = [];
  for (let j = 0; j < k; j++) {
    const a = corner(j), b = corner((j + 1) % k);
    for (let s = 0; s < per; s++) points.push(add(a, mul(sub(b, a), s / per)));
  }
  return { points, closed: true };
}

/** The T-symmetric configuration built from a flat seed. */
export function config(opts = {}) {
  const c1 = seed(opts);
  return [1, 2, 3, 4].map((i) => ({ points: c1.points.map(g[i]), closed: true }));
}

/**
 * The general seed. The flat family above is provably dead (ReadMe.md §4), and
 * the reason is that a convex planar curve meets the shared edge-line in
 * exactly two points. So the seed has to be allowed to leave its face plane and
 * to stop being convex. Both are done without spending any symmetry:
 *
 *     P(phi) = t*v1 + rho(phi) * (cos phi E1 + sin phi E2) + z(phi) * n1
 *
 * is invariant under R for ANY rho and z of period 2*pi/3, because R is
 * rotation by exactly 2*pi/3 in the (E1, E2) plane and fixes n1. So every
 * configuration is still exactly tetrahedral — the search is over shapes,
 * never over symmetry.
 *
 * @param r        overall radius
 * @param t        plane offset along v1 (-1/3 is the face plane itself)
 * @param a3, th3  amplitude and phase of the 3-fold radial wobble
 * @param a6, th6  amplitude and phase of the 6-fold radial wobble
 * @param h3, p3   amplitude and phase of the 3-fold out-of-plane corrugation
 * @param h6, p6   amplitude and phase of the 6-fold out-of-plane corrugation
 * @param n        samples around the loop
 */
export function wavySeed({
  r = 1, t = -1 / 3, a3 = 0, th3 = 0, a6 = 0, th6 = 0,
  h3 = 0, p3 = 0, h6 = 0, p6 = 0, n = 72,
} = {}) {
  const centre = mul(V[1], t);
  const points = [];
  for (let i = 0; i < n; i++) {
    const f = (2 * Math.PI * i) / n;
    const rho = r * (1 + a3 * Math.cos(3 * (f - th3)) + a6 * Math.cos(6 * (f - th6)));
    const z = h3 * Math.cos(3 * (f - p3)) + h6 * Math.cos(6 * (f - p6));
    points.push(add(centre, add(add(mul(E1, rho * Math.cos(f)), mul(E2, rho * Math.sin(f))), mul(N1, z))));
  }
  return { points, closed: true };
}

/** The T-symmetric configuration built from a wavy seed. */
export function wavyConfig(opts = {}) {
  const c1 = wavySeed(opts);
  return [1, 2, 3, 4].map((i) => ({ points: c1.points.map(g[i]), closed: true }));
}

/** Closest approach between two components — the clearance the link needs. */
export function clearance(curves) {
  let best = Infinity;
  for (let a = 0; a < curves.length; a++) {
    for (let b = a + 1; b < curves.length; b++) {
      for (const p of curves[a].points) {
        for (const q of curves[b].points) {
          const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
          if (d < best) best = d;
        }
      }
    }
  }
  return best;
}

/**
 * Assert the thing we claim to have built. Not a tolerance — the group elements
 * are coordinate permutations and sign flips, so the images of the point set
 * are exact floats and set equality is the right test.
 */
export function checkSymmetry(curves, places = 6) {
  const key = (p) => p.map((x) => (+x.toFixed(places) + 0).toString()).join(',');
  const sets = curves.map((c) => new Set(c.points.map(key)));
  for (const h of [R, U[2], U[3], U[4]]) {
    for (let i = 0; i < curves.length; i++) {
      const moved = new Set(curves[i].points.map((p) => key(h(p))));
      const hit = sets.findIndex((s) => s.size === moved.size && [...moved].every((x) => s.has(x)));
      if (hit < 0) throw new Error(`symmetry broken: component ${i + 1} has no image`);
    }
  }
  return true;
}
