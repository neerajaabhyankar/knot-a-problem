// The diagram type: does it hold together, and does it know when it doesn't?
//
// The load-bearing claim here is that `check()` has teeth. A structural
// validator that never fires is decoration, so one of these tests hands it a
// deliberately mis-wired diagram and insists it complains.

import { CROSS, DART, Diagram, OPP, SLOT, unlink } from '../diagram.js';
import { project, choose } from '../project.js';
import * as F from './fixtures.mjs';
import { check, done, refuses } from './harness.mjs';

const D = (curves, dir) => (dir ? project(curves, dir) : choose(curves)).diagram;

const trefoil = D([F.torus(2, 3)]);
const fig8 = D([F.figureEight()]);
const hopf = D(F.hopf());
const kink = D([F.torus(2, 1, { n: 198 })], [0, 0, 1]);
const overlap = D(F.overlappingPair(), [0, 0, 1]);
const borro = D(F.borromean(), F.DIAGONAL);

// --- structure ----------------------------------------------------------------

for (const [name, d] of [['trefoil', trefoil], ['figure eight', fig8], ['Hopf link', hopf], ['Borromean', borro]]) {
  const pieces = d.pieces().length;
  check(
    d.faces().length === d.n + 2 * pieces,
    `${name}: V − E + F = 2 on every piece`,
    `${d.n} crossings, ${pieces} piece(s), ${d.faces().length} faces`,
  );
}
check(
  trefoil.faces().map((f) => f.length).sort().join(',') === '2,2,2,3,3',
  'the trefoil has three bigons and two triangles',
  trefoil.faces().map((f) => f.length).sort().join(','),
);
check(kink.faces().filter((f) => f.length === 1).length === 2, 'a kink shows up as faces of degree one', `${kink.n} crossing`);

// The validator has teeth: re-pair two edges into a crossed pattern. Still a
// perfectly good involution, no longer a plane diagram.
refuses(
  () => {
    const pair = Int32Array.from(trefoil.pair);
    const [a, c] = [0, 5];
    const [b, d] = [pair[a], pair[c]];
    pair[a] = c; pair[c] = a; pair[b] = d; pair[d] = b;
    return new Diagram({ n: trefoil.n, pair, over: trefoil.over });
  },
  'a mis-wired pairing is caught by the face count, not by an invariant later',
  /not a plane diagram/,
);

refuses(() => new Diagram({ n: 1, pair: [1, 0, 3, 2, 4], over: [0] }), 'a pairing of the wrong length is refused');
refuses(() => new Diagram({ n: 1, pair: [1, 0, 3, 1], over: [0] }), 'a pairing that is not an involution is refused');
refuses(() => new Diagram({ n: 1, pair: [1, 0, 3, 2], over: [7] }), 'an over bit that is not a bit is refused');
refuses(() => new Diagram({ n: 1, pair: [0, 1, 3, 2], over: [0] }), 'a dart paired to itself is refused');

// --- components and signs -----------------------------------------------------

check(trefoil.componentCount() === 1 && hopf.componentCount() === 2 && borro.componentCount() === 3,
  'components are counted right', `${trefoil.componentCount()} / ${hopf.componentCount()} / ${borro.componentCount()}`);
check(unlink(3).componentCount() === 3 && unlink(3).n === 0, 'a crossing-free link is expressible at all — PD codes cannot say this');
check(Math.abs(trefoil.writhe()) === 3, 'the trefoil has writhe ±3', `${trefoil.writhe()}`);
check(fig8.writhe() === 0, 'the figure eight has writhe 0', `${fig8.writhe()}`);
check(Math.abs(hopf.writhe()) === 2, 'the Hopf link has writhe ±2', `${hopf.writhe()}`);
check(new Set(Array.from({ length: trefoil.n }, (_, c) => trefoil.sign(c))).size === 1,
  'and all three of its crossings have the same sign, as an alternating torus knot should');

// --- canonical form -----------------------------------------------------------
//
// Diagram equality, not knot equality. It has to see through renumbering and
// through which slot you call 0, and through looking at the page from behind —
// and it has to NOT see through the mirror.

const shuffled = (() => {
  const n = trefoil.n;
  const perm = Array.from({ length: n }, (_, i) => (i * 2 + 1) % n);
  const shifts = Array.from({ length: n }, (_, i) => (i * 3 + 2) % 4);
  return trefoil.relabel(perm, shifts);
})();
check(shuffled.canonical() === trefoil.canonical(), 'renumbering the crossings and rotating the slots changes nothing');
check(
  JSON.stringify([...shuffled.pair]) !== JSON.stringify([...trefoil.pair]),
  'even though every byte of the pairing moved',
);
check(trefoil.pageFlip().canonical() === trefoil.canonical(), 'nor does reading the page from the other side');
check(trefoil.mirror().canonical() !== trefoil.canonical(), 'but the mirror is a different diagram, and is not quotiented away');
check(trefoil.mirror().mirror().canonical() === trefoil.canonical(), 'and mirroring twice comes back');
check(hopf.pageFlip().canonical() === hopf.canonical(), 'the page flip holds for links too');
check(overlap.canonical() !== hopf.canonical(), 'two different 2-crossing, 2-component diagrams do not collide',
  `${overlap.canonical().length} vs ${hopf.canonical().length} chars`);
check(unlink(2).canonical() !== unlink(3).canonical(), 'and free loops are part of the identity');

// --- derived codes ------------------------------------------------------------

const pd = trefoil.pd();
const seenLabels = new Map();
for (const x of pd.X) for (const a of x) seenLabels.set(a, (seenLabels.get(a) ?? 0) + 1);
check(pd.X.length === trefoil.n, 'PD writes one crossing per crossing', `${pd.X.length}`);
check(seenLabels.size === 2 * trefoil.n, 'over 2n arcs', `${seenLabels.size}`);
check([...seenLabels.values()].every((v) => v === 2), 'each arc used exactly twice — it has two ends');
check(trefoil.pd().loops === 0 && unlink(2).pd().loops === 2,
  'and the free loops ride alongside, since PD itself has no way to mention them');

const g = trefoil.gauss();
check(g.length === 1 && g[0].length === 2 * trefoil.n, 'the Gauss code walks one component through every crossing twice',
  `${g[0].length} passes`);
check(g[0].filter((p) => p.over).length === trefoil.n, 'going over exactly half the time');

const gh = hopf.gauss();
check(gh.length === 2 && gh.every((c) => c.length === 2), 'a two-component link gets one Gauss sequence per component',
  gh.map((c) => c.length).join('+'));

// --- dart algebra -------------------------------------------------------------

check(
  Array.from({ length: 20 }, (_, d) => SLOT(DART(CROSS(d), SLOT(d))) === SLOT(d) && OPP(OPP(d)) === d).every(Boolean),
  'the dart helpers are mutually consistent',
);

done('diagram.test');
