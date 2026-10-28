// Making the joints CLOSE.
//
// Two tubes meet cleanly at a corner only if their cut ends have the same
// outline — a mitre joint, like a picture frame. The ends share the plane that
// bisects the corner, and reflecting one arm in that plane lands it on the
// other, so the outlines match exactly when the next arm's cross-section is
// the previous one's REFLECTION in that plane.
//
// That rule chains round the ring and has to come back to where it started.
// Transporting the cross-section through all six corners leaves it rotated by
// an angle this file calls the TWIST, and the design only closes if the
// cross-section looks the same after turning it by that much. The shipped
// six-corner ring twists by 82.06 degrees, which no polygon survives — hence
// the ragged corners, where each arm's end sticks out past its neighbour's by
// up to 5 mm.
//
// The twist depends on the ring's shape, and the ring's shape has six free
// numbers (two corners; the other four and the other three rings follow from
// the tetrahedral symmetry). So: move the shape until the twist is exactly
// 360/k, use a cross-section with k-fold symmetry, and every joint closes.
//
//     node matched.mjs [k ...]
import { writeFileSync, readFileSync } from 'node:fs';
import { fromArc, edgeClearance, selfEdgeClearance } from '../polygon.mjs';
import { add, sub, mul, dot, cross, len, unit, deg, edgesOf, frameOf } from './skeleton.mjs';
import { constraintsFor, area, sides, cornerAngles } from './cross-section.mjs';
import { allLinking } from '../linking.mjs';
import { idOf, REFERENCE, sublinks } from '../lib.mjs';

const rad = (d) => d * Math.PI / 180;
const ARC0 = JSON.parse(readFileSync(new URL('../tweak-knotlib/fewest-crossings.json', import.meta.url), 'utf8'))['6'].arc;

const ringsOf = (arc) => fromArc(arc).map((c) => c.points);
const gapOf = (rings) => Math.min(edgeClearance(rings.map((points) => ({ points }))),
                                  selfEdgeClearance(rings.map((points) => ({ points }))));
const rmsOf = (rings) => Math.sqrt(rings[0].reduce((s, p) => s + dot(p, p), 0) / rings[0].length);

/** The 2x2 map taking cross-section coordinates on edge i to those on edge i+1. */
function stepOf(ring, i) {
  const n = ring.length, j = (i + 1) % n;
  const es = edgesOf(ring);
  const Fi = frameOf(es[i]), Fj = frameOf(es[j]);
  const nrm = unit(sub(Fi.t, Fj.t));                 // reflecting t_i gives t_j
  const refl = (x) => sub(x, mul(nrm, 2 * dot(x, nrm)));
  const u2 = refl(Fi.u), v2 = refl(Fi.v);
  return [[dot(u2, Fj.u), dot(v2, Fj.u)],
          [dot(u2, Fj.v), dot(v2, Fj.v)]];
}
const matmul = (X, Y) => [[X[0][0]*Y[0][0] + X[0][1]*Y[1][0], X[0][0]*Y[0][1] + X[0][1]*Y[1][1]],
                          [X[1][0]*Y[0][0] + X[1][1]*Y[1][0], X[1][0]*Y[0][1] + X[1][1]*Y[1][1]]];

/** What is left over after going once round: the twist, in degrees. */
export function twistOf(ring) {
  let H = [[1, 0], [0, 1]];
  for (let i = 0; i < ring.length; i++) H = matmul(stepOf(ring, i), H);
  return deg(Math.atan2(H[1][0], H[0][0]));
}

/**
 * The twist over TWO corners, which is the one that matters.
 *
 * The ring repeats every two edges — that is its three-fold symmetry — so for
 * all three long arms to be the same piece of paper, the cross-section must
 * come back to itself after two corners, not merely after six. Satisfy this
 * and the whole-ring twist follows, since it is three of these.
 */
export function pairTwistOf(ring) {
  const H = matmul(stepOf(ring, 1), stepOf(ring, 0));
  return deg(Math.atan2(H[1][0], H[0][0]));
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
 * The biggest cross-section that works for EVERY arm at once and has k-fold
 * symmetry.
 *
 * Every arm's section is a rigid image of this one, so a constraint on any arm
 * is a constraint on this one, pulled back through the transport. Each is a
 * half-plane, so the answer is an intersection of half-planes: convex, and the
 * largest there is.
 */
export function sharedSection(rings, k, { limit = 2 } = {}) {
  const ring = rings[0], n = ring.length;
  let poly = [[-limit,-limit], [limit,-limit], [limit,limit], [-limit,limit]];
  let M = [[1, 0], [0, 1]];                           // edge 0's frame -> edge i's
  for (let i = 0; i < n; i++) {
    // A constraint on edge i, written in edge 0's coordinates. M is a rigid
    // motion, so a half-plane stays a half-plane: its normal turns with M.
    const inv = [[M[0][0], M[1][0]], [M[0][1], M[1][1]]];   // orthogonal: inverse = transpose
    for (const c of constraintsFor(rings, i)) {
      const u = [Math.cos(rad(c.angle)), Math.sin(rad(c.angle))];
      const back = [inv[0][0]*u[0] + inv[0][1]*u[1], inv[1][0]*u[0] + inv[1][1]*u[1]];
      const ang = deg(Math.atan2(back[1], back[0]));
      for (let r = 0; r < k; r++) poly = clip(poly, ang + r * 360 / k, c.room);
      if (poly.length < 3) return null;
    }
    M = matmul(stepOf(ring, i), M);
  }
  return poly.filter((p, i) => {
    const q = poly[(i + 1) % poly.length];
    return Math.hypot(q[0]-p[0], q[1]-p[1]) > 1e-9;
  });
}

/**
 * Every constraint in the whole model, written in edge 0's coordinates.
 *
 * Every arm's section is a rigid image of edge 0's, so a constraint on any arm
 * is a constraint on this one, turned by the transport. A k-fold symmetric
 * shape satisfies the turned copies automatically, so they need not be added.
 */
export function allConstraints(rings) {
  const ring = rings[0], n = ring.length;
  let M = [[1, 0], [0, 1]];
  const out = [];
  for (let i = 0; i < n; i++) {
    const inv = [[M[0][0], M[1][0]], [M[0][1], M[1][1]]];      // orthogonal: inverse = transpose
    for (const c of constraintsFor(rings, i)) {
      const u = [Math.cos(rad(c.angle)), Math.sin(rad(c.angle))];
      const back = [inv[0][0]*u[0] + inv[0][1]*u[1], inv[1][0]*u[0] + inv[1][1]*u[1]];
      out.push({ angle: deg(Math.atan2(back[1], back[0])), room: c.room, edge: i });
    }
    M = matmul(stepOf(ring, i), M);
  }
  return out;
}

/** Support of a regular k-gon of circumradius 1, a vertex at angle `turn`. */
const kgonSupport = (theta, k, turn) => {
  let best = -1;
  for (let m = 0; m < k; m++) best = Math.max(best, Math.cos(rad(theta - turn) - 2 * Math.PI * m / k));
  return best;
};

/**
 * The biggest regular k-gon that fits every arm at once, and how it is turned.
 * k-fold symmetric, so it also survives the ring's twist of 360/k.
 */
export function bestKgon(rings, k, { steps = 720 } = {}) {
  const cons = allConstraints(rings);
  let best = { r: 0, turn: 0 };
  for (let s = 0; s < steps; s++) {
    const turn = s * 360 / k / steps;
    let r = Infinity;
    for (const c of cons) {
      const sup = kgonSupport(c.angle, k, turn);
      if (sup > 1e-9) r = Math.min(r, c.room / sup);
    }
    if (r > best.r) best = { r, turn };
  }
  return best;
}

/** How thick an arm this shape allows, relative to the ring's size. */
function scoreOf(arc, k) {
  const rings = ringsOf(arc);
  // Cheap guard on the link type. Every pair of rings has to stay UNLINKED —
  // without this the search walks off to the four-triangle link, where the
  // rings are pairwise linked and there is far more room, which is a different
  // object. The full Borromean check runs once at the end.
  const curves = rings.map((points) => ({ points }));
  if (!allLinking(curves).lk.every((x) => x.value === 0)) return { score: -1 };
  const kg = bestKgon(rings, k);
  if (!(kg.r > 0)) return { score: -1 };
  const rms = rmsOf(rings);
  return { score: kg.r / rms, kg, rms, gap: gapOf(rings),
           twist: twistOf(rings[0]), pair: pairTwistOf(rings[0]) };
}

// --- the search -------------------------------------------------------------
const target = (t, k) => {
  const step = 360 / k;
  return Math.round(t / step) * step;
};
function project(arc, want, rounds = 40) {
  // Newton on one equation in six unknowns: move along the gradient only.
  let a = arc.map((p) => p.slice());
  for (let r = 0; r < rounds; r++) {
    const t0 = pairTwistOf(ringsOf(a)[0]);
    let err = t0 - want;
    while (err > 180) err -= 360;
    while (err < -180) err += 360;
    if (Math.abs(err) < 1e-9) break;
    const g = [];
    const h = 1e-6;
    for (let i = 0; i < 2; i++) for (let c = 0; c < 3; c++) {
      const b = a.map((p) => p.slice()); b[i][c] += h;
      let d = pairTwistOf(ringsOf(b)[0]) - t0;
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      g.push(d / h);
    }
    const g2 = g.reduce((s, x) => s + x * x, 0);
    if (g2 < 1e-12) break;
    const stepCap = 0.25;                           // keep Newton from bolting
    const scale = Math.min(1, stepCap / Math.abs(err / Math.sqrt(g2)));
    let m = 0;
    for (let i = 0; i < 2; i++) for (let c = 0; c < 3; c++) a[i][c] -= scale * err * g[m++] / g2;
  }
  return a;
}

/**
 * Is this still OUR link? Pairwise unlinked is cheap and catches the
 * four-triangle link; it does NOT catch the rings simply coming apart, which
 * also has every linking number zero and far more room — so the three-ring
 * sublinks are identified against the Borromean rings as well. About 45 ms, so
 * it runs only on shapes that would otherwise be accepted.
 */
function linkOK(arc) {
  const curves = fromArc(arc);
  if (!allLinking(curves).lk.every((x) => x.value === 0)) return false;
  return sublinks(curves).every((s) => {
    const first = idOf(s.curves, 128);
    const got = first.ok ? first : idOf(s.curves, 512);
    return got.ok && got.print === REFERENCE.borromean;
  });
}

/**
 * Walk the shape from where it is to a twist of `want`, in small steps, so the
 * strands never have to jump past each other and the link stays what it is.
 */
function walkTo(arc, k, want, rnd) {
  let a = arc.map((p) => p.slice());
  const from = pairTwistOf(ringsOf(a)[0]);
  const N = 60;
  for (let s = 1; s <= N; s++) {
    const aim = from + (want - from) * s / N;
    let next = project(a, aim, 8);
    if (scoreOf(next, k).score < 0 || (s % 10 === 0 && !linkOK(next))) {
      let saved = null;
      for (let t = 0; t < 40 && !saved; t++) {
        const jig = project(a.map((p) => p.map((c) => c + 0.05 * rnd())), aim, 8);
        if (scoreOf(jig, k).score > 0 && linkOK(jig)) saved = jig;
      }
      if (!saved) return null;
      next = saved;
    }
    a = next;
  }
  return project(a, want, 40);
}

// Run only when called directly; the design modules import the pieces above.
if (process.argv[1] && process.argv[1].endsWith('matched.mjs')) main();

function main() {
const ks = (process.argv.slice(2).map(Number).filter(Boolean));
const KS = ks.length ? ks : [3, 4, 6];
const out = {};
for (const k of KS) {
  let rng = 20260101 + k;
  const rnd = () => (rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5;
  const step = 360 / k;
  let best = null;
  for (const want of [Math.floor(pairTwistOf(ringsOf(ARC0)[0]) / step) * step,
                      Math.ceil(pairTwistOf(ringsOf(ARC0)[0]) / step) * step]) {
    const start = walkTo(ARC0, k, want, rnd);
    if (!start || !linkOK(start)) {
      console.log(`  ${k}-fold: could not reach ${want} deg without changing the link`);
      continue;
    }
    let here = { arc: start, ...scoreOf(start, k) };
    if (here.score < 0) continue;
    for (let s = 0; s < 4000; s++) {
      const amt = 0.12 * Math.pow(0.999, s);
      const trial = project(here.arc.map((p) => p.map((c) => c + amt * rnd())), want, 12);
      const got = scoreOf(trial, k);
      if (got.score > here.score * 1.0005 &&
          Math.abs(((got.pair - want + 540) % 360) - 180) < 1e-6 &&
          linkOK(trial))
        here = { arc: trial, ...got };
    }
    if (!best || here.score > best.score) best = here;
  }
  if (!best) { console.log(`${k}-fold: no shape found`); continue; }
  out[k] = best;
  console.log(`${k}-fold section: two-corner twist ${best.pair.toFixed(6)} deg ` +
              `(wants a multiple of ${step.toFixed(0)}), whole ring ${best.twist.toFixed(4)} deg`);
  console.log(`  ${k}-gon circumradius ${best.kg.r.toFixed(5)} (${(best.score).toFixed(4)} of the ring's size), ` +
              `turned ${best.kg.turn.toFixed(1)} deg, centre-line gap ${best.gap.toFixed(4)}`);
}

const pick = Object.entries(out).sort((a, b) => b[1].score - a[1].score)[0];
console.log(`\nbest: ${pick[0]}-fold`);
writeFileSync(new URL('./matched.json', import.meta.url), JSON.stringify(
  Object.fromEntries(Object.entries(out).map(([k, v]) => [k, {
    arc: v.arc.map((p) => p.map((x) => +x.toFixed(6))), twist: +v.twist.toFixed(6),
    score: +v.score.toFixed(5), gap: +v.gap.toFixed(5), r: +v.kg.r.toFixed(6), turn: +v.kg.turn.toFixed(4),
    pair: +v.pair.toFixed(6),
  }])), null, 1) + '\n');
}
