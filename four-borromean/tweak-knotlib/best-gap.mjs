// How far apart CAN the strands be, at each corner count?
//
// `make-starts.mjs` stops early on purpose: it widens in chunks and keeps the
// last shape that still verifies, taking the first decent answer rather than
// the best one. Four of the seven counts there never widened at all. This asks
// the harder question — hill-climb from every offset that verifies, with
// several seeds, and keep the best shape that knotlib still confirms.
//
// WHAT THIS CAN AND CANNOT CLAIM. Hill-climbing from a handful of starts finds
// a good shape, never a proven maximum; `best` below means best found. And the
// comparable number is the SCALE-FREE one: `gap` can be made as large as you
// like by inflating the whole link, so the optimiser maximises gap/rms and the
// table reports both.
import { writeFileSync } from 'node:fs';
import { optimise } from '../optimise-polygon.mjs';
import { thinArc, fromArc, edgeClearance, selfEdgeClearance, edgeStats } from '../polygon.mjs';
import { checkSymmetry } from '../tetra.mjs';
import { idOf, REFERENCE, sublinks } from '../lib.mjs';
import { allLinking } from '../linking.mjs';

const r4 = (x) => Math.round(x * 1e4) / 1e4;
const gapOf = (c) => Math.min(edgeClearance(c), selfEdgeClearance(c));
const rmsOf = (c) => Math.sqrt(c[0].points.reduce((s,p) => s + p[0]**2 + p[1]**2 + p[2]**2, 0) / c[0].points.length);

function verify(arc, samples = 128) {
  const curves = fromArc(arc);
  checkSymmetry(curves);
  const got = sublinks(curves).map((s) => {
    const first = idOf(s.curves, samples);
    return first.ok ? first : idOf(s.curves, samples * 4);  // unlucky directions, not a verdict
  });
  const wrong = got.some((x) => x.ok && x.print !== REFERENCE.borromean)
             || !allLinking(curves).lk.every((x) => x.value === 0);
  return {
    curves, gap: gapOf(curves), rms: rmsOf(curves),
    ns: got.map((x) => (x.ok ? x.n : '?')).join('/'),
    ok: !wrong && got.every((x) => x.ok),     // every sublink read AND Borromean
  };
}

const OUT = {};
console.log('corners   best gap   gap/rms   offset  seed   edges min/max  turn   sublinks');
for (let m = 2; m <= 8; m++) {
  let best = null;
  for (let offset = 0; offset < Math.round(60 / m); offset++) {
    const arc0 = thinArc(m, offset);
    if (gapOf(fromArc(arc0)) < 0.01) continue;
    const v0 = verify(arc0);
    if (!v0.ok) continue;                      // this offset is not even the right link
    if (!best || v0.gap / v0.rms > best.ratio) best = { arc: arc0, ratio: v0.gap / v0.rms, v: v0, offset, seed: '-' };

    for (const seed of [7, 19, 101, 523]) {
      let arc = arc0, v = v0;
      for (let chunk = 0; chunk < 14; chunk++) {
        const res = optimise(arc, { steps: 4000, seed: seed + chunk });
        if (res.gap <= v.gap * 1.005) break;   // this seed has stopped winning
        const got = verify(res.arc);
        if (!got.ok) break;                    // past where knotlib can follow
        arc = res.arc; v = got;
        if (got.gap / got.rms > best.ratio) best = { arc, ratio: got.gap / got.rms, v: got, offset, seed };
      }
    }
  }
  if (!best) { console.log(`${String(3*m).padStart(7)}   no offset verifies`); continue; }
  const es = edgeStats(best.v.curves);
  console.log(`${String(3*m).padStart(7)}     ${best.v.gap.toFixed(4)}    ${best.ratio.toFixed(4)}` +
    `   ${String(best.offset).padStart(4)}  ${String(best.seed).padStart(4)}    ${es.min.toFixed(2)}/${es.max.toFixed(2)}` +
    `   ${es.turnMax.toFixed(0).padStart(4)}   ${best.v.ns}`);
  OUT[3*m] = { gap: r4(best.v.gap), ratio: r4(best.ratio), offset: best.offset, seed: best.seed,
               sublinks: best.v.ns, arc: best.arc.map((p) => p.map(r4)) };
}

writeFileSync(new URL('./best-gap.json', import.meta.url), JSON.stringify(OUT, null, 1) + '\n');
console.log('\nwrote best-gap.json');
