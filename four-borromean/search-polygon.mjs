// How few corners can each ring have and still be the right link?
import { polygonConfig, edgeClearance, selfEdgeClearance, edgeStats } from './polygon.mjs';
import { checkSymmetry } from './tetra.mjs';
import { idOf, REFERENCE, sublinks } from './lib.mjs';
import { allLinking } from './linking.mjs';

console.log('corners  off   ring-ring   self   edge min/max   turn  sublinks     verdict');
for (let m = 2; m <= 12; m++) {
  let bestRow = null;
  for (let offset = 0; offset < Math.round(60/m); offset++) {
    const curves = polygonConfig(m, offset);
    checkSymmetry(curves);
    const gap = edgeClearance(curves), self = selfEdgeClearance(curves);
    const es = edgeStats(curves);
    let kinds = '', verdict;
    if (gap < 0.01 || self < 0.01) verdict = 'strands touch';
    else {
      const got = sublinks(curves).map((s) => idOf(s.curves, 96));
      kinds = got.map((x) => (x.ok ? x.n : '-')).join('/');
      const allB = got.every((x) => x.ok && x.print === REFERENCE.borromean);
      const lk0 = allLinking(curves).lk.every((x) => x.value === 0);
      verdict = allB && lk0 ? 'ALL FOUR BORROMEAN' : 'wrong link';
    }
    const row = `${String(3*m).padStart(7)}${String(offset).padStart(5)}${gap.toFixed(4).padStart(12)}${self.toFixed(4).padStart(9)}   ${es.min.toFixed(2)}/${es.max.toFixed(2)}`.padEnd(56)
      + `${es.turnMax.toFixed(0).padStart(5)}  ${kinds.padEnd(12)} ${verdict}`;
    console.log(row);
    if (verdict.startsWith('ALL') && (!bestRow || gap > bestRow.gap)) bestRow = { gap, offset };
  }
  if (bestRow) console.log(`         -> best offset ${bestRow.offset}, gap ${bestRow.gap.toFixed(4)}`);
}
