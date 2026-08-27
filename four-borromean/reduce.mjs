// Try to turn "the invariants agree" into "here is the reduction".
//
// A fingerprint match is evidence. A sequence of Reidemeister moves carrying
// the projection onto the standard 6-crossing Borromean diagram is a proof, and
// knotlib's `canonical()` is exactly the equality test for the last step.
// `simplify()` is greedy and R1/R2 only, so it can stall above 6 — that is a
// limitation of the simplifier, not a verdict on the link.
import { simplify, survey } from '../knotlib/index.js';
import { bestProjection } from './lib.mjs';
import { borromean, DIAGONAL } from '../knotlib/test/fixtures.mjs';
import { fingerprint, project } from '../knotlib/index.js';

// The reference has to be reduced too: the ellipse fixture projects to 8
// crossings, and comparing a reduced 6 against an unreduced 8 can only ever
// say "differs". Both the diagram and its mirror count as a match, since
// canonical() deliberately does not quotient by the mirror and the Borromean
// rings are amphichiral.
// Down the diagonal is the one view where all three rings read as rings — the
// classic 6-crossing picture. The Fibonacci spiral `bestProjection` samples
// does not happen to contain it, and lands on 8 instead.
const raw = project(borromean(), DIAGONAL).diagram;
const std = simplify(raw).diagram ?? simplify(raw);
export const BORROMEAN_CANON = new Set([std.canonical(), std.mirror().canonical()]);
console.log(`standard Borromean: ${raw.n} -> ${std.n} crossings after simplify()`);

export function reduce(curves, samples = 96, label = '') {
  const { diagram } = bestProjection(curves, samples);
  const before = diagram.n <= 16 ? fingerprint(diagram) : null;
  const out = simplify(diagram);
  const D = out.diagram ?? out;
  const after = D.n <= 16 ? fingerprint(D) : null;
  const canon = D.canonical();
  console.log(`${label} ${diagram.n} -> ${D.n} crossings` +
    `   fingerprint ${before === null ? 'unchecked (over the bracket limit before simplifying)' : before === after ? 'unchanged' : 'CHANGED (bug!)'}` +
    `   ${BORROMEAN_CANON.has(canon) ? 'canonical() == the standard diagram (or its mirror)' : 'canonical() differs'}` +
    `   remaining: ${JSON.stringify(survey(D).map?.((s) => s.kind) ?? survey(D))?.slice(0, 90)}`);
  return { n0: diagram.n, n: D.n, matches: BORROMEAN_CANON.has(canon) };
}
