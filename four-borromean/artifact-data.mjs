// Emit exactly what the published page needs: one third of one ring per
// variant. The page regenerates the rest with the same two group operations
// used here, so the symmetry is structural on the page as well as in the repo.
import { readFileSync, writeFileSync } from 'node:fs';
import { fromArc, thinArc, polygonConfig, edgeClearance, selfEdgeClearance, edgeStats } from './polygon.mjs';
import { checkSymmetry } from './tetra.mjs';
import { idOf, REFERENCE, sublinks } from './lib.mjs';
import { allLinking } from './linking.mjs';

const round = (a, p = 4) => a.map((x) => Math.round(x * 10**p) / 10**p);
const opt = JSON.parse(readFileSync('polygons.json', 'utf8'));

const VARIANTS = {
  smooth: { label: 'smooth', arc: JSON.parse(readFileSync('curves.json','utf8'))[0].slice(0, 60) },
  p6:  { label: '6 corners',  arc: opt['6'].rings[0].slice(0, 2) },
  p9:  { label: '9 corners',  arc: opt['9'].rings[0].slice(0, 3) },
  p24: { label: '24 corners', arc: thinArc(8, 6) },
};

const out = {};
console.log('variant      corners  ring-ring gap  self gap  edge min/max   sublinks   verdict');
for (const [key, v] of Object.entries(VARIANTS)) {
  const curves = fromArc(v.arc);
  checkSymmetry(curves);
  const gap = edgeClearance(curves), self = selfEdgeClearance(curves), es = edgeStats(curves);
  const got = sublinks(curves).map((s) => idOf(s.curves, 128));
  const ok = got.every((x) => x.ok && x.print === REFERENCE.borromean)
          && allLinking(curves).lk.every((x) => x.value === 0);
  console.log(`${key.padEnd(12)} ${String(v.arc.length*3).padStart(7)}` +
    `${gap.toFixed(4).padStart(15)}${self.toFixed(4).padStart(10)}   ${es.min.toFixed(2)}/${es.max.toFixed(2)}`.padEnd(45) +
    `  ${got.map(x=>x.ok?x.n:'-').join('/').padEnd(10)} ${ok ? 'ALL FOUR BORROMEAN' : 'BROKEN'}`);
  if (!ok) throw new Error(`${key} does not verify — not shipping it`);
  out[key] = { label: v.label, corners: v.arc.length * 3, gap: Number(gap.toFixed(3)), arc: v.arc.map((p) => round(p)) };
}
writeFileSync('artifact-data.json', JSON.stringify(out));
console.log('\nwrote artifact-data.json,', (JSON.stringify(out).length/1024).toFixed(1), 'KB');
