// Woven frames of regular polygons: the geometry behind Robert Lang's
// Himalayan Peaks polypolyhedra.
//
// THE SHAPE OF THE PROBLEM. Each model is N congruent regular polygons, one
// per axis of a symmetry group, woven through one another. Build ONE polygon
// so that the stabiliser of its axis maps it to itself, and the group makes
// the rest: the result is exactly symmetric at every parameter value, because
// there is nowhere for the symmetry to leak out. Same trick as
// `four-borromean/tetra.mjs`, with the group swapped out.
//
//   Gasherbrum : 4 triangles, one per 3-fold axis of the tetrahedral group (12)
//   Makalu     : 6 pentagons, one per 5-fold axis of the icosahedral group (60)
//
// A polygon is fixed by three numbers: the circumradius `r`, the twist `theta`
// about its axis, and the offset `h` of its plane from the centre. Scale is
// free, so `r` is pinned at 1 and the shape is (theta, h).

const PHI = (1 + Math.sqrt(5)) / 2;

export const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
export const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
export const mul = (a, s) => [a[0]*s, a[1]*s, a[2]*s];
export const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
export const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a) => mul(a, 1 / len(a));

// --------------------------------------------------------------- matrices
const apply = (m, p) => [dot(m[0], p), dot(m[1], p), dot(m[2], p)];
const matmul = (a, b) => a.map((row) => [0,1,2].map((j) => row[0]*b[0][j] + row[1]*b[1][j] + row[2]*b[2][j]));
const ID = [[1,0,0],[0,1,0],[0,0,1]];

/** Rotation by `angle` about `axis`, as a 3x3 matrix (Rodrigues). */
export function rotation(axis, angle) {
  const [x, y, z] = unit(axis), c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  return [
    [t*x*x + c,   t*x*y - s*z, t*x*z + s*y],
    [t*x*y + s*z, t*y*y + c,   t*y*z - s*x],
    [t*x*z - s*y, t*y*z + s*x, t*z*z + c  ],
  ];
}

/** Every rotation reachable from the generators. Exact-ish: deduped to 1e-9. */
export function closure(generators) {
  const key = (m) => m.flat().map((x) => (Math.abs(x) < 1e-9 ? 0 : x).toFixed(7)).join(',');
  const group = new Map([[key(ID), ID]]);
  const queue = [ID];
  while (queue.length) {
    const g = queue.shift();
    for (const s of generators) {
      const p = matmul(s, g), k = key(p);
      if (!group.has(k)) { group.set(k, p); queue.push(p); }
    }
  }
  return [...group.values()];
}

/** The 12 rotations of a regular tetrahedron, in the coordinates of its vertices. */
export const TETRAHEDRAL = closure([
  rotation([1, 1, 1], 2 * Math.PI / 3),
  rotation([1, 0, 0], Math.PI),
]);

/**
 * The 60 rotations of a regular icosahedron with vertices (0, +-1, +-phi) cyclic.
 *
 * The second generator has to be a half-turn about an axis NOT perpendicular to
 * the first: the x-axis is perpendicular to (0,1,phi), and the two together
 * close up into the ten rotations of a single pentagon rather than the group.
 */
export const ICOSAHEDRAL = closure([
  rotation([0, 1, PHI], 2 * Math.PI / 5),
  rotation([0, 0, 1], Math.PI),
]);

/** The four 3-fold axes: the vertices of the tetrahedron. */
export const TETRA_AXES = [[1,1,1], [1,-1,-1], [-1,1,-1], [-1,-1,1]].map(unit);

/** The six 5-fold axes: the vertices of the icosahedron, one per antipodal pair. */
export const ICOSA_AXES = [[0,1,PHI], [0,1,-PHI], [1,PHI,0], [1,-PHI,0], [PHI,0,1], [-PHI,0,1]].map(unit);

/**
 * A regular `n`-gon of circumradius `r`, in the plane perpendicular to `axis`
 * at distance `h` from the centre, turned by `theta` about the axis.
 *
 * `ref` fixes where theta is measured from, and it has to be chosen from the
 * geometry rather than arbitrarily, or the polygon's twist means something
 * different on every axis and the group cannot carry one to another.
 */
export function polygon(axis, { n, r = 1, theta = 0, h = 0, ref }) {
  const w = unit(axis);
  const u = unit(sub(ref, mul(w, dot(ref, w))));   // ref, projected into the plane
  const v = cross(w, u);
  const centre = mul(w, h);
  return Array.from({ length: n }, (_, k) => {
    const a = theta + (2 * Math.PI * k) / n;
    return add(centre, add(mul(u, r * Math.cos(a)), mul(v, r * Math.sin(a))));
  });
}

/**
 * Every distinct image of one polygon under a group — the whole model.
 *
 * The count is the test of whether the twist is one the model allows: a
 * pentagon whose mirror lines fall on the group's 2-fold axes is held by ten
 * rotations and has six images, and any other twist is held by five and has
 * twelve. Asking for six and getting twelve means the twist is wrong, which is
 * a far clearer failure than a picture that looks nearly right.
 */
export function orbit(group, ring) {
  const seen = new Map();
  for (const g of group) {
    const image = ring.map((p) => apply(g, p));
    // A ring is the same ring whatever corner it starts from and whichever way
    // round it runs, so compare sorted coordinates.
    const key = image.map((p) => p.map((x) => (Math.abs(x) < 1e-7 ? 0 : x).toFixed(5)).join(','))
                     .sort().join('|');
    if (!seen.has(key)) seen.set(key, image);
  }
  return [...seen.values()];
}

// ------------------------------------------------------- measuring a weave
/** Shortest distance between two line segments. */
export function segDist(p0, p1, q0, q1) {
  const u = sub(p1,p0), v = sub(q1,q0), w = sub(p0,q0);
  const a = dot(u,u), b = dot(u,v), c = dot(v,v), d = dot(u,w), e = dot(v,w);
  const D = a*c - b*b;
  let s = D < 1e-12 ? 0 : (b*e - c*d)/D;
  s = Math.max(0, Math.min(1, s));
  let t = Math.max(0, Math.min(1, (b*s + e)/(c > 1e-12 ? c : 1)));
  s = Math.max(0, Math.min(1, (b*t - d)/(a > 1e-12 ? a : 1)));
  return Math.hypot(w[0] + s*u[0] - t*v[0], w[1] + s*u[1] - t*v[1], w[2] + s*u[2] - t*v[2]);
}

const edges = (ring) => ring.map((p, i) => [p, ring[(i+1) % ring.length]]);

/** Closest approach between two different rings, edge to edge. */
export function clearance(rings) {
  let best = Infinity;
  for (let a = 0; a < rings.length; a++)
    for (let b = a+1; b < rings.length; b++)
      for (const [p0,p1] of edges(rings[a]))
        for (const [q0,q1] of edges(rings[b])) best = Math.min(best, segDist(p0,p1,q0,q1));
  return best;
}

/**
 * Gauss linking number of two closed polygons, straight off the curves — no
 * projection, so no degenerate directions to dodge.
 */
export function linking(A, B) {
  let sum = 0;
  for (let i = 0; i < A.length; i++) {
    const a0 = A[i], a1 = A[(i+1) % A.length];
    for (let j = 0; j < B.length; j++) {
      const b0 = B[j], b1 = B[(j+1) % B.length];
      // Solid angle of the tetrahedron on the two segments (Van Oosterom-Strackee).
      const r1 = sub(a0,b0), r2 = sub(a1,b0), r3 = sub(a1,b1), r4 = sub(a0,b1);
      const q = [[r1,r2,r3],[r1,r3,r4]];
      for (const [x,y,z] of q) {
        const num = dot(x, cross(y, z));
        const den = len(x)*len(y)*len(z)
          + dot(x,y)*len(z) + dot(y,z)*len(x) + dot(z,x)*len(y);
        sum += 2 * Math.atan2(num, den);
      }
    }
  }
  return sum / (4 * Math.PI);
}

/** How far the rings reach from the centre — the model's own scale. */
export const radius = (rings) => Math.max(...rings.flat().map(len));

// ------------------------------------------------------------- the weave
/**
 * Does each frame go over, under, over, under as you follow it round?
 *
 * "Woven" is a fact about the object, not about a picture of it, so this does
 * not use a projection direction: a diagram's alternation depends on where you
 * look from, and a generic direction adds crossings that have nothing to do
 * with the weave. These models are woven BALLS, so the canonical view is from
 * the centre outwards — project every frame radially onto a sphere, and the
 * weave is the crossing pattern of those spherical curves, with "over"
 * meaning the strand that is further from the centre.
 *
 * Two edges cross in that view exactly when each straddles the plane through
 * the origin containing the other, which is an exact test with no distance
 * threshold to tune. Earlier attempts counted "near touches" within a few
 * multiples of the clearance, and the answer moved with the threshold: 3
 * contacts per triangle at one setting, 27 at another.
 */
export function weave(rings) {
  const det = (a, b, c) => dot(a, cross(b, c));
  const out = [];
  for (let a = 0; a < rings.length; a++) {
    const A = rings[a], contacts = [];
    for (let b = 0; b < rings.length; b++) {
      if (b === a) continue;
      const B = rings[b];
      for (let i = 0; i < A.length; i++) {
        const p0 = A[i], p1 = A[(i + 1) % A.length];
        const nA = cross(p0, p1);                       // the plane of this edge and the origin
        for (let j = 0; j < B.length; j++) {
          const q0 = B[j], q1 = B[(j + 1) % B.length];
          const nB = cross(q0, q1);
          if (Math.sign(dot(nA, q0)) === Math.sign(dot(nA, q1))) continue;   // B stays on one side
          if (Math.sign(dot(nB, p0)) === Math.sign(dot(nB, p1))) continue;   // and A on the other
          // Where they cross, as seen from the centre, and how far out each is.
          const t = dot(nB, p0) / (dot(nB, p0) - dot(nB, p1));
          const u = dot(nA, q0) / (dot(nA, q0) - dot(nA, q1));
          const pa = add(p0, mul(sub(p1, p0), t)), pb = add(q0, mul(sub(q1, q0), u));
          // The two great circles meet at a pair of ANTIPODAL points, and with
          // frames centred on the origin every edge of a frame shares one
          // plane — so the straddle test alone pairs each real crossing with
          // its opposite and counts twelve where there are six. A crossing is
          // real only when the two points are the same direction from the
          // centre.
          if (dot(unit(pa), unit(pb)) < 0.999) continue;
          contacts.push({ at: i + t, with: b, outside: len(pa) > len(pb) });
        }
      }
    }
    contacts.sort((x, y) => x.at - y.at);
    const signs = contacts.map((c) => c.outside);
    out.push({
      frame: a,
      contacts: signs.length,
      alternates: signs.length > 0 && signs.length % 2 === 0
        && signs.every((v, i) => v !== signs[(i + 1) % signs.length]),
      pattern: signs.map((v) => (v ? 'O' : 'U')).join(''),
    });
  }
  return out;
}
