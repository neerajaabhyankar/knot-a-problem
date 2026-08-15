// The eraser. Rubbing over a strand deletes the bit you touched.
//
// A closed loop with a bite taken out of it is an open arc; an arc rubbed in
// the middle becomes two arcs. So erasing is really "keep the surviving runs",
// and each surviving run becomes a curve in its own right.
//
// The dense sample of every affected curve is snapshotted once, when the drag
// begins. Every update re-derives the result from that snapshot rather than
// from the previous update, so repeated dabs don't slowly degrade the curve.

import { rdp3 } from './simplify.js';
import { sampleCurve } from './viewer.js';

const SAMPLES = 260;
const MIN_RUN = 6; // fragments shorter than this aren't worth keeping

export class EraseSession {
  /**
   * `only` restricts the session to a set of curve ids — the eraser works on
   * the strands you selected, so you can rub near a tangle without shaving
   * everything around it.
   */
  constructor(model, viewer, only = null) {
    this.model = model;
    this.viewer = viewer;
    this.dirty = false;

    const targets = only ? model.curves.filter((c) => only.has(c.id)) : model.curves;
    this.strands = targets.map((curve) => ({
      emitted: [curve.id], // curve ids this strand currently accounts for
      color: curve.color,
      name: curve.name,
      closed: curve.closed,
      points: sampleCurve(curve, SAMPLES),
      alive: null,
      touched: false,
    }));
    for (const s of this.strands) s.alive = new Array(s.points.length).fill(true);
  }

  /** Kill every sample within `radius` screen pixels of (px, py). */
  rub(px, py, radius) {
    const r2 = radius * radius;
    for (const strand of this.strands) {
      for (let i = 0; i < strand.points.length; i++) {
        if (!strand.alive[i]) continue;
        const [sx, sy] = this.viewer.project(strand.points[i]);
        const dx = sx - px;
        const dy = sy - py;
        if (dx * dx + dy * dy > r2) continue;
        strand.alive[i] = false;
        strand.touched = true;
        this.dirty = true;
      }
    }
  }

  /** Rewrite the model from the snapshot. Returns true if anything changed. */
  apply() {
    if (!this.dirty) return false;
    this.dirty = false;

    const epsilon = this.viewer.worldPerPixel() * 2.5;

    for (const strand of this.strands) {
      if (!strand.touched) continue;

      // Drop whatever this strand produced last time and rebuild from scratch.
      for (const id of strand.emitted) this.model.remove(id);
      strand.emitted = [];

      for (const run of survivingRuns(strand)) {
        if (run.length < MIN_RUN) continue;
        const pts = rdp3(
          run.map((v) => [v.x, v.y, v.z]),
          epsilon,
        );
        if (pts.length < 2) continue;
        // A fragment is always an open arc — the loop has been cut.
        const curve = this.model.addCurve(pts, {
          closed: false,
          color: strand.color,
          name: strand.name,
        });
        strand.emitted.push(curve.id);
      }
    }
    return true;
  }
}

/**
 * Maximal runs of surviving samples. On a closed strand the array wraps, so a
 * single bite yields one run rather than two.
 */
function survivingRuns(strand) {
  const { points, alive, closed } = strand;
  const n = points.length;
  if (alive.every((a) => a)) return [points.slice()];
  if (alive.every((a) => !a)) return [];

  let start = 0;
  if (closed) {
    // Rotate so the array begins just after a gap.
    while (alive[start]) start = (start + 1) % n;
    while (!alive[start]) start = (start + 1) % n;
  }

  const runs = [];
  let current = [];
  for (let k = 0; k < n; k++) {
    const i = closed ? (start + k) % n : k;
    if (alive[i]) {
      current.push(points[i]);
    } else if (current.length) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length) runs.push(current);
  return runs;
}
