// The whole claim, as one run that can fail.
//
// This reads the shipped curves rather than rebuilding them, so it tests the
// artefact this directory delivers and not the search that found it.
import { readFileSync } from 'node:fs';
import { clearance, checkSymmetry } from './tetra.mjs';
import { allLinking } from './linking.mjs';
import { bestProjection, idOf, REFERENCE, sublinks } from './lib.mjs';
import { fromArc, polygonConfig, edgeClearance, selfEdgeClearance } from './polygon.mjs';
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

// ---------------------------------------------------------------------------
// The polygons.
//
// These are a second claim, not a restatement of the first: thinning a ring to
// straight edges MOVES the strand, so each one is its own link until checked.
// The page offers them, so the test has to be able to fail on them.
console.log('\nthe polygon versions');
const shapes = JSON.parse(readFileSync('artifact-data.json', 'utf8'));
for (const [key, v] of Object.entries(shapes)) {
  if (key === 'smooth') continue;
  const poly = fromArc(v.arc);
  const gap = Math.min(edgeClearance(poly), selfEdgeClearance(poly));
  ok(poly[0].points.length === v.corners, `${v.label}: ${v.corners} corners per ring`);
  ok((() => { try { return checkSymmetry(poly); } catch { return false; } })(),
     `  still exactly tetrahedrally symmetric`);
  ok(allLinking(poly).lk.every((x) => x.value === 0), `  all six linking numbers still zero`);
  ok(Math.abs(gap - v.gap) < 5e-3, `  strands stay ${gap.toFixed(3)} apart, as published`);
  const got = sublinks(poly).map((s) => idOf(s.curves, 128));
  ok(got.every((x) => x.ok && x.print === REFERENCE.borromean),
     `  every one of the four sublinks is still the Borromean rings`);
  ok(v.recipe.length === v.corners / 3,
     `  cutting list is ${v.recipe.length} distinct corners, repeated three times`);
}

// Corner counts must be multiples of three, or the ring cannot carry the 3-fold
// rotation. Three corners is a flat triangle — planar and convex — which is the
// case §4 rules out. So six is the smallest possible, and six is achieved.
console.log('\nsix corners is the floor');
{
  let anyWorks = false;
  for (let off = 0; off < 60; off += 3) {
    const tri = polygonConfig(1, off);
    if (Math.min(edgeClearance(tri), selfEdgeClearance(tri)) < 0.01) continue;
    const got = sublinks(tri).map((s) => idOf(s.curves, 48));
    if (got.every((x) => x.ok && x.print === REFERENCE.borromean)
        && allLinking(tri).lk.every((x) => x.value === 0)) anyWorks = true;
  }
  ok(!anyWorks, 'three corners per ring never works, over 20 sampled offsets');
}

console.log(`\n${failures ? `${failures} FAILED` : 'all checks passed'}`);
process.exit(failures ? 1 : 0);
