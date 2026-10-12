// The model the paper states: all 24 vertices have integer coordinates.
import { writeFileSync } from 'node:fs';
import { fromArc, edgeClearance, selfEdgeClearance, edgeStats } from '../polygon.mjs';
import { checkSymmetry } from '../tetra.mjs';
import { idOf, bestProjection, REFERENCE, sublinks } from '../lib.mjs';
import { allLinking } from '../linking.mjs';
import { simplify } from '../../knotlib/index.js';

const P = [3,-1,-1], Q = [-1,0,-2];        // the two generating corners
const L = fromArc([P, Q]);

console.log('generating corners   p = (' + P + ')   q = (' + Q + ')');
console.log('all coordinates integral:',
  L.every(c => c.points.every(p => p.every(x => Number.isInteger(x)))));
checkSymmetry(L);
console.log('tetrahedral symmetry: exact on all four generators');
console.log('corners per ring:', L[0].points.length, ' rings:', L.length);

const gap = edgeClearance(L), self = selfEdgeClearance(L), es = edgeStats(L);
console.log(`closest approach between rings ${gap.toFixed(4)}, within a ring ${self.toFixed(4)}`);
console.log(`edge lengths ${es.min.toFixed(3)} to ${es.max.toFixed(3)};  longest diagonal of the link ` +
  Math.max(...L.flatMap(c=>c.points.map(p=>Math.hypot(...p)))).toFixed(3));

const { lk, slop } = allLinking(L);
console.log('six linking numbers:', lk.map(x=>`${x.i+1}${x.j+1}=${x.value}`).join(' '), ` (worst slop ${slop.toExponential(1)})`);

const whole = bestProjection(L, 192);
const wr = simplify(whole.diagram); const wn = (wr.diagram ?? wr).n;
console.log(`whole link: best of 192 directions gives ${whole.diagram.n} crossings, reducing to ${wn}`);

console.log('\nsublink                 crossings  reduced  Borromean?');
for (const s of sublinks(L)) {
  const got = idOf(s.curves, 192);
  console.log(`drop K${s.vertex} (weave at v${s.vertex})   ${String(got.raw).padStart(6)}  ${String(got.n).padStart(7)}   ` +
    (got.print === REFERENCE.borromean ? 'YES' : 'no'));
}

const names = ['A','B','C','D'];
console.log('\nthe 24 vertices, by ring:');
L.forEach((c,i)=>console.log(`  K${i+1} (${names[i]}): ` + c.points.map(p=>'('+p.join(',')+')').join(' ')));
writeFileSync('link.json', JSON.stringify({ p:P, q:Q, rings: L.map(c=>c.points) }));
console.log('\nwrote link.json');
