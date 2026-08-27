// Equivariant relaxation: tidy the curves without ever leaving the symmetry.
//
// This is a small, special-cased stand-in for the `relax.js` the top-level plan
// has not built yet, and the symmetry makes it a far easier problem than the
// general one. The state is a single arc of N/3 points — a fundamental domain
// for the 3-fold rotation about the component's own axis. Everything else is
// generated: the rest of the component by R, the other three components by the
// coset representatives. So there is no symmetry term in the energy and no
// symmetry drift to correct. It is exact at every step, for free.
//
// The force on a stored point is the sum of the forces on its three copies,
// each pulled back by the rotation that made it. That is the ordinary gradient
// of the full energy restricted to the symmetric subspace.
import { V, g, clearance, checkSymmetry } from './tetra.mjs';
import { allLinking } from './linking.mjs';
import { idOf, REFERENCE, sublinks } from './lib.mjs';

const R = ([x, y, z]) => [z, x, y];       // +120 about (1,1,1)
const RINV = ([x, y, z]) => [y, z, x];    // its inverse
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

/** Arc of M points -> the whole component, then the whole configuration. */
export function expand(arc) {
  const full = [...arc, ...arc.map(R), ...arc.map((p) => R(R(p)))];
  return [1, 2, 3, 4].map((i) => ({ points: full.map(g[i]), closed: true }));
}
export const component1 = (arc) => [...arc, ...arc.map(R), ...arc.map((p) => R(R(p)))];

/** Resample a closed polyline to `m` points evenly spaced by arclength. */
function resample(pts, m) {
  const n = pts.length;
  const seg = Array.from({ length: n }, (_, i) => len(sub(pts[(i + 1) % n], pts[i])));
  const total = seg.reduce((a, b) => a + b, 0);
  const out = [];
  let i = 0, walked = 0;
  for (let k = 0; k < m; k++) {
    const want = (k * total) / m;
    while (walked + seg[i] < want) { walked += seg[i]; i = (i + 1) % n; }
    const s = (want - walked) / seg[i];
    out.push(add(pts[i], mul(sub(pts[(i + 1) % n], pts[i]), s)));
  }
  return out;
}

/**
 * One descent step. `smoothing` pulls each point toward the midpoint of its
 * neighbours (this shortens, since a polygon's chord is shorter than its two
 * edges); `repulsion` pushes strands apart with an inverse-square-law force,
 * skipping near neighbours along the same strand, which are not obstacles.
 */
function forces(curves, near) {
  const p1 = curves[0].points;
  const n = p1.length;
  const F = p1.map(() => [0, 0, 0]);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 4; c++) {
      const q = curves[c].points;
      for (let j = 0; j < q.length; j++) {
        if (c === 0) {
          const gapAlong = Math.min(Math.abs(i - j), n - Math.abs(i - j));
          if (gapAlong <= near) continue;
        }
        const d = sub(p1[i], q[j]);
        const r = len(d);
        if (r < 1e-9 || r > 3) continue;
        F[i] = add(F[i], mul(d, 1 / (r * r * r * r)));
      }
    }
  }
  return F;
}

/** Ropelength proxy: total length over closest approach. Scale-free. */
export function ropelength(curves) {
  const p = curves[0].points;
  let L = 0;
  for (let i = 0; i < p.length; i++) L += len(sub(p[(i + 1) % p.length], p[i]));
  return L / clearance(curves);
}

/**
 * Descend on length/clearance with an adaptive step.
 *
 * Holding clearance fixed and shortening, which is what the first version did,
 * refuses every step: shortening a strand and keeping every other strand the
 * same distance away are in direct competition. The scale-free ratio is the
 * quantity that can actually go down, and it is the one that decides whether
 * the picture is readable — a link is legible when it is short for its
 * thickness, which is what ropelength means.
 */
export function relax(arc0, { steps = 600, m = null, near = 4, repel = 0.02, smooth = 0.4, lr0 = 0.6, verbose = true } = {}) {
  let arc = arc0.map((p) => [...p]);
  const M = m ?? arc.length;
  if (M !== arc.length) arc = resample(component1(arc), M * 3).slice(0, M);
  let score = ropelength(expand(arc));
  let lr = lr0;

  for (let s = 0; s < steps; s++) {
    const curves = expand(arc);
    const p1 = curves[0].points;
    const n = p1.length;
    const F = forces(curves, near);

    const dir = arc.map((p, i) => {
      let f = [0, 0, 0];
      for (let j = 0; j < 3; j++) {
        const idx = i + j * M;
        const mid = mul(add(p1[(idx + 1) % n], p1[(idx + n - 1) % n]), 0.5);
        const both = add(mul(sub(mid, p1[idx]), smooth), mul(F[idx], repel));
        f = add(f, j === 0 ? both : j === 1 ? RINV(both) : R(both));
      }
      return mul(f, 1 / 3);
    });

    let moved = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      const trial = resample(component1(arc.map((p, i) => add(p, mul(dir[i], lr)))), M * 3).slice(0, M);
      const got = ropelength(expand(trial));
      if (got < score) { arc = trial; score = got; lr = Math.min(lr * 1.1, 2); moved = true; break; }
      lr *= 0.5;
    }
    if (!moved && lr < 1e-6) break;
    if (verbose && s % 150 === 149) {
      const c = expand(arc);
      console.log(`    step ${String(s + 1).padStart(4)}  ropelength ${score.toFixed(2)}  clearance ${clearance(c).toFixed(4)}`);
    }
  }
  const curves = expand(arc);
  checkSymmetry(curves);
  return { arc, curves, ropelength: score };
}

/** Fold a per-point force on the whole component back onto the stored arc. */
function fold(F, M, n) {
  return Array.from({ length: M }, (_, i) => {
    let f = [0, 0, 0];
    for (let j = 0; j < 3; j++) {
      const v = F[(i + j * M) % n];
      f = add(f, j === 0 ? v : j === 1 ? RINV(v) : R(v));
    }
    return mul(f, 1 / 3);
  });
}

/** Push every strand that is closer than `t` back out to `t`. */
function shove(arc, M, t, rounds = 30, gain = 0.6) {
  let a = arc;
  for (let k = 0; k < rounds; k++) {
    const curves = expand(a);
    const p1 = curves[0].points;
    const n = p1.length;
    let worst = Infinity;
    const F = p1.map(() => [0, 0, 0]);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 4; c++) {
        const q = curves[c].points;
        for (let j = 0; j < q.length; j++) {
          if (c === 0) {
            const along = Math.min(Math.abs(i - j), n - Math.abs(i - j));
            if (along <= 4) continue;
          }
          const d = sub(p1[i], q[j]);
          const r = len(d);
          if (c !== 0) worst = Math.min(worst, r);
          if (r < t && r > 1e-9) F[i] = add(F[i], mul(d, (gain * (t - r)) / r));
        }
      }
    }
    if (worst >= t) break;
    const step = fold(F, M, n);
    a = a.map((p, i) => add(p, step[i]));
  }
  return a;
}

/**
 * Shorten, then shove back apart. The alternation is the point: smoothing alone
 * collapses the link onto itself, and repulsion alone inflates it forever.
 * Descent is on ropelength, so a step that shortens more than it thins is kept.
 */
export function tighten(arc0, { steps = 300, lam = 0.25, verbose = true } = {}) {
  let stalled = 0;
  let arc = arc0.map((p) => [...p]);
  const M = arc.length;
  let curves = expand(arc);
  const t = clearance(curves);
  let score = ropelength(curves);
  const started = score;
  let best = arc.map((p) => [...p]);
  let bestScore = score;

  for (let s = 0; s < steps; s++) {
    const p1 = expand(arc)[0].points;
    const n = p1.length;
    const smoothF = p1.map((p, idx) =>
      mul(sub(mul(add(p1[(idx + 1) % n], p1[(idx + n - 1) % n]), 0.5), p), lam));
    const step = fold(smoothF, M, n);
    let trial = arc.map((p, i) => add(p, step[i]));
    trial = shove(trial, M, t);
    trial = resample(component1(trial), M * 3).slice(0, M);
    const got = ropelength(expand(trial));
    // Patience, not a hair trigger. Resampling perturbs the measurement by a
    // few parts in a thousand, so a single non-improving step means nothing;
    // stalling for a while at a decayed step size means the descent is done.
    if (got < score) { arc = trial; score = got; stalled = 0; }
    else if (++stalled > 25) break;
    else { arc = trial; lam *= 0.9; }
    if (score < bestScore) { bestScore = score; best = arc.map((p) => [...p]); }
    if (verbose && s % 50 === 49) console.log(`    step ${String(s + 1).padStart(4)}  ropelength ${score.toFixed(2)}  clearance ${clearance(expand(arc)).toFixed(4)}`);
  }
  curves = expand(best);
  checkSymmetry(curves);
  if (verbose) console.log(`    ropelength ${started.toFixed(2)} -> ${bestScore.toFixed(2)}`);
  return { arc: best, curves, ropelength: bestScore };
}

/** Did the relaxation preserve what we care about? */
export function stillRight(curves, samples = 96) {
  const { lk } = allLinking(curves);
  if (lk.some((x) => x.value !== 0)) return { ok: false, why: 'a pair became linked' };
  const subs = sublinks(curves).map((s) => idOf(s.curves, samples));
  const all = subs.every((s) => s.ok && s.print === REFERENCE.borromean);
  return { ok: all, why: all ? 'all four sublinks still Borromean' : `sublinks: ${subs.map((s) => (s.ok ? (s.print === REFERENCE.borromean ? 'B' : '?') : 'x')).join('')}`, subs };
}
