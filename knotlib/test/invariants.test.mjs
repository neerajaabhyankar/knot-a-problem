// Invariants — and the bookkeeping that keeps them honest.
//
// The tests that earn their keep here are the ones about what is NOT invariant.
// Writhe and the Kauffman bracket both change under a Reidemeister I move, and
// a fingerprint built from either would silently follow the picture around
// instead of following the knot.

import { choose, project } from '../project.js';
import { BRACKET_LIMIT, INVARIANCE, bracket, crossingCount, fingerprint, jones, linking, writhe } from '../invariants.js';
import * as L from '../laurent.js';
import { unlink } from '../diagram.js';
import * as F from './fixtures.mjs';
import { check, done, refuses } from './harness.mjs';

const V = (D) => L.toString(jones(D).value);

const unknot = project([F.circle()], [0, 0, 1]).diagram;
const kinked = project([F.torus(2, 1, { n: 198 })], [0, 0, 1]).diagram;
const unlink2 = project(F.overlappingPair(), [0, 0, 1]).diagram;
const trefoil = choose([F.torus(2, 3)]).diagram;
const fig8 = choose([F.figureEight()]).diagram;
const hopf = choose(F.hopf()).diagram;

// --- the values ----------------------------------------------------------------
//
// Written in A rather than t: V(t) = f(A) with t = A⁻⁴. That keeps every
// exponent an integer, which a link with an even number of components would
// otherwise not manage.

check(V(unknot) === '1', 'the unknot has Jones polynomial 1', V(unknot));
check(V(unlink(1)) === '1', 'so does the bare circle with no diagram at all');
check(
  L.equal(jones(unlink2).value, jones(unlink(2)).value),
  'two overlapping circles have the same Jones polynomial as two separate ones',
  V(unlink2),
);
check(L.terms(jones(trefoil).value).length === 3, 'the trefoil has three terms', V(trefoil));
check(L.terms(jones(fig8).value).length === 5, 'the figure eight has five', V(fig8));
check(L.terms(jones(hopf).value).length === 2, 'the Hopf link has two', V(hopf));

// --- chirality -----------------------------------------------------------------

check(
  !L.equal(jones(trefoil).value, jones(trefoil.mirror()).value),
  'the trefoil and its mirror have different Jones polynomials — it is chiral, and the tool can see it',
  `${V(trefoil)}  vs  ${V(trefoil.mirror())}`,
);
check(
  L.equal(jones(trefoil.mirror()).value, L.reflect(jones(trefoil).value)),
  'and mirroring is exactly A ↦ A⁻¹ on the polynomial',
);
check(
  L.equal(jones(fig8).value, jones(fig8.mirror()).value),
  'the figure eight matches its own mirror — amphichiral',
  V(fig8),
);
check(L.palindromic(jones(fig8).value), 'which is the same statement as its polynomial reading the same backwards');

// --- what is invariant under what ------------------------------------------------
//
// The kinked diagram is an unknot wearing one extra crossing. Everything
// ambient has to ignore that; everything regular has to notice it.

check(V(kinked) === '1', 'a diagram of the unknot with a kink in it still has Jones polynomial 1');
check(
  !L.equal(bracket(kinked).value, bracket(unknot).value),
  'even though its Kauffman bracket is different — the bracket is not a knot invariant',
  `⟨kinked⟩ = ${L.toString(bracket(kinked).value)}, ⟨unknot⟩ = ${L.toString(bracket(unknot).value)}`,
);
check(kinked.writhe() !== unknot.writhe(), 'and neither is the writhe', `${kinked.writhe()} vs ${unknot.writhe()}`);

check(writhe(trefoil).invariance === INVARIANCE.REGULAR, 'writhe is tagged as surviving R2 and R3 only');
check(bracket(trefoil).invariance === INVARIANCE.REGULAR, 'so is the bracket');
check(jones(trefoil).invariance === INVARIANCE.AMBIENT, 'Jones is tagged as a knot invariant');
check(linking(hopf).invariance === INVARIANCE.AMBIENT, 'so is linking number');
check(crossingCount(trefoil).invariance === INVARIANCE.DIAGRAM, 'and a crossing count is tagged as being about the picture');

refuses(
  () => fingerprint(trefoil, [writhe(trefoil)]),
  'a fingerprint refuses a quantity that only survives regular isotopy',
  /regular isotopy only/,
);
check(
  fingerprint(kinked) === fingerprint(unknot),
  'so the fingerprint of a kinked unknot equals the fingerprint of a plain one',
  fingerprint(unknot),
);
check(fingerprint(trefoil) !== fingerprint(fig8), 'and different knots get different fingerprints');
check(fingerprint(unlink2) === fingerprint(unlink(2)), 'and a drawn unlink matches a bare one', fingerprint(unlink2));

// --- refusing to hang ------------------------------------------------------------

const huge = project([F.torus(4, 5, { n: 300 })], [0.3, 0.9, 0.1]).diagram;
check(huge.n > BRACKET_LIMIT, 'a careless projection can blow past what a state sum will do', `${huge.n} crossings`);
refuses(() => bracket(huge), 'and the bracket says so instead of hanging the process', /past what the state sum/);

// --- the polynomial arithmetic itself ---------------------------------------------
//
// Small enough to be obvious, which is why it is worth checking: a sign error
// here would look exactly like a knot theory bug.

const d = L.add(L.mono(2, -1), L.mono(-2, -1));
check(L.toString(d) === '-A^-2 -A^2', 'δ = −A² − A⁻² writes itself out correctly', L.toString(d));
check(L.equal(L.mul(d, L.one()), d), 'multiplying by one does nothing');
check(L.isZero(L.add(d, L.scale(d, -1))), 'and a polynomial minus itself is zero');
check(L.equal(L.reflect(L.reflect(d)), d), 'reflecting twice comes back');
check(L.toString(L.ZERO) === '0', 'and zero prints as zero');

done('invariants.test');
