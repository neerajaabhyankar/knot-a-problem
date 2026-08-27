// The end of the pipeline: pick, relax, verify, and write the deliverables.
import { readFileSync, writeFileSync } from 'node:fs';
import { wavyConfig, clearance, checkSymmetry } from './tetra.mjs';
import { tighten, ropelength, stillRight, expand } from './relaxsym.mjs';
import { bestProjection, idOf, REFERENCE, sublinks } from './lib.mjs';
import { allLinking } from './linking.mjs';
import { simplify } from '../knotlib/index.js';
import { svg, PALETTE } from './render.mjs';

const WHICH = Number(process.env.PICK ?? 0);
const ranked = JSON.parse(readFileSync('ranked.json', 'utf8'));
// Fewest crossings first, and among those the roomiest.
const chosen = ranked.filter((r) => r.full && r.full.n === Math.min(...ranked.filter((x) => x.full).map((x) => x.full.n)))
  .sort((a, b) => b.score - a.score)[WHICH];
console.log(`chosen ${chosen.from}: 4-link ${chosen.full.raw} -> ${chosen.full.n} crossings`);

const raw = wavyConfig({ ...chosen.p, n: 180 });
console.log(`before relaxation: ropelength ${ropelength(raw).toFixed(2)}, clearance ${clearance(raw).toFixed(4)}`);
const { curves } = tighten(raw[0].points.slice(0, 60), { steps: 500 });

console.log('\n=== after relaxation ===');
checkSymmetry(curves);
const { lk, slop } = allLinking(curves);
console.log(`  symmetry  : exact, |T| = 12`);
console.log(`  clearance : ${clearance(curves).toFixed(4)}   ropelength ${ropelength(curves).toFixed(2)}`);
console.log(`  linking   : ${lk.map((x) => `${x.i + 1}${x.j + 1}=${x.value}`).join(' ')} (slop ${slop.toExponential(1)})`);
const subs = sublinks(curves).map((s) => ({ v: s.vertex, got: idOf(s.curves, 128) }));
for (const s of subs) {
  console.log(`  vertex v${s.v}: projects to ${String(s.got.raw).padStart(2)}, simplifies to ${String(s.got.n).padStart(2)} crossings  ` +
    (s.got.print === REFERENCE.borromean ? 'BORROMEAN' : 'NOT borromean'));
}
const okAll = subs.every((s) => s.got.ok && s.got.print === REFERENCE.borromean);
const { diagram } = bestProjection(curves, 128);
const red = simplify(diagram);
console.log(`  whole link: projects to ${diagram.n}, simplifies to ${(red.diagram ?? red).n} crossings`);
console.log(`  VERDICT   : ${okAll ? 'every 3-component sublink is the Borromean rings' : 'FAILED'}`);

// Scale for the editor: its crossing guard wants 0.225 world units of gap.
const k = 0.32 / clearance(curves);
const scaled = curves.map((c) => ({ points: c.points.map((p) => p.map((x) => x * k)) }));
const NAMES = ['face A', 'face B', 'face C', 'face D'];
writeFileSync('tetrahedral-4-borromean.knot.json', JSON.stringify({
  format: 'knot-a-problem/scene', version: 1, saved: new Date().toISOString(),
  by: 'four-borromean/final.mjs',
  curves: scaled.map((c, i) => ({
    name: `Tetrahedral 4-Borromean — ${NAMES[i]}`, color: PALETTE[i],
    radius: 0.075, closed: true, by: 'agent',
    points: c.points.map((p) => p.map((x) => +x.toFixed(5))),
  })),
}, null, 1) + '\n');
writeFileSync('curves.json', JSON.stringify(curves.map((c) => c.points.map((p) => p.map((x) => +x.toFixed(5))))) + '\n');

for (const [file, dir, title] of [
  ['view-3fold.svg', [1, 1, 1], 'down a 3-fold axis — A faces you, B/C/D cycle'],
  ['view-2fold.svg', [0, 0, 1], 'down a 2-fold axis — A<->D, B<->C'],
  ['view-generic.svg', [0.37, 0.91, 0.21], 'a generic direction'],
]) writeFileSync(file, svg(curves, { direction: dir, title }));

writeFileSync('sublink-borromean.svg', svg(sublinks(curves)[0].curves, {
  direction: [1, 1, 1], colors: PALETTE.slice(1),
  title: 'drop A — the other three are the Borromean rings',
}));
writeFileSync('pair-unlinked.svg', svg([curves[1], curves[2]], {
  direction: [1, 1, 1], colors: PALETTE.slice(1),
  title: 'any two components on their own: unlinked',
}));
console.log('\nwrote tetrahedral-4-borromean.knot.json, curves.json and 5 svg views');
