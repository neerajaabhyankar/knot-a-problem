// Push the corners apart without ever changing the link.
//
// THE GUARANTEE. Let `gap` be the current closest approach between any two
// strands (different rings, or non-adjacent edges of one ring). If every corner
// moves by at most gap/2, then no point of any edge moves further than that, so
// two strands that were `gap` apart stay more than 0 apart: nothing can pass
// through anything, and the link type is preserved by construction rather than
// by re-checking and hoping. It is re-checked anyway, at the end.
//
// The symmetry is likewise never at risk. Only the m corners of ONE THIRD of
// ONE ring are variables; the other eleven twelfths are generated from them.
import { writeFileSync } from 'node:fs';
import { fromArc, thinArc, edgeClearance, selfEdgeClearance, edgeStats, polygonConfig } from './polygon.mjs';
import { checkSymmetry } from './tetra.mjs';
import { idOf, REFERENCE, sublinks } from './lib.mjs';
import { allLinking } from './linking.mjs';

/** gap, normalised by model size so the optimiser cannot just inflate everything. */
function score(arc) {
  const curves = fromArc(arc);
  const gap = Math.min(edgeClearance(curves), selfEdgeClearance(curves));
  const rms = Math.sqrt(curves[0].points.reduce((s,p) => s + p[0]**2 + p[1]**2 + p[2]**2, 0) / curves[0].points.length);
  const es = edgeStats(curves);
  // a spike is a degenerate corner: the strand doubles back and no projection
  // of it is generic. Refuse rather than let the optimiser discover them.
  const ok = es.turnMax < 125 && es.min > 0.12 * rms;
  return { gap, rms, ratio: gap / rms, ok, es };
}

export function optimise(arc0, { steps = 20000, seed = 7 } = {}) {
  let st = seed >>> 0;
  const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  let arc = arc0.map((p) => [...p]);
  let cur = score(arc);
  let accepted = 0;
  for (let i = 0; i < steps; i++) {
    const bound = cur.gap * 0.5 * (1 - 0.85 * i / steps);
    if (!(bound > 1e-9)) break;
    const j = Math.floor(rnd() * arc.length);
    const trial = arc.map((p) => [...p]);
    trial[j] = trial[j].map((x) => x + (rnd() * 2 - 1) * bound);
    const got = score(trial);
    if (got.ok && got.ratio > cur.ratio) { arc = trial; cur = got; accepted++; }
  }
  return { arc, ...cur, accepted };
}

const verdict = (curves) => {
  checkSymmetry(curves);
  const got = sublinks(curves).map((s) => idOf(s.curves, 128));
  return {
    ns: got.map((x) => (x.ok ? x.n : '-')).join('/'),
    ok: got.every((x) => x.ok && x.print === REFERENCE.borromean)
        && allLinking(curves).lk.every((x) => x.value === 0),
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const STARTS = [[2,17],[3,1],[4,3],[5,1],[6,2],[7,4],[8,6]];
  const OUT = {};
  console.log('corners   gap before -> after    x     edges min/max   turn  sublinks     verdict');
  for (const [m, offset] of STARTS) {
    const before = polygonConfig(m, offset);
    const g0 = Math.min(edgeClearance(before), selfEdgeClearance(before));
    const res = optimise(thinArc(m, offset));
    const after = fromArc(res.arc);
    const v = verdict(after);
    console.log(`${String(3*m).padStart(7)}   ${g0.toFixed(4)} -> ${res.gap.toFixed(4)}` +
      `   ${(res.gap/g0).toFixed(1).padStart(4)}x   ${res.es.min.toFixed(2)}/${res.es.max.toFixed(2)}`.padEnd(30) +
      `${res.es.turnMax.toFixed(0).padStart(5)}  ${v.ns.padEnd(12)} ${v.ok ? 'ALL FOUR BORROMEAN' : 'BROKEN'}`);
    if (v.ok) OUT[3*m] = { gap: Number(res.gap.toFixed(4)), rings: after.map((c) => c.points.map((p) => p.map((x) => Math.round(x*1e4)/1e4))) };
  }
  writeFileSync('polygons.json', JSON.stringify(OUT));
  console.log('\nwrote polygons.json:', Object.keys(OUT).map(k=>k+' corners').join(', '));
}
