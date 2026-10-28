// The centre-line the model is built around, and where its struts touch.
//
// The link is the 6-corner tetrahedral 4-Borromean polygon: four congruent
// rings, each a closed hexagon with 3-fold symmetry, so only TWO corners and
// TWO edges are distinct — the rest are copies. That is what makes a paper
// model feasible: two unit patterns, folded twelve times each.
//
// Everything here is measured off the shipped arc rather than assumed, and
// every quantity a later stage uses (edge lengths, turn, torsion, contacts)
// comes from this one place.
import { readFileSync } from 'node:fs';
import { fromArc, segDist, edgeClearance, selfEdgeClearance } from '../polygon.mjs';
import { checkSymmetry } from '../tetra.mjs';

export const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
export const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
export const mul = (a, s) => [a[0]*s, a[1]*s, a[2]*s];
export const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
export const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a) => mul(a, 1 / len(a));
export const deg = (r) => r * 180 / Math.PI;

/**
 * The 6-corner arc, from the tweaker's searches.
 *
 * There is no separate "roomy" shape at six corners: the clearance search got
 * to 0.1138 and the crossings search, which breaks ties on clearance, got to
 * 0.121 — so the roomiest six-corner shape anyone found is the one the tweaker
 * labels `clear`, and that is what a paper model wants.
 */
export function arc6() {
  const url = new URL('../tweak-knotlib/fewest-crossings.json', import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8'))['6'].arc;
}

/** The four rings, as arrays of 6 corners. */
export function skeleton(arc = arc6()) {
  const curves = fromArc(arc);
  checkSymmetry(curves);                      // throws unless |T| = 12 holds exactly
  return curves.map((c) => c.points);
}

export const edgesOf = (ring) => ring.map((p, i) => ({ i, a: p, b: ring[(i + 1) % ring.length] }));

/**
 * Edge length, turn angle and torsion at each corner — the three numbers that
 * fix a space polygon up to rigid motion, and so the three a unit has to
 * reproduce. `turn[i]` is the bend AT corner i, between edge i-1 and edge i.
 */
export function recipe(ring) {
  const n = ring.length;
  return ring.map((_, i) => {
    const p0 = ring[(i-1+n)%n], p1 = ring[i], p2 = ring[(i+1)%n], p3 = ring[(i+2)%n];
    const e0 = sub(p1,p0), e1 = sub(p2,p1), e2 = sub(p3,p2);
    const n1 = cross(e0,e1), n2 = cross(e1,e2);
    return {
      corner: i,
      edge: len(e1),
      turn: deg(Math.acos(Math.max(-1, Math.min(1, dot(e0,e1)/(len(e0)*len(e1)))))),
      torsion: deg(Math.atan2(dot(cross(n1,n2), e1) / len(e1), dot(n1,n2))),
    };
  });
}

/**
 * A frame for each edge: along the edge, out from the model's centre, and the
 * third to match. The cross-section is designed in this frame, so "which way
 * does a face point" has a meaning that survives the symmetry.
 */
export function frameOf(edge) {
  const t = unit(sub(edge.b, edge.a));
  const mid = mul(add(edge.a, edge.b), 0.5);
  const radial = sub(mid, mul(t, dot(mid, t)));            // outward, across the edge
  const u = len(radial) > 1e-9 ? unit(radial) : unit(cross(t, [1, 0, 0]));
  return { t, u, v: cross(t, u), mid };
}

/** Closest approach between two segments, with where and in which direction. */
function approach(p0, p1, q0, q1) {
  const u = sub(p1,p0), v = sub(q1,q0), w = sub(p0,q0);
  const a = dot(u,u), b = dot(u,v), c = dot(v,v), d = dot(u,w), e = dot(v,w);
  const D = a*c - b*b;
  let s = D < 1e-12 ? 0 : (b*e - c*d)/D;
  s = Math.max(0, Math.min(1, s));
  let t = Math.max(0, Math.min(1, (b*s + e)/(c > 1e-12 ? c : 1)));
  s = Math.max(0, Math.min(1, (b*t - d)/(a > 1e-12 ? a : 1)));
  const pa = add(p0, mul(u, s)), pb = add(q0, mul(v, t));
  return { s, t, pa, pb, d: len(sub(pa, pb)) };
}

/**
 * Who passes close to each edge of ring `which`, and from what direction.
 *
 * `angle` is where the neighbour sits around the strut, measured in the edge's
 * own frame from the outward radial direction. That angle is what decides
 * which way a face of the cross-section has to point, and `d` is how much
 * room there is to fill: the two struts' half-thicknesses in that direction
 * have to add up to it for the model to be snug rather than loose or jammed.
 */
export function contacts(rings, which = 0, { reach = 2.6 } = {}) {
  const gap = Math.min(edgeClearance(rings.map((points) => ({ points }))),
                       selfEdgeClearance(rings.map((points) => ({ points }))));
  const A = rings[which];
  return edgesOf(A).map((edge) => {
    const f = frameOf(edge);
    const found = [];
    rings.forEach((B, bi) => {
      edgesOf(B).forEach((other) => {
        if (bi === which) {
          const n = A.length, di = Math.min(Math.abs(edge.i - other.i), n - Math.abs(edge.i - other.i));
          if (di <= 1) return;                              // itself, or a neighbour at a corner
        }
        const got = approach(edge.a, edge.b, other.a, other.b);
        if (got.d > reach * gap) return;
        const w = sub(got.pb, got.pa);                      // towards the neighbour
        found.push({
          ring: bi, edge: other.i, at: got.s, d: got.d,
          angle: deg(Math.atan2(dot(w, f.v), dot(w, f.u))), // around the strut, 0 = outward
          along: deg(Math.acos(Math.min(1, Math.abs(dot(unit(sub(other.b, other.a)), f.t))))),
        });
      });
    });
    found.sort((x, y) => x.d - y.d);
    return { edge: edge.i, length: len(sub(edge.b, edge.a)), frame: f, contacts: found };
  });
}

export const clearanceOf = (rings) => Math.min(
  edgeClearance(rings.map((points) => ({ points }))),
  selfEdgeClearance(rings.map((points) => ({ points }))),
);
