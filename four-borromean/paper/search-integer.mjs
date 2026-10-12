// Look for an integer model whose diagrams are legible.
//
// The first integer model was found by rounding a model optimised for physical
// clearance, which is not the same thing as projecting well. Here the objective
// is the one that matters for a figure: the fewest crossings any direction
// gives. Fewer crossings also means a simpler object, so this is not only
// cosmetic.
import { fromArc, edgeClearance, selfEdgeClearance } from '../polygon.mjs';
import { checkSymmetry } from '../tetra.mjs';
import { allLinking } from '../linking.mjs';
import { choose } from './make-diagram.mjs';
import { idOf, REFERENCE, sublinks } from '../lib.mjs';
import { writeFileSync } from 'node:fs';

const R = 3;
const pts = [];
for (let x=-R;x<=R;x++) for (let y=-R;y<=R;y++) for (let z=-R;z<=R;z++) pts.push([x,y,z]);

const started = Date.now();
let tested=0, passedCheap=0;
const survivors = [];
for (const p of pts) {
  if (p[0] <= 0) continue;                       // kill the global sign symmetry
  for (const q of pts) {
    tested++;
    const L = fromArc([p,q]);
    const gapA = edgeClearance(L);
    if (!(gapA > 0.25)) continue;                // keep strands well apart
    if (!(selfEdgeClearance(L) > 0.25)) continue;
    const { lk, slop } = allLinking(L);
    if (slop > 0.02 || !lk.every(x=>x.value===0)) continue;
    passedCheap++;
    survivors.push({p,q,gap:Math.min(gapA,selfEdgeClearance(L))});
  }
}
console.log(`${tested} pairs tested, ${passedCheap} have all six linking numbers zero and good clearance`);
console.log(`(${((Date.now()-started)/1000).toFixed(0)}s)`);

// now the expensive part, on survivors only
const scored = [];
for (const s of survivors) {
  const L = fromArc([s.p,s.q]);
  const b = choose(L, { samples: 400 });
  if (!b) continue;
  // Minimising crossings on its own selects the UNLINK, which also has all six
  // linking numbers zero. Theorem 6.2 says a solution needs more than twelve
  // crossings, so anything at or below that is thrown out before ranking.
  if (b.X.length <= 12) continue;
  scored.push({ ...s, n: b.X.length, sep: b.q.minSep });
}
scored.sort((a,b)=> a.n-b.n || b.sep-a.sep);
console.log('\nbest by crossing number (above the 12-crossing floor):');
for (const s of scored.slice(0,10))
  console.log(`  n=${String(s.n).padStart(3)}  sep ${(s.sep*100).toFixed(1)}%  gap ${s.gap.toFixed(3)}  ` +
    `p=(${s.p})  q=(${s.q})`);

// verify the top handful properly
console.log('\nfull verification of the leaders:');
for (const s of scored.slice(0,25)) {
  const L = fromArc([s.p,s.q]);
  try { checkSymmetry(L); } catch { console.log('  symmetry FAILED'); continue; }
  const got = sublinks(L).map(x=>idOf(x.curves,128));
  const ok = got.every(x=>x.ok && x.print===REFERENCE.borromean);
  console.log(`  p=(${s.p}) q=(${s.q})  n=${s.n}  sublinks ${got.map(x=>x.ok?x.n:'-').join('/')}  ${ok?'ALL FOUR BORROMEAN':'not Borromean'}`);
  if (ok) { writeFileSync('best-integer.json', JSON.stringify({p:s.p,q:s.q,crossings:s.n})); console.log('    ^ wrote best-integer.json'); break; }
}
