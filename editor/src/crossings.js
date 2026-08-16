// Lifting a flat drawing into a real knot.
//
// A crossing needs one strand over and one under. Two rules decide which, in
// this order:
//
//   1. If you lifted the pen across one of the two passes, that pass goes
//      UNDER. That is what a break means on paper.
//   2. Otherwise the pass you drew earlier goes under — ink drawn later sits
//      on top of ink already on the page.
//
// Rule 2 always applies, so every crossing is always decided and the tubes
// never intersect. It also means a stroke drawn without a single pen lift is a
// descending diagram: a perfectly valid curve, but always an unknot however
// tangled it looks. Breaks are how you make a real knot. A trefoil is three
// breaks — as three strokes, or as one stroke with the pen lifted three times.

import { dedupe, simplifyStroke } from './simplify.js';

/**
 * Intersection of segments p1->p2 and p3->p4.
 * Returns fractions {t, u} along each, or null if they don't properly cross.
 */
function segmentCross(p1, p2, p3, p4) {
  const r = [p2[0] - p1[0], p2[1] - p1[1]];
  const s = [p4[0] - p3[0], p4[1] - p3[1]];
  const denom = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(denom) < 1e-12) return null; // parallel

  const qp = [p3[0] - p1[0], p3[1] - p1[1]];
  const t = (qp[0] * s[1] - qp[1] * s[0]) / denom;
  const u = (qp[0] * r[1] - qp[1] * r[0]) / denom;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  return { t, u };
}

/** Cumulative pixel arclength at each point, plus the total. */
function arcLengths(pts, closed) {
  const cum = [0];
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return { cum, total: cum[cum.length - 1] };
}

/** Shortest distance between two positions along the curve. */
function paramDistance(a, b, total, closed) {
  const d = Math.abs(a - b);
  return closed ? Math.min(d, total - d) : d;
}

/**
 * Every place the polyline crosses itself, as the two arclength positions where
 * it passes through: `first` is the pass drawn earlier. Adjacent segments are
 * skipped — they share an endpoint, they don't cross.
 */
export function findSelfCrossings(pts, closed) {
  const { cum } = arcLengths(pts, closed);
  const nSeg = closed ? pts.length : pts.length - 1;
  const out = [];

  for (let i = 0; i < nSeg; i++) {
    for (let j = i + 2; j < nSeg; j++) {
      if (closed && i === 0 && j === nSeg - 1) continue; // wraps to adjacent
      const hit = segmentCross(pts[i], pts[(i + 1) % pts.length], pts[j], pts[(j + 1) % pts.length]);
      if (!hit) continue;
      out.push({
        first: cum[i] + hit.t * (cum[i + 1] - cum[i]),
        second: cum[j] + hit.u * (cum[j + 1] - cum[j]),
      });
    }
  }
  return out;
}

/** Contiguous runs of pen-up points, as arclength intervals. */
function penUpSpans(isBridge, cum, closed) {
  const spans = [];
  const n = isBridge.length;
  let start = null;
  for (let i = 0; i < n; i++) {
    if (isBridge[i] && start === null) start = i;
    if (!isBridge[i] && start !== null) {
      spans.push([cum[start], cum[i]]);
      start = null;
    }
  }
  if (start !== null) spans.push([cum[start], cum[closed ? n : n - 1]]);
  return spans;
}

/**
 * Splice pen-down strokes into one path, remembering which points are bridges.
 *
 * Strokes are simplified individually — simplifying the concatenation would
 * smooth the bridges away, and the bridges are the whole point. A gap shorter
 * than `minGap` is a wobble rather than a break, so those strokes just join.
 * Closing the loop uses the same rule: a real gap at the seam is a break too.
 */
export function assembleStrokes(strokes, { closed = false, minGap = 0 } = {}) {
  const pts = [];
  const isBridge = [];
  const push = (p, bridge) => {
    pts.push(p);
    isBridge.push(bridge);
  };

  /** Interior points of a straight run across a gap; none if the gap is tiny. */
  const bridge = (from, to) => {
    const dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (dist < minGap) return;
    const steps = Math.max(4, Math.ceil(dist / 12));
    for (let i = 1; i < steps; i++) {
      const f = i / steps;
      push([from[0] + f * (to[0] - from[0]), from[1] + f * (to[1] - from[1])], true);
    }
  };

  for (const raw of strokes) {
    const simplified = simplifyStroke(dedupe(raw, 2), 6, 4);
    if (!simplified.length) continue;
    if (pts.length) bridge(pts[pts.length - 1], simplified[0]);
    for (const p of simplified) push(p, false);
  }
  if (closed && pts.length) bridge(pts[pts.length - 1], pts[0]);

  return { pts, isBridge };
}

/**
 * Turn a flat drawing into a lifted one.
 *
 * @param pts       2D screen points of the whole strand, bridges included.
 * @param isBridge  per-point flag: true where the pen was up. May be null.
 * @param closed    does the strand close into a loop?
 * @param options   { separation } — depth gap between over and under, in pixels.
 *
 * Returns { points: [[x, y, depth]], crossings, broken } where depth is in the
 * same pixel units, positive meaning toward the viewer, and `broken` counts the
 * crossings a pen lift decided rather than rule 2.
 */
export function liftPath(pts, isBridge, closed, options = {}) {
  const { cum, total } = arcLengths(pts, closed);
  const separation = options.separation ?? 60;
  const ramp = options.ramp ?? separation;

  const spans = isBridge ? penUpSpans(isBridge, cum, closed) : [];
  const penUp = (s) => spans.some(([s0, s1]) => s >= s0 && s <= s1);

  // The one decision per crossing: where along the strand it dives.
  const crossings = findSelfCrossings(pts, closed);
  let broken = 0;
  const dives = crossings.map(({ first, second }) => {
    if (penUp(first) === penUp(second)) return first; // rule 2
    broken++;
    return penUp(first) ? first : second; // rule 1
  });

  // Each dive is a smooth hollow one separation deep; everything else is flat.
  const depthAt = (s) => {
    let deepest = 0;
    for (const d of dives) {
      const u = paramDistance(s, d, total, closed) / ramp;
      if (u < 1) deepest = Math.max(deepest, 0.5 * (1 + Math.cos(Math.PI * u)));
    }
    return -separation * deepest;
  };

  // Subdivide only where the depth actually moves, so the spline can follow it.
  const nearDive = (s) => dives.some((d) => paramDistance(s, d, total, closed) < ramp);
  const maxStep = ramp / 5;

  const nSeg = closed ? pts.length : pts.length - 1;
  const out = [];
  for (let i = 0; i < nSeg; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const [s0, s1] = [cum[i], cum[i + 1]];
    const steps = nearDive(s0) || nearDive(s1) ? Math.max(1, Math.ceil((s1 - s0) / maxStep)) : 1;

    for (let k = 0; k < steps; k++) {
      const f = k / steps;
      const s = s0 + f * (s1 - s0);
      out.push([a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1]), depthAt(s)]);
    }
  }
  if (!closed) out.push([...pts[pts.length - 1], depthAt(total)]);

  return { points: out, crossings: crossings.length, broken };
}
