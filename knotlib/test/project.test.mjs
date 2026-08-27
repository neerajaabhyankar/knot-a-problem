// Space curve → diagram.
//
// Two claims. The picture it reads is the right one — checked against linking
// numbers, which are known in advance for these fixtures. And when there is no
// picture to read, it says so instead of returning something plausible.

import { DegenerateProjection, choose, directions, project } from '../project.js';
import { linking } from '../invariants.js';
import * as F from './fixtures.mjs';
import { check, done, refuses } from './harness.mjs';

const lk = (D, i, j) => linking(D).value[i][j];

// --- reading the picture ------------------------------------------------------

const circle = project([F.circle()], [0, 0, 1]).diagram;
check(circle.n === 0 && circle.loops === 1 && circle.componentCount() === 1,
  'a flat circle projects to no crossings at all', `${circle.n} crossings, ${circle.loops} free`);

const trefoil = choose([F.torus(2, 3)]);
check(trefoil.diagram.n === 3, 'the best of 64 directions draws the trefoil with three crossings', `${trefoil.diagram.n}`);
check(trefoil.usable === trefoil.tried - 1, 'and reports honestly how many directions were usable',
  `${trefoil.usable}/${trefoil.tried}`);

check(choose([F.figureEight()]).diagram.n === 4, 'the figure eight with four');
check(choose([F.torus(2, 5)]).diagram.n === 5, 'the cinquefoil with five');

const hopf = choose(F.hopf()).diagram;
check(hopf.n === 2 && Math.abs(lk(hopf, 0, 1)) === 1, 'the Hopf link has linking number ±1',
  `${hopf.n} crossings, lk ${lk(hopf, 0, 1)}`);

const solomon = choose(F.torusLink(2, 4), { samples: 32 }).diagram;
check(Math.abs(lk(solomon, 0, 1)) === 2, "Solomon's seal has linking number ±2", `${lk(solomon, 0, 1)}`);

const borro = project(F.borromean(), F.DIAGONAL).diagram;
check(
  [lk(borro, 0, 1), lk(borro, 0, 2), lk(borro, 1, 2)].every((v) => v === 0),
  'the Borromean rings are pairwise unlinked — every pair has linking number 0',
  `${borro.n} crossings, lk ${[lk(borro, 0, 1), lk(borro, 0, 2), lk(borro, 1, 2)].join(',')}`,
);
check(borro.componentCount() === 3, 'and all three components survive the projection');

// --- refusing to read a picture that isn't there -------------------------------
//
// This is the part that matters. A crossing is a property of a projection, and
// some projections have none to give.

refuses(
  () => project(F.hopf(), [0, 1, 0]),
  'a Hopf link viewed down the axis of one ring is refused, not guessed at',
  /lie along each other/,
);
refuses(
  () => project(F.borromean(), [0, 0, 1]),
  'and so is any view that flattens a ring to a line',
  /lie along each other/,
);
refuses(
  () => project([F.torus(2, 1, { n: 200 })], [0, 0, 1]),
  'a crossing landing exactly on a sampled vertex is refused',
  /exactly on a vertex/,
);
refuses(() => project([{ points: F.circle().points, closed: false }]), 'an open arc is refused — it has no knot type');
refuses(() => project([]), 'and so is an empty scene');
refuses(() => project([{ points: [[0, 0, 0], [1, 1, 1]], closed: true }]), 'and a curve of two points');

// The nastiest of the five, because it is silent: viewed straight down its own
// axis the trefoil's third crossing lands on a *shared vertex*, so the
// intersection test rejects it and the crossing goes missing altogether. What
// comes back is a two-crossing diagram that is not planar. Euler's formula
// catches it afterwards, but the message is then about face counts rather than
// about the view, which is the wrong thing to tell someone.
refuses(
  () => project([F.torus(2, 3, { n: 200 })], [0, 0, 1]),
  'a crossing landing on a shared vertex is caught here, not left for Euler to find',
  /exactly on a vertex/,
);
check(
  project([F.torus(2, 3, { n: 200 })], [0.02, 0, 1]).diagram.n === 3,
  'and a couple of degrees off that axis the third crossing is back',
);

check(
  project([F.torus(2, 1, { n: 198 })], [0, 0, 1]).diagram.n === 1,
  'while a hair off that same view reads fine — degeneracy is about the direction, not the curve',
);

// --- the search is a search ----------------------------------------------------

const a = choose([F.torus(2, 3)]);
const b = choose([F.torus(2, 3)]);
check(a.diagram.canonical() === b.diagram.canonical(), 'the direction search is deterministic — same curves, same diagram');
check(
  directions(64).every((d) => Math.abs(Math.hypot(...d) - 1) < 1e-12),
  'the sampled directions are unit vectors',
);
check(new Set(directions(64).map((d) => d.join(','))).size === 64, 'and all distinct');

let worst = null;
for (const d of directions(24)) {
  try {
    const r = project([F.torus(2, 3)], d);
    if (!worst || r.diagram.n > worst.n) worst = r.diagram;
  } catch (e) {
    if (!(e instanceof DegenerateProjection)) throw e;
  }
}
check(worst.n > 3, 'a bad direction draws the same trefoil with more crossings than it needs',
  `${worst.n} instead of 3 — which is why "minimal" is never claimed, only "best of what was tried"`);

done('project.test');
