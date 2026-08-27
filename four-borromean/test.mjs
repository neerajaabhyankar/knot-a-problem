// The whole claim, as one run that can fail.
//
// This reads the shipped curves rather than rebuilding them, so it tests the
// artefact this directory delivers and not the search that found it.
import { readFileSync } from 'node:fs';
import { clearance, checkSymmetry } from './tetra.mjs';
import { allLinking } from './linking.mjs';
import { bestProjection, idOf, REFERENCE, sublinks } from './lib.mjs';
import { simplify } from '../knotlib/index.js';

let failures = 0;
const ok = (cond, what) => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!cond) failures++;
};

const curves = JSON.parse(readFileSync('curves.json', 'utf8')).map((points) => ({ points, closed: true }));

console.log('the shipped link');
ok(curves.length === 4, 'four components');
ok((() => { try { return checkSymmetry(curves); } catch { return false; } })(),
   'invariant under the tetrahedral rotation group, exactly, on all four generators');
ok(clearance(curves) > 0.25, `components stay ${clearance(curves).toFixed(4)} apart`);

const { lk, slop } = allLinking(curves);
ok(slop < 1e-6, `Gauss linking integrates to integers (worst slop ${slop.toExponential(1)})`);
ok(lk.every((x) => x.value === 0), 'all six pairwise linking numbers are zero');

console.log('\nevery three-component sublink');
for (const s of sublinks(curves)) {
  const got = idOf(s.curves, 128);
  ok(got.ok && got.print === REFERENCE.borromean,
     `dropping component ${s.vertex} (the weave at vertex v${s.vertex}) leaves the Borromean fingerprint`);
  ok(got.ok && got.n === 6,
     `  and it reduces under R1/R2 to ${got.n} crossings, from a ${got.raw}-crossing projection`);
}

console.log('\nthe whole link');
const { diagram } = bestProjection(curves, 128);
const red = simplify(diagram);
const n = (red.diagram ?? red).n;
ok(n >= 24, `does not simplify below ${n} crossings — it is a genuinely complicated link`);

console.log(`\n${failures ? `${failures} FAILED` : 'all checks passed'}`);
process.exit(failures ? 1 : 0);
