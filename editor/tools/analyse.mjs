// Read a saved scene and tell you what it is.
//
// The editor cannot do this yet — knotlib is not wired into the UI. This is the
// bridge in the meantime: draw something, hit Save, and run it through the
// mathematics from the command line.
//
//   npm run analyse -- trefoil                     # a shipped library shape
//   npm run analyse -- ~/Downloads/knot-2026-08-27-1432.knot.json
//   npm run analyse -- hopf-link --direction 0,1,0 # ask for one specific view
//
// It lives here rather than in knotlib/ on purpose. `.knot.json` is the
// editor's format, so parsing it is the editor's business; the dependency runs
// one way and knotlib stays ignorant that a drawing program exists.

import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../src/io.js';
import { DegenerateProjection, choose, fingerprint, jones, laurent, linking, project, simplify, survey } from '../../knotlib/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIBRARY = join(HERE, '../src/library');

const argv = process.argv.slice(2);
const flags = {};
const loose = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i];
  else loose.push(argv[i]);
}
const flag = (name, fallback = null) => flags[name] ?? fallback;
const target = loose[0];

if (!target) {
  const shapes = (await readdir(LIBRARY)).filter((f) => f.endsWith('.knot.json')).map((f) => f.replace('.knot.json', ''));
  console.error('usage: npm run analyse -- <file.knot.json | shape> [--direction x,y,z] [--samples 64]');
  console.error(`\nshipped shapes: ${shapes.join(' ')}`);
  process.exit(2);
}

const path = target.endsWith('.knot.json') ? resolve(target) : join(LIBRARY, `${target}.knot.json`);
let scene;
try {
  scene = parse(await readFile(path, 'utf8'));
} catch (e) {
  if (e.code === 'ENOENT' && !target.endsWith('.knot.json')) {
    const shapes = (await readdir(LIBRARY)).filter((f) => f.endsWith('.knot.json')).map((f) => f.replace('.knot.json', ''));
    console.error(`no shipped shape called "${target}". There is: ${shapes.join(' ')}`);
  } else {
    console.error(`could not read ${path}\n  ${e.message}`);
  }
  process.exit(1);
}

console.log(`${path}`);
console.log(`  ${scene.curves.length} curve(s): ${scene.curves.map((c) => `${c.name} (${c.points.length} pts${c.closed ? '' : ', open'})`).join(', ')}`);

const open = scene.curves.filter((c) => !c.closed);
if (open.length) {
  console.error(`\n${open.length} curve(s) are open arcs, which have no knot type. Close them first.`);
  process.exit(1);
}

// --- the projection -----------------------------------------------------------

const direction = flag('direction');
let got;
try {
  got = direction
    ? { ...project(scene.curves, direction.split(',').map(Number)), tried: 1, usable: 1 }
    : choose(scene.curves, { samples: Number(flag('samples', 64)) });
} catch (e) {
  if (!(e instanceof DegenerateProjection)) throw e;
  console.error(`\nno diagram from that view: ${e.message}`);
  console.error('A crossing is a property of a projection, not of a curve — try another direction.');
  process.exit(1);
}

const D = got.diagram;
console.log(`\nprojection  looking along [${got.direction.map((v) => v.toFixed(3)).join(', ')}]`);
if (!direction) console.log(`            best of ${got.tried} sampled directions, ${got.usable} of them usable`);
console.log(`diagram     ${D.n} crossing(s), ${D.componentCount()} component(s)${D.loops ? `, ${D.loops} with no crossings` : ''}`);

const degrees = D.faces().map((f) => f.length).sort((a, b) => a - b);
console.log(`faces       ${degrees.join(', ')}  (must be ${D.n} + 2 per piece — checked on construction)`);

// --- invariants ---------------------------------------------------------------

console.log(`\nwrithe      ${D.writhe()}   [regular isotopy only — a kink changes it]`);
const lk = linking(D).value;
if (lk.length > 1) {
  const pairs = [];
  for (let i = 0; i < lk.length; i++) for (let j = i + 1; j < lk.length; j++) pairs.push(`${i}-${j}: ${lk[i][j]}`);
  console.log(`linking     ${pairs.join('   ')}`);
}
try {
  const v = jones(D).value;
  console.log(`Jones       ${laurent.toString(v)}       (in A; V(t) has t = A⁻⁴)`);
  console.log(`chirality   ${laurent.equal(v, laurent.reflect(v)) ? 'this polynomial cannot tell it from its mirror' : 'differs from its mirror — chiral'}`);
  console.log(`fingerprint ${fingerprint(D)}`);
} catch (e) {
  console.log(`Jones       not computed: ${e.message}`);
}

// --- what can be done to it ----------------------------------------------------

const moves = survey(D);
const line = (kind) => {
  const all = moves.filter((m) => m.kind === kind);
  if (!all.length) return `${kind}          none`;
  const yes = all.filter((m) => m.available).length;
  const why = [...new Set(all.filter((m) => !m.available).map((m) => m.reason))];
  return `${kind}          ${all.length} face(s), ${yes} available${why.length ? ` — ${why.join('; ')}` : ''}`;
};
console.log(`\n${line('R1')}\n${line('R2')}\n${line('R3')}`);

const run = simplify(D);
console.log(
  run.applied.length
    ? `simplify    ${D.n} → ${run.diagram.n} crossings via ${run.applied.join(', ')}${run.diagram.loops ? `, leaving ${run.diagram.loops} free circle(s)` : ''}`
    : 'simplify    nothing to remove (greedy R1/R2 only — this is not a claim of minimality)',
);
if (run.applied.length) {
  console.log(`            fingerprint ${fingerprint(run.diagram) === fingerprint(D) ? 'unchanged ✓' : 'CHANGED — that is a bug'}`);
}
