// Search the T-symmetric shape family for one whose 3-sublinks are Borromean.
//
// Deterministic: a seeded LCG, not Math.random, so a hit found today is found
// again tomorrow and can be quoted by index. The filters are ordered by cost.
import { wavyConfig, clearance, checkSymmetry } from './tetra.mjs';
import { allLinking } from './linking.mjs';
import { idOf, REFERENCE, sublinks } from './lib.mjs';
import { project } from '../knotlib/index.js';

let state = Number(process.env.SEED ?? 12345) >>> 0;
const rnd = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const between = (lo, hi) => lo + (hi - lo) * rnd();

const TAU3 = (2 * Math.PI) / 3;
const draw = () => ({
  r: between(0.5, 2.4),
  t: between(-0.9, 0.3),
  a3: between(-0.6, 0.6), th3: between(0, TAU3),
  a6: between(-0.4, 0.4), th6: between(0, TAU3 / 2),
  h3: between(-0.8, 0.8), p3: between(0, TAU3),
  h6: between(-0.5, 0.5), p6: between(0, TAU3 / 2),
  n: 48,
});

/** Crossings in a handful of fixed directions — a cheap "is it even engaged?" */
function busy(curves) {
  let best = 0;
  for (const d of [[0, 0, 1], [1, 1, 1], [1, -0.3, 0.2], [0.2, 1, -0.4]]) {
    try { best = Math.max(best, project(curves, d).diagram.n); }
    catch { /* unusable direction; see lib.mjs bestProjection */ }
  }
  return best;
}

const TRIALS = Number(process.env.TRIALS ?? 3000);
const stats = { drawn: 0, tooClose: 0, linked: 0, quiet: 0, examined: 0, hits: 0, byKind: new Map() };
const started = Date.now();
const hits = [];

for (let k = 0; k < TRIALS; k++) {
  const p = draw();
  stats.drawn++;
  const curves = wavyConfig(p);
  if (clearance(curves) < 0.06) { stats.tooClose++; continue; }
  const { lk, slop } = allLinking(curves);
  if (slop > 0.05 || lk.some((x) => x.value !== 0)) { stats.linked++; continue; }
  const sub = sublinks(curves)[0].curves;
  if (busy(sub) < 6) { stats.quiet++; continue; }
  stats.examined++;
  const got = idOf(sub, 32);
  const kind = !got.ok ? 'fail' : got.print === REFERENCE.borromean ? 'BORROMEAN'
    : got.print === REFERENCE.unlink3 ? 'unlink' : got.print;
  stats.byKind.set(kind, (stats.byKind.get(kind) ?? 0) + 1);
  if (kind === 'BORROMEAN') { stats.hits++; hits.push({ k, p }); console.log('HIT', k, JSON.stringify(p)); }
}

console.log(`\n${TRIALS} trials in ${((Date.now() - started) / 1000).toFixed(1)}s   seed=${process.env.SEED ?? 12345}`);
console.log(`  rejected: ${stats.tooClose} too close, ${stats.linked} a pair linked, ${stats.quiet} under 6 crossings`);
console.log(`  examined: ${stats.examined}   Borromean hits: ${stats.hits}`);
for (const [kind, count] of [...stats.byKind].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`    ${String(count).padStart(5)}  ${kind}`);
}
