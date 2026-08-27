// Shared plumbing: ask knotlib what a configuration of curves actually is.
import { project, directions, DegenerateProjection } from '../knotlib/index.js';
import { fingerprint, linking, simplify } from '../knotlib/index.js';
import { borromean, circle } from '../knotlib/test/fixtures.mjs';

/**
 * knotlib's own `choose()` cannot be used here, and the reason is worth
 * recording rather than papering over.
 *
 * `project()` runs five genericity checks and raises `DegenerateProjection`
 * when one fails, and `choose()` skips exactly that. But a direction can pass
 * all five and still build a diagram that fails the Euler check in the
 * `Diagram` constructor — "12 crossings in 1 piece(s) need 14 faces, traced
 * 12". That arrives as a bare `Error`, `choose()` does not catch it, and the
 * whole direction search dies on one bad sample. It happens on maybe 1 in 300
 * of the corrugated curves below, so it is not a rare-event curiosity.
 *
 * The honest reading is that the tolerances in `project()` are not quite tight
 * enough to guarantee what `Diagram` demands, so a sixth failure mode exists
 * that is not spelled as a sixth check. Locally, treat any throw as "this
 * direction is unusable" — which is the same policy `choose()` already applies
 * to the five named ones.
 */
export function bestProjection(curves, samples = 32) {
  let best = null;
  let usable = 0;
  const failures = new Map();
  for (const d of directions(samples)) {
    let got;
    try { got = project(curves, d); }
    catch (e) {
      const tag = e instanceof DegenerateProjection ? e.message : `non-planar: ${e.message}`;
      failures.set(tag, (failures.get(tag) ?? 0) + 1);
      continue;
    }
    usable++;
    if (!best || got.diagram.n < best.diagram.n) best = got;
  }
  if (!best) throw new DegenerateProjection(`no usable direction among ${samples}`);
  return { ...best, tried: samples, usable, failures };
}

/**
 * Fingerprint of a set of curves, or the reason there isn't one.
 *
 * `simplify()` runs before `fingerprint()`, and that is not an optimisation.
 * The Kauffman bracket is 2^n states and refuses above 16 crossings; the
 * corrugated curves here routinely project to 16 or 17. Since R1 and R2 do not
 * change the link, walking the diagram downhill first is free correctness —
 * these projections come back at 6, well inside the limit.
 */
export function idOf(curves, samples = 32) {
  try {
    const { diagram, usable } = bestProjection(curves, samples);
    const out = simplify(diagram);
    const D = out.diagram ?? out;
    return { ok: true, n: D.n, raw: diagram.n, print: fingerprint(D), lk: linking(D).value, usable };
  } catch (e) {
    return { ok: false, why: `${e.constructor.name}: ${e.message}` };
  }
}

/** The three-component references we compare sublinks against. */
export const REFERENCE = {
  borromean: idOf(borromean()).print,
  unlink3: idOf([circle({ at: [-3, 0, 0] }), circle(), circle({ at: [3, 0, 0] })]).print,
};

/** Every 3-component sublink, labelled by the vertex it surrounds. */
export function sublinks(curves) {
  return [1, 2, 3, 4].map((k) => ({
    vertex: k,
    faces: [1, 2, 3, 4].filter((i) => i !== k),
    curves: curves.filter((_, idx) => idx + 1 !== k),
  }));
}
