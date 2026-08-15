// Lifting a flat drawing into a real knot.
//
// You draw a self-crossing curve on the draw plane. On its own that is a
// singular curve, not a knot — the strands genuinely intersect in 3D. This
// module finds those crossings and pushes the strands apart in depth.
//
// Which strand goes over is decided the way it is on paper: **you lift the
// pen**. A strand drawn continuously stays on top; the gap where you lifted is
// bridged by an arc that dips underneath. That's the convention every knot
// diagram in every textbook uses, and it means the drawing tool doesn't have to
// guess what you meant.
//
// If you leave a crossing ambiguous — both passes drawn with the pen down, so
// neither is marked as going under — we fall back to making those crossings
// **alternating** (over, under, over, under along the curve). That fallback is
// always consistent for a closed curve: a realizable Gauss code has an even
// number of encounters between the two visits to a crossing, so the visits land
// on opposite parities. It also matters that the fallback is alternating rather
// than something simpler like "whoever came first goes over" — resolving every
// crossing by traversal order gives a descending diagram, and those are always
// the unknot however tangled the picture looks.

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

/**
 * Every place the polyline crosses itself, as a pair of arclength positions.
 * Adjacent segments are skipped — they share an endpoint, they don't cross.
 */
export function findSelfCrossings(pts, closed) {
  const { cum } = arcLengths(pts, closed);
  const nSeg = closed ? pts.length : pts.length - 1;
  const segLen = (i) => cum[i + 1] - cum[i];
  const out = [];

  for (let i = 0; i < nSeg; i++) {
    for (let j = i + 2; j < nSeg; j++) {
      if (closed && i === 0 && j === nSeg - 1) continue; // wraps to adjacent
      const hit = segmentCross(pts[i], pts[(i + 1) % pts.length], pts[j], pts[(j + 1) % pts.length]);
      if (!hit) continue;
      out.push({
        sA: cum[i] + hit.t * segLen(i),
        sB: cum[j] + hit.u * segLen(j),
        x: pts[i][0] + hit.t * (pts[(i + 1) % pts.length][0] - pts[i][0]),
        y: pts[i][1] + hit.t * (pts[(i + 1) % pts.length][1] - pts[i][1]),
      });
    }
  }
  return out;
}

/**
 * Walk the curve and alternate over/under at each crossing encountered.
 * Returns a flat list of encounters: {s, id, sign} with +1 over, -1 under.
 */
export function assignAlternating(crossings) {
  const encounters = [];
  crossings.forEach((c, id) => {
    encounters.push({ s: c.sA, id });
    encounters.push({ s: c.sB, id });
  });
  encounters.sort((a, b) => a.s - b.s);

  const assigned = new Map();
  encounters.forEach((e, i) => {
    const prior = assigned.get(e.id);
    e.sign = prior === undefined ? (i % 2 === 0 ? 1 : -1) : -prior;
    assigned.set(e.id, e.sign);
  });
  return encounters;
}

/** Shortest distance between two positions along the curve. */
function paramDistance(a, b, total, closed) {
  const d = Math.abs(a - b);
  return closed ? Math.min(d, total - d) : d;
}

/** Raised cosine: 1 at the centre, easing to 0 at the window edge. */
function bump(u) {
  return Math.abs(u) >= 1 ? 0 : 0.5 * (1 + Math.cos(Math.PI * u));
}

/** Is `s` inside the span, and if not, how far outside? */
function distanceOutsideSpan(s, span, total, closed) {
  const { s0, s1 } = span;
  if (s >= s0 && s <= s1) return 0;
  return Math.min(paramDistance(s, s0, total, closed), paramDistance(s, s1, total, closed));
}

/** Contiguous runs of pen-up points, as arclength intervals. */
function bridgeSpans(isBridge, cum, closed) {
  const spans = [];
  const n = isBridge.length;
  let start = null;
  for (let i = 0; i < n; i++) {
    if (isBridge[i] && start === null) start = i;
    if (!isBridge[i] && start !== null) {
      spans.push({ s0: cum[start], s1: cum[i] });
      start = null;
    }
  }
  if (start !== null) spans.push({ s0: cum[start], s1: cum[closed ? n : n - 1] });
  return spans;
}

/**
 * Turn a flat drawing into a lifted one.
 *
 * @param pts       2D screen points of the whole strand, bridges included.
 * @param isBridge  per-point flag: true where the pen was up.
 * @param closed    does the strand close into a loop?
 * @param options   { height } — half the depth separation, in pixels.
 *
 * Returns { points: [[x, y, depth]], crossings, guessed } where depth is in the
 * same pixel units, positive meaning toward the viewer. Points are inserted
 * near crossings and bridge edges so the spline can actually follow the lift.
 */
export function liftPath(pts, isBridge, closed, options = {}) {
  const crossings = findSelfCrossings(pts, closed);
  const spans = [];
  const { cum, total } = arcLengths(pts, closed);
  if (isBridge) spans.push(...bridgeSpans(isBridge, cum, closed));

  if (crossings.length === 0 && spans.length === 0) {
    return { points: pts.map(([x, y]) => [x, y, 0]), crossings: 0, guessed: 0 };
  }

  const height = options.height ?? 30;
  const ramp = options.window ?? Math.min(70, Math.max(24, total / 14));

  // A pen-up bridge dips a full separation below the strands it passes under.
  const baseDepth = (s) => {
    let deepest = 0;
    for (const span of spans) {
      deepest = Math.max(deepest, bump(distanceOutsideSpan(s, span, total, closed) / ramp));
    }
    return -2 * height * deepest;
  };

  // A crossing whose two passes are already well separated needs no help.
  // Whatever is left over was never disambiguated — make those alternating.
  const ambiguous = crossings.filter(
    (c) => Math.abs(baseDepth(c.sA) - baseDepth(c.sB)) < 1.2 * height,
  );
  const corrections = assignAlternating(ambiguous).map((e) => ({ s: e.s, amp: e.sign * height }));

  const depthAt = (s) => {
    let d = baseDepth(s);
    for (const c of corrections) {
      d += c.amp * bump(paramDistance(s, c.s, total, closed) / ramp);
    }
    return d;
  };

  // Subdivide only where it matters: near a crossing or a bridge edge.
  const marks = corrections.map((c) => c.s);
  for (const span of spans) marks.push(span.s0, span.s1);

  const maxStep = ramp / 4;
  const nSeg = closed ? pts.length : pts.length - 1;
  const out = [];

  for (let i = 0; i < nSeg; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const s0 = cum[i];
    const s1 = cum[i + 1];

    const near = marks.some(
      (m) =>
        paramDistance(s0, m, total, closed) < ramp || paramDistance(s1, m, total, closed) < ramp,
    );
    const steps = near ? Math.max(1, Math.ceil((s1 - s0) / maxStep)) : 1;

    for (let k = 0; k < steps; k++) {
      const f = k / steps;
      const s = s0 + f * (s1 - s0);
      out.push([a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1]), depthAt(s)]);
    }
  }
  if (!closed) out.push([...pts[pts.length - 1], depthAt(total)]);

  return { points: out, crossings: crossings.length, guessed: ambiguous.length };
}

/** A single pen-down stroke — no bridges, so every crossing is ambiguous. */
export function liftStroke(pts, closed, options = {}) {
  return liftPath(pts, null, closed, options);
}
