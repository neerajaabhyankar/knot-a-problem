// Hill-climb the shape parameters for clearance, holding the link type fixed.
//
// This is a stand-in for `relax.js`, which the top-level plan lists as not yet
// built, and it is a much easier problem than the real one for one reason: the
// symmetry has already collapsed the search space. A general relaxation moves
// every point of every curve; here there are ten numbers, the tetrahedral
// symmetry is exact for all of them, and no descent step can ever break it.
//
// The objective is scale-free — clearance divided by the diameter of the whole
// configuration — because the tetrahedron is only scaffolding. Growing `r`
// would otherwise look like progress.
import { wavyConfig, clearance } from './tetra.mjs';
import { allLinking } from './linking.mjs';
import { idOf, REFERENCE, sublinks } from './lib.mjs';

const KEYS = ['r', 't', 'a3', 'th3', 'a6', 'th6', 'h3', 'p3', 'h6', 'p6'];

function diameter(curves) {
  const all = curves.flatMap((c) => c.points);
  let d = 0;
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      d = Math.max(d, Math.hypot(all[i][0] - all[j][0], all[i][1] - all[j][1], all[i][2] - all[j][2]));
    }
  }
  return d;
}

/** Scale-free clearance, or -1 if the link type is no longer what we want. */
export function score(p, { n = 72, samples = 24 } = {}) {
  const curves = wavyConfig({ ...p, n });
  const clear = clearance(curves);
  if (clear <= 0) return -1;
  const { lk, slop } = allLinking(curves);
  if (slop > 0.05 || lk.some((x) => x.value !== 0)) return -1;
  const got = idOf(sublinks(curves)[0].curves, samples);
  if (!got.ok || got.print !== REFERENCE.borromean) return -1;
  return clear / diameter(curves);
}

export function refine(start, { rounds = 400, step = 0.12, seed = 7 } = {}) {
  let state = seed >>> 0;
  const rnd = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  let best = { ...start };
  let bestScore = score(best);
  if (bestScore < 0) throw new Error('the starting point is not the link we want');
  let s = step;
  for (let i = 0; i < rounds; i++) {
    const trial = { ...best };
    for (const k of KEYS) trial[k] += (rnd() * 2 - 1) * s * (k === 'r' ? 1 : 0.6);
    const got = score(trial);
    if (got > bestScore) { best = trial; bestScore = got; }
    if (i % 40 === 39) s *= 0.72;
  }
  return { best, score: bestScore };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const start = {"r":1.7252400391269476,"t":-0.7581114121712744,"a3":-0.015062823146581694,"th3":0.0655955882128769,"a6":-0.023600463196635224,"th6":0.29825756922493596,"h3":0.674953953921795,"p3":0.6647877511772795,"h6":0.22725267661735415,"p6":0.5211006588940919};
  console.log('start score', score(start).toFixed(5));
  const out = refine(start, { rounds: Number(process.env.ROUNDS ?? 300) });
  console.log('final score', out.score.toFixed(5));
  console.log(JSON.stringify(out.best));
}
