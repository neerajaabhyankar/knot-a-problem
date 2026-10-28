// What shape should a strut be, and how big?
//
// THE ANSWER IS NOT A GUESS. A strut may be any convex shape that fits in the
// room its neighbours leave it, and room is measured by the SUPPORT FUNCTION:
// how far the cross-section reaches in a given direction. Two struts whose
// axes pass at distance d, with the shortest line between them along u, touch
// when support_A(u) + support_B(-u) = d and overlap when the sum exceeds it.
//
// So every other strut in the model contributes one half-plane constraint,
// and the LARGEST cross-section is the intersection of all of them. Nothing
// convex is bigger; anything bigger collides. The shape is therefore derived,
// not chosen — and it is not the isosceles triangle of the published
// Gasherbrum and Makalu units.
//
// EVERY strut counts, not just the three nearest. Constraining only the close
// ones gives a triangle whose sharpest corner (22 degrees) reaches 0.31 from
// its own axis — a third of the ring's radius — straight through strands that
// the three-contact model never looked at.
import { skeleton, edgesOf, frameOf, add, sub, mul, dot, len, unit, deg } from './skeleton.mjs';

const rad = (d) => d * Math.PI / 180;

/** Closest approach between two segments: the points, and the distance. */
export function approach(p0, p1, q0, q1) {
  const u = sub(p1,p0), v = sub(q1,q0), w = sub(p0,q0);
  const a = dot(u,u), b = dot(u,v), c = dot(v,v), d = dot(u,w), e = dot(v,w);
  const D = a*c - b*b;
  let s = D < 1e-12 ? 0 : (b*e - c*d)/D;
  s = Math.max(0, Math.min(1, s));
  let t = Math.max(0, Math.min(1, (b*s + e)/(c > 1e-12 ? c : 1)));
  s = Math.max(0, Math.min(1, (b*t - d)/(a > 1e-12 ? a : 1)));
  const pa = add(p0, mul(u, s)), pb = add(q0, mul(v, t));
  return { pa, pb, d: len(sub(pa, pb)) };
}

/**
 * One half-plane per other strut, in the frame of edge `which` of ring 0.
 *
 * The split of the room between the two struts is even — `d / 2` each. That is
 * exactly right for the tightest contacts, which are between two struts of the
 * same kind, and the rest of the contacts here differ by under 2%, so there is
 * nothing to win by splitting them unevenly.
 */
export function constraintsFor(rings, which) {
  const A = rings[0];
  const edge = edgesOf(A)[which];
  const f = frameOf(edge);
  const out = [];
  rings.forEach((B, bi) => {
    edgesOf(B).forEach((other) => {
      if (bi === 0) {
        const n = A.length, di = Math.min(Math.abs(which - other.i), n - Math.abs(which - other.i));
        if (di <= 1) return;                 // itself, and the two it shares a corner with
      }
      const got = approach(edge.a, edge.b, other.a, other.b);
      const w = sub(got.pb, got.pa);
      if (len(w) < 1e-12) return;
      const u = unit(w);
      out.push({
        angle: deg(Math.atan2(dot(u, f.v), dot(u, f.u))),
        room: got.d / 2,
        ring: bi, edge: other.i, d: got.d,
      });
    });
  });
  return out.sort((x, y) => x.d - y.d);
}

/** Clip a convex polygon by the half-plane x . u <= s. */
function clip(poly, angle, s) {
  const u = [Math.cos(rad(angle)), Math.sin(rad(angle))];
  const inside = (p) => p[0]*u[0] + p[1]*u[1] <= s + 1e-12;
  const cut = (p, q) => {
    const dp = p[0]*u[0] + p[1]*u[1] - s, dq = q[0]*u[0] + q[1]*u[1] - s;
    const t = dp / (dp - dq);
    return [p[0] + (q[0]-p[0])*t, p[1] + (q[1]-p[1])*t];
  };
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const ip = inside(p), iq = inside(q);
    if (ip) out.push(p);
    if (ip !== iq) out.push(cut(p, q));
  }
  return out;
}

/**
 * The largest cross-section allowed by every constraint, optionally capped.
 *
 * WHY CAP IT. The unconstrained optimum for the long strut reaches 10 mm from
 * its own axis on one side, because the nearest strand in that direction is
 * 0.33 away — three times the usual clearance. That fin touches nothing: it
 * costs paper and wobbles. Capping the shape at a given distance from the axis
 * removes it WITHOUT loosening the fit, because the faces that actually meet
 * neighbours are all about 3.6 mm out and are not touched by the cap.
 */
export function sectionFor(rings, which, { limit = 2, cap = null, capRounds = 1 } = {}) {
  let poly = [[-limit,-limit], [limit,-limit], [limit,limit], [-limit,limit]];
  for (const c of constraintsFor(rings, which)) {
    poly = clip(poly, c.angle, c.room);
    if (poly.length < 3) return null;
  }
  // Clip only where the shape actually overshoots, one face at a time, so the
  // cap costs a face or two rather than the 72 a circular sweep would add —
  // and the pairwise solid test stays quick enough to run on every pair.
  if (cap) for (let guard = 0; guard < capRounds; guard++) {
    let worst = null;
    poly.forEach((q) => {
      const r = Math.hypot(q[0], q[1]);
      if (r > cap + 1e-9 && (!worst || r > worst.r)) worst = { r, angle: deg(Math.atan2(q[1], q[0])) };
    });
    if (!worst) break;
    poly = clip(poly, worst.angle, cap);
  }
  // Drop corners that repeat (two constraints meeting at the same point).
  const tidy = poly.filter((p, i) => {
    const q = poly[(i + 1) % poly.length];
    return Math.hypot(q[0]-p[0], q[1]-p[1]) > 1e-9;
  });
  return tidy;
}

export const support = (poly, angle) => {
  const d = [Math.cos(rad(angle)), Math.sin(rad(angle))];
  return Math.max(...poly.map((p) => p[0]*d[0] + p[1]*d[1]));
};
export const area = (poly) => Math.abs(poly.reduce((s, p, i) => {
  const q = poly[(i + 1) % poly.length];
  return s + p[0]*q[1] - q[0]*p[1];
}, 0)) / 2;
export const sides = (poly) => poly.map((p, i) => {
  const q = poly[(i + 1) % poly.length];
  return Math.hypot(q[0]-p[0], q[1]-p[1]);
});
export function cornerAngles(poly) {
  const n = poly.length;
  return poly.map((p, i) => {
    const a = poly[(i-1+n)%n], b = poly[(i+1)%n];
    const u1 = [a[0]-p[0], a[1]-p[1]], u2 = [b[0]-p[0], b[1]-p[1]];
    const c = (u1[0]*u2[0] + u1[1]*u2[1]) / (Math.hypot(...u1) * Math.hypot(...u2));
    return deg(Math.acos(Math.max(-1, Math.min(1, c))));
  });
}
/** Which constraint each face came from — so a face can be named by its neighbour. */
export function facesOf(rings, which, poly) {
  const cons = constraintsFor(rings, which);
  return poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const mid = [(p[0]+q[0])/2, (p[1]+q[1])/2];
    let best = null;
    for (const c of cons) {
      const u = [Math.cos(rad(c.angle)), Math.sin(rad(c.angle))];
      const slack = c.room - (mid[0]*u[0] + mid[1]*u[1]);
      if (best === null || Math.abs(slack) < Math.abs(best.slack)) best = { ...c, slack };
    }
    return { face: i, length: Math.hypot(q[0]-p[0], q[1]-p[1]), normal: best.angle,
             offset: best.room, touches: `ring ${best.ring} edge ${best.edge}`, d: best.d };
  });
}
