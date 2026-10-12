// Straight edges and corners: the same link with flat-sided rings.
//
// WHY THIS IS NOT MERELY A DRAWING OPTION. Replacing a smooth ring by a polygon
// moves the strand. Move it far enough and it crosses another ring, and then it
// is a different link. So every candidate polygon is re-verified from scratch
// against `knotlib`, and the coarsest ones genuinely fail.
//
// THE SYMMETRY IS FREE. Ring A of the shipped curve repeats every 60 of its 180
// points under the 3-fold rotation R3. So a polygon is built by thinning the
// first 60 points down to m corners and then regenerating: arc, R3(arc),
// R3²(arc) gives ring A, and the three half-turns give rings B, C, D. Any
// subset of the arc therefore yields an exactly tetrahedrally symmetric link.
// Corner count is the only thing being searched.
import { readFileSync } from 'node:fs';
import { g } from './tetra.mjs';

const R3 = ([x, y, z]) => [z, x, y];

export const SHIPPED = JSON.parse(readFileSync(new URL('./curves.json', import.meta.url), 'utf8'));
/** One third of ring A — the only geometry a polygon is built from. */
export const ARC = SHIPPED[0].slice(0, SHIPPED[0].length / 3);

/** `m` corners taken from the arc, starting at `offset`. */
export const thinArc = (m, offset = 0) =>
  Array.from({ length: m }, (_, i) => ARC[(Math.round(i * ARC.length / m) + offset) % ARC.length]);

/** Ring A from an arc: the arc and its two rotated copies. */
export const ringA = (arc) => { const b = arc.map(R3); return [...arc, ...b, ...b.map(R3)]; };

/** All four rings. `3*m` corners each. */
export const fromArc = (arc) => [1, 2, 3, 4].map((i) => ({ points: ringA(arc).map(g[i]), closed: true }));
export const polygonConfig = (m, offset = 0) => fromArc(thinArc(m, offset));

// --- distances between straight EDGES, which vertex sampling gets wrong ------
const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];

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

const edges = (c) => c.points.map((p, i) => [p, c.points[(i+1) % c.points.length]]);

/** Closest approach between edges of two DIFFERENT rings. */
export function edgeClearance(curves) {
  let best = Infinity;
  for (let a = 0; a < curves.length; a++)
    for (let b = a+1; b < curves.length; b++)
      for (const [p0,p1] of edges(curves[a]))
        for (const [q0,q1] of edges(curves[b])) best = Math.min(best, segDist(p0,p1,q0,q1));
  return best;
}

/** Closest approach between non-adjacent edges of the SAME ring. */
export function selfEdgeClearance(curves) {
  let best = Infinity;
  for (const c of curves) {
    const E = edges(c), n = E.length;
    for (let i = 0; i < n; i++)
      for (let j = i+2; j < n; j++) {
        if (i === 0 && j === n-1) continue;
        best = Math.min(best, segDist(E[i][0], E[i][1], E[j][0], E[j][1]));
      }
  }
  return best;
}

/** What a paper model would have to be cut to. */
export function edgeStats(curves) {
  const L = edges(curves[0]).map(([p,q]) => Math.hypot(...sub(p,q)));
  const n = curves[0].points.length;
  const ang = curves[0].points.map((b, i) => {
    const a = curves[0].points[(i-1+n)%n], c = curves[0].points[(i+1)%n];
    const u = sub(b,a), v = sub(c,b);
    return Math.acos(Math.max(-1, Math.min(1, dot(u,v)/(Math.hypot(...u)*Math.hypot(...v))))) * 180/Math.PI;
  });
  return { min: Math.min(...L), max: Math.max(...L), turnMax: Math.max(...ang) };
}
