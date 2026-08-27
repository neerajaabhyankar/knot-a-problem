// Reidemeister moves.
//
// Three independent guarantees, each blind where the others see:
//
//   before  the precondition is structural — a face of the right degree with
//           the right over/under pattern. A clasp and a removable bigon are the
//           same picture apart from one bit, so this cannot be done by eye.
//   after   Euler's formula. Any mis-wired dart breaks it immediately, long
//           before an invariant would notice. (Enforced in the Diagram
//           constructor, so every move here is checked whether it likes it or not.)
//   after   the ambient fingerprint is unchanged. A smoke detector rather than
//           a proof — two different knots can share a fingerprint — but a
//           scrambled rotation system changes Jones instantly.
//
// And one test in the other direction: the writhe MUST change under R1. An
// invariant that never moves is not being tested.

import { CROSS, Diagram } from '../diagram.js';
import { choose, directions, project } from '../project.js';
import { fingerprint, jones } from '../invariants.js';
import * as L from '../laurent.js';
import { apply, find, simplify, survey } from '../moves.js';
import * as F from './fixtures.mjs';
import { check, done, refuses } from './harness.mjs';

const kinds = (D, kind) => survey(D).filter((m) => m.kind === kind);

// --- R1: a kink ------------------------------------------------------------------

const kinked = project([F.torus(2, 1, { n: 198 })], [0, 0, 1]).diagram;
const r1 = kinds(kinked, 'R1');
check(r1.length === 2 && r1.every((m) => m.available), 'a one-crossing kink offers R1 on both of its monogons', `${r1.length}`);

const unkinked = apply(kinked, r1[0]);
check(unkinked.n === 0 && unkinked.loops === 1,
  'removing it leaves a circle with no crossings on it at all', `${unkinked.n} crossings, ${unkinked.loops} free`);
check(unkinked.check(), 'and the result is still a plane diagram');
check(fingerprint(unkinked) === fingerprint(kinked), 'the fingerprint is unchanged — it was an unknot before and after',
  fingerprint(unkinked));
check(
  unkinked.writhe() !== kinked.writhe(),
  'but the writhe changed, which is the whole reason it cannot be part of a fingerprint',
  `${kinked.writhe()} → ${unkinked.writhe()}`,
);

// --- R2: a bigon, and the clasp that looks just like one ---------------------------

const overlap = project(F.overlappingPair(), [0, 0, 1]).diagram;
const r2 = kinds(overlap, 'R2');
check(r2.length === 4 && r2.every((m) => m.available), 'two circles overlapping with the same one on top offer R2', `${r2.length} bigons`);

const pulled = apply(overlap, r2[0]);
check(pulled.n === 0 && pulled.loops === 2, 'pulling them apart leaves two free circles',
  `${pulled.n} crossings, ${pulled.loops} free`);
check(fingerprint(pulled) === fingerprint(overlap), 'with the fingerprint unchanged', fingerprint(pulled));
check(pulled.writhe() === overlap.writhe(), 'and this time the writhe is unchanged too — R2 is regular isotopy',
  `${overlap.writhe()} → ${pulled.writhe()}`);

const hopf = choose(F.hopf()).diagram;
const hopfBigons = kinds(hopf, 'R2');
check(hopfBigons.length > 0, 'the Hopf link has bigons', `${hopfBigons.length}`);
check(
  hopfBigons.every((m) => !m.available && /clasp/.test(m.reason)),
  'and every one of them is refused — the strands alternate, so it is a clasp and no amount of pulling will undo it',
  hopfBigons[0].reason,
);
refuses(() => apply(hopf, hopfBigons[0]), 'applying it anyway is refused', /not available/);

// --- R3: a triangle, and the cyclic one that looks just like one --------------------

const venn = project(F.venn3(), [0, 0, 1]).diagram;
const tri = kinds(venn, 'R3');
check(tri.length === 8 && tri.every((m) => m.available),
  'three circles stacked at three heights make triangles that all admit R3 — the heights are a total order',
  `${tri.length} triangles`);

// Make that same triangle cyclic and nothing else about the picture change.
// Each of the three corners decides one "is a over b", so flipping the odd one
// out turns a total order into a cycle — and which corner that is has to be
// worked out, not guessed: flipping an arbitrary one of the three usually
// leaves the order still acyclic.
const chosen = tri[0];
const wins = chosen.face.map((d) => venn.isOver(venn.pair[d]));
const minority = wins.findIndex((w) => w !== (wins.filter(Boolean).length >= 2));
const flipAt = CROSS(chosen.face[(minority + 1) % 3]);
const flipped = new Diagram({
  n: venn.n,
  pair: venn.pair,
  over: venn.over.map((v, c) => (c === flipAt ? 1 - v : v)),
  loops: venn.loops,
});
const sameFace = survey(flipped).find(
  (m) => m.kind === 'R3' && m.face.join(',') === chosen.face.join(','),
);
check(
  sameFace && !sameFace.available && /entirely over/.test(sameFace.reason),
  'flip the corner that closes the cycle and that same triangle is refused — no strand is on top of the other two',
  `crossing ${flipAt}: ${sameFace?.reason || 'still available'}`,
);

const trefoil = choose([F.torus(2, 3)]).diagram;
const trefoilTris = kinds(trefoil, 'R3');
check(
  trefoilTris.length === 2 && trefoilTris.every((m) => !m.available),
  'the standard trefoil has two triangles and neither admits R3 — an alternating diagram is cyclic everywhere',
);
check(find(trefoil).length === 0, 'so the trefoil offers no simplifying move at all, which is correct and not a bug');
refuses(() => apply(venn, { ...tri[0] }), 'R3 is detected but not yet applied, and says so plainly', /not yet applied/);

// --- simplification ----------------------------------------------------------------

let messy = null;
for (const d of directions(24)) {
  try {
    const got = project([F.torus(2, 3)], d);
    if (!messy || got.diagram.n > messy.n) messy = got.diagram;
  } catch { /* degenerate directions are not the subject here */ }
}
check(messy.n > 3, 'a bad view of the trefoil draws it with extra crossings', `${messy.n}`);

const run = simplify(messy);
check(run.diagram.n === 3, 'and R1 + R2 alone walk it back down to three', `${messy.n} → ${run.diagram.n} via ${run.applied.join(', ')}`);
check(
  L.equal(jones(run.diagram).value, jones(messy).value),
  'with the Jones polynomial identical at both ends',
  L.toString(jones(run.diagram).value),
);
check(run.diagram.canonical() === trefoil.canonical(),
  'and the diagram it lands on is the standard one, not merely one with the same count');

// Every intermediate step, not just the endpoints.
let step = messy;
let ok = true;
const seenCounts = [step.n];
for (let i = 0; i < 50; i++) {
  const move = find(step).find((m) => m.kind === 'R1' || m.kind === 'R2');
  if (!move) break;
  const next = apply(step, move);
  if (fingerprint(next) !== fingerprint(step)) ok = false;
  step = next;
  seenCounts.push(step.n);
}
check(ok, 'the fingerprint holds at every single step, not just at the ends', seenCounts.join(' → '));

check(simplify(trefoil).applied.length === 0, 'simplifying something already simple does nothing');
check(simplify(hopf).diagram.n === 2, 'and the Hopf link stays at two crossings — a clasp is not simplifiable');

done('moves.test');
