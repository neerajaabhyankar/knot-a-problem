// Replace the two generating corners by rationals with a small common
// denominator, so the link in the paper is an exact object.
//
// Every group element here is a signed permutation of coordinates, so rational
// input gives rational output: all 24 vertices are rational, and every crossing
// is then decided by exact arithmetic rather than by floating point.
import { readFileSync, writeFileSync } from 'node:fs';
import { fromArc, edgeClearance, selfEdgeClearance, edgeStats } from '../polygon.mjs';
import { checkSymmetry } from '../tetra.mjs';
import { idOf, REFERENCE, sublinks } from '../lib.mjs';
import { allLinking } from '../linking.mjs';

const seed = JSON.parse(readFileSync('../artifact-data.json','utf8')).p6.arc;
console.log('starting from', JSON.stringify(seed));

const verify = (arc) => {
  const L = fromArc(arc);
  try { checkSymmetry(L); } catch { return null; }
  const gap = Math.min(edgeClearance(L), selfEdgeClearance(L));
  if (gap < 0.03) return null;
  if (!allLinking(L).lk.every((x) => x.value === 0)) return null;
  const got = sublinks(L).map((s) => idOf(s.curves, 128));
  if (!got.every((x) => x.ok && x.print === REFERENCE.borromean)) return null;
  return { gap, ns: got.map(x=>x.n).join('/') };
};

const results = [];
for (const D of [4, 5, 6, 8, 10, 12, 16, 20]) {
  // round each coordinate to the nearest multiple of 1/D, then try the
  // immediate neighbours too, since the nearest point need not be the best one
  const base = seed.map(p => p.map(x => Math.round(x*D)));
  let best = null;
  const span = D <= 8 ? 1 : 0;
  for (let a=-span;a<=span;a++) for (let b=-span;b<=span;b++) for (let c=-span;c<=span;c++)
  for (let d=-span;d<=span;d++) for (let e=-span;e<=span;e++) for (let f=-span;f<=span;f++) {
    const arc = [
      [(base[0][0]+a)/D, (base[0][1]+b)/D, (base[0][2]+c)/D],
      [(base[1][0]+d)/D, (base[1][1]+e)/D, (base[1][2]+f)/D],
    ];
    const v = verify(arc);
    if (v && (!best || v.gap > best.v.gap)) best = { arc, v, num: [[base[0][0]+a,base[0][1]+b,base[0][2]+c],[base[1][0]+d,base[1][1]+e,base[1][2]+f]] };
  }
  if (best) {
    console.log(`1/${String(D).padStart(2)}  gap ${best.v.gap.toFixed(4)}  sublinks ${best.v.ns}  ` +
      `p = (${best.num[0].join(',')})/${D}   q = (${best.num[1].join(',')})/${D}`);
    results.push({ D, ...best });
  } else console.log(`1/${String(D).padStart(2)}  no valid rational point found`);
}
const pick = results[0];
if (pick) {
  writeFileSync('rational-model.json', JSON.stringify({ denominator: pick.D, numerators: pick.num, arc: pick.arc, gap: pick.v.gap }, null, 1));
  console.log(`\nchose denominator ${pick.D}; wrote rational-model.json`);
}
