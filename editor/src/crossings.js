// Lifting a flat drawing into a real knot.
//
// A crossing needs one strand over and one under. Two rules decide which, in
// this order:
//
//   1. Where you lifted the pen, the gap is FILLED with a straight run, and that
//      fill goes UNDER. That is what a break means on paper.
//   2. Otherwise the strand drawn later goes over — ink drawn later sits on top
//      of ink already on the page.
//
// Rule 2 always applies, so every crossing is always decided and the tubes never
// intersect. It also means a stroke drawn without a single pen lift is a
// descending diagram: a valid curve, but always an unknot however tangled it
// looks. Breaks are how you make a real knot.
//
// The rules are applied ONE STROKE AT A TIME. A finished stroke's depth is never
// recomputed — a new stroke is lifted against whatever is already on screen and
// appended. That is what lets you resume an old strand from any camera angle:
// the strand's own geometry is the input, not the pixels you originally drew.

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

/** Raised cosine: 1 at the centre, easing to 0 at distance `ramp`. */
function falloff(u) {
  return u >= 1 ? 0 : 0.5 * (1 + Math.cos(Math.PI * u));
}

/**
 * Every place a polyline crosses itself, as the two arclength positions where it
 * passes through — `first` is the pass drawn earlier — plus the segment each one
 * sits on. Adjacent segments are skipped: they share an endpoint, they don't
 * cross.
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
        firstSeg: i,
        secondSeg: j,
      });
    }
  }
  return out;
}

/**
 * Where a new polyline crosses something already on screen. The obstacle carries
 * its own depth, so we learn not just *that* they cross but how deep the other
 * strand sits there.
 */
function crossingsWith(pts, cum, obstacle) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = 0; j < obstacle.length - 1; j++) {
      const hit = segmentCross(pts[i], pts[i + 1], obstacle[j], obstacle[j + 1]);
      if (!hit) continue;
      out.push({
        seg: i,
        s: cum[i] + hit.t * (cum[i + 1] - cum[i]),
        depth: obstacle[j][2] + hit.u * (obstacle[j + 1][2] - obstacle[j][2]),
      });
    }
  }
  return out;
}

/**
 * Interior points of the straight run that fills a pen-up gap. A gap shorter
 * than `minGap` is a wobble rather than a break, so the strokes just join.
 */
export function fillRun(from, to, minGap = 0) {
  const dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (dist < minGap) return [];
  const steps = Math.max(4, Math.ceil(dist / 12));
  return Array.from({ length: steps - 1 }, (_, i) => {
    const f = (i + 1) / steps;
    return [from[0] + f * (to[0] - from[0]), from[1] + f * (to[1] - from[1])];
  });
}

/**
 * Give one new stroke its depth.
 *
 * @param pts       2D screen points of the new part — gap fill included.
 * @param isFill    per-point flag: true where this is a pen-up gap fill.
 * @param options
 *   separation  depth gap between over and under, in pixels
 *   startDepth  depth of the end this stroke grows from; it eases back to the
 *               draw plane over one ramp
 *   obstacles   polylines already on screen, as [x, y, depth][] — this strand's
 *               finished part and every other curve
 *
 * Returns { points: [[x, y, depth]], crossings, under } — `under` counts the
 * crossings this stroke dives beneath, i.e. the ones your pen lift decided.
 * Depth is in pixels, positive toward the viewer.
 */
export function liftStroke(pts, isFill, options = {}) {
  const { startDepth = 0, obstacles = [], separation = 60 } = options;
  const ramp = options.ramp ?? separation;
  const { cum, total } = arcLengths(pts, false);

  // The stroke lands on the draw plane, easing off the depth it grew from.
  const base = (s) => (startDepth ? startDepth * falloff(s / ramp) : 0);

  // Pen-up gaps, as arclength intervals. A gap dives across its whole width,
  // not just at the crossing: the two stroke ends that flank a break sit right
  // beside the strand being crossed, and they have to clear it too.
  const spans = [];
  for (let i = 0; i < pts.length; i++) {
    if (!isFill?.[i]) continue;
    const last = spans[spans.length - 1];
    if (last && last[1] === cum[i - 1]) last[1] = cum[i];
    else spans.push([cum[Math.max(0, i - 1)], cum[i]]);
  }
  const spanAt = (seg) => spans.find(([s0, s1]) => cum[seg] >= s0 && cum[seg + 1] <= s1) ?? null;

  const constraints = [];
  let crossings = 0;
  let under = 0;

  /** A hollow (or hump) holding the strand at `depth` across `[s0, s1]`. */
  const hold = (span, s, depth) => {
    const [s0, s1] = span ?? [s, s];
    constraints.push({ s0, s1, depth, base: base((s0 + s1) / 2) });
  };

  // Against everything already drawn. We are the later strand, so rule 2 puts us
  // over — unless this bit is a gap fill, and then rule 1 puts us under.
  for (const obstacle of obstacles) {
    for (const c of crossingsWith(pts, cum, obstacle)) {
      crossings++;
      const span = spanAt(c.seg);
      if (span) under++;
      // Already clear of it in depth? Then it isn't really a crossing to fix.
      if (Math.abs(base(c.s) - c.depth) >= separation) continue;
      hold(span, c.s, c.depth + (span ? -separation : separation));
    }
  }

  // Against itself. Same two rules, read along the stroke.
  for (const c of findSelfCrossings(pts, false)) {
    crossings++;
    const firstSpan = spanAt(c.firstSeg);
    const secondSpan = spanAt(c.secondSeg);
    let [dive, span] = [c.first, null]; // rule 2: the earlier pass goes under
    if (Boolean(firstSpan) !== Boolean(secondSpan)) {
      under++;
      [dive, span] = firstSpan ? [c.first, firstSpan] : [c.second, secondSpan]; // rule 1
    }
    hold(span, dive, base(dive) - separation);
  }

  // Each constraint pulls the stroke off its base, easing back over one ramp.
  // Where they overlap the strongest one wins, so depth never doubles up.
  const depthAt = (s) => {
    let strongest = 0;
    for (const c of constraints) {
      const outside = s >= c.s0 && s <= c.s1 ? 0 : Math.min(Math.abs(s - c.s0), Math.abs(s - c.s1));
      const pull = (c.depth - c.base) * falloff(outside / ramp);
      if (Math.abs(pull) > Math.abs(strongest)) strongest = pull;
    }
    return base(s) + strongest;
  };

  // Subdivide only where the depth actually moves, so the spline can follow it.
  const marks = constraints.flatMap((c) => [c.s0, c.s1]);
  if (startDepth) marks.push(0);
  const nearMark = (s) => marks.some((m) => Math.abs(s - m) < ramp);
  const maxStep = ramp / 5;

  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const [s0, s1] = [cum[i], cum[i + 1]];
    const steps = nearMark(s0) || nearMark(s1) ? Math.max(1, Math.ceil((s1 - s0) / maxStep)) : 1;
    for (let k = 0; k < steps; k++) {
      const f = k / steps;
      const s = s0 + f * (s1 - s0);
      out.push([a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1]), depthAt(s)]);
    }
  }
  out.push([...pts[pts.length - 1], depthAt(total)]);

  return { points: out, crossings, under };
}
