// A trefoil drawn the way a person would: three pen-down arcs with a break at
// each of the three undercrossings, the third break being the one that closes
// the loop.
//
// Which three passes go under is decided *here*, in the test fixture, because
// that is the drawer's job. The app itself never guesses.

import { findSelfCrossings } from '../src/crossings.js';

export const trefoilPoint = (cx, cy, s, t) => [
  cx + s * (Math.sin(t) + 2 * Math.sin(2 * t)),
  cy + s * (Math.cos(t) - 2 * Math.cos(2 * t)),
];

export function trefoilPath(cx, cy, s, n = 240) {
  return Array.from({ length: n }, (_, i) => trefoilPoint(cx, cy, s, (i / n) * Math.PI * 2));
}

/** Arclength positions of the passes that go under in the alternating diagram. */
function underPositions(pts) {
  const encounters = [];
  findSelfCrossings(pts, true).forEach((c, id) => {
    encounters.push({ s: c.first, id }, { s: c.second, id });
  });
  encounters.sort((a, b) => a.s - b.s);

  const seen = new Map();
  return encounters
    .filter((e, i) => {
      const sign = seen.has(e.id) ? -seen.get(e.id) : i % 2 === 0 ? 1 : -1;
      seen.set(e.id, sign);
      return sign === -1;
    })
    .map((e) => e.s);
}

/**
 * The three pen-down strokes, in drawing order. Feed them to `assembleStrokes`
 * with `closed: true` and every crossing is decided by a break.
 */
export function trefoilStrokes(cx, cy, s, { n = 240, halfGap = 26 } = {}) {
  const pts = trefoilPath(cx, cy, s, n);

  const cum = [0];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[n];

  const under = underPositions(pts);
  const isGap = pts.map((_, i) =>
    under.some((u) => {
      const d = Math.abs(cum[i] - u);
      return Math.min(d, total - d) < halfGap;
    }),
  );

  // Start at the first point after a gap, so the runs come out as three whole
  // arcs and the last gap is the seam.
  const first = isGap.findIndex((gap, i) => !gap && isGap[(i - 1 + n) % n]);
  const strokes = [];
  let run = [];
  for (let k = 0; k < n; k++) {
    const i = (first + k) % n;
    if (isGap[i]) {
      if (run.length > 1) strokes.push(run);
      run = [];
    } else {
      run.push(pts[i]);
    }
  }
  if (run.length > 1) strokes.push(run);
  return strokes;
}
