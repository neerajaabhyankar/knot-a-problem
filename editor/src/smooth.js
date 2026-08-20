// Smoothing a strand: the heat equation along its own arclength, with a hard
// guard that stops it ever pulling one strand through another.
//
// One dose parameter covers everything, because diffusion is a low-pass filter
// and a mode repeating k times per loop decays as exp(-4 k^2 a^2). Quadratic in
// frequency, so hand jitter is annihilated long before a corner notices. See
// smoothen.md for the numbers.
//
// Pure polyline maths — no three.js, no DOM, no model. In and out are arrays of
// [x, y, z].

// Every number this module leans on, in one place.
const LAMBDA = 0.25; // diffusion step; the explicit scheme is unstable above 0.5
const STEP_SCALE = 1 / (Math.PI ** 2 * LAMBDA); // ~0.405; steps for dose a on n points is STEP_SCALE*a^2*n^2
const PER_ROUND = 40; // diffusion steps between collision re-measurements
const SAFETY = 0.45; // fraction of the free gap a point may spend in one round
const NEAR_SPAN = 1.6; // arclength, in minGaps, that still counts as the same piece of strand
const PUSH_REACH = 2; // at full spread, strands shove each other out to PUSH_REACH * minGap
const PUSH_RATE = 0.5; // fraction of the shortfall a shove closes in one round
const PUSH_ROUNDS = 16; // rounds a shove needs to turn into a tilt, however few the diffusion needs
const PUSH_LOCAL = 0.15; // how much of a shove may bend the strand rather than only move it
const OPEN_LAPS = 2; // an open strand's longest feature is two laps — itself, mirrored end to end
const PER_FEATURE = 10; // samples across the smallest feature we mean to keep
const MIN_N = 48; // ...however heavy the dose, or a circle comes out a polygon
const MAX_N = 240; // ...however light, or the cost runs away
const MIN_POINTS = 3; // below this there is no shape to smooth
const MAX_DOSE = 1; // one whole lap; past that the dose has nothing left to say
const TINY = 1e-12; // guards the division by a degenerate size

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (v) => Math.hypot(v[0], v[1], v[2]);
const dist = (a, b) => len(sub(a, b));

/**
 * @param {number[][]} points   one strand, as a dense polyline
 * @param {object} opts
 *   closed     does it loop
 *   amount     the dose: features below this fraction of the length are erased
 *   obstacles  other strands, as dense polylines — things not to touch
 *   minGap     closest two strand centre-lines may come
 *   spread     0..1, how hard strands shove each other apart; 0 is pure smoothing
 * @returns {{points: number[][], blocked: number}} `blocked` counts the points
 *   the guard held back — how much of the strand the knot refused to let move.
 */
export function smooth(points, opts = {}) {
  const {
    closed = false,
    amount = 0.06,
    obstacles = [],
    minGap = 0,
    spread = 0,
  } = opts;

  if (points.length < MIN_POINTS || !(amount > 0)) return { points: points.map((p) => p.slice()), blocked: 0 };

  const a = Math.min(MAX_DOSE, amount);
  const n = Math.max(MIN_N, Math.min(MAX_N, Math.round(PER_FEATURE / a)));
  const work = resample(points, closed, n);
  if (work.length < MIN_POINTS) return { points: work, blocked: 0 };

  if (!(pathLength(work, closed) > 0)) return { points: work, blocked: 0 };

  // The guard exists to hold `minGap` open; with nothing to hold, it is off —
  // which is also the only sane reading of "keep strands 0 apart".
  const guarding = minGap > 0 || obstacles.length > 0;
  // Neighbours along the strand are always close; only stretches far enough
  // apart *in arclength* that they could be a different pass count as
  // obstacles. NEAR_SPAN is wide enough that an honest bend never trips the
  // guard — a bend of radius minGap still spans 1.36 × minGap across that much
  // arclength — and narrow enough to stay inside the shortest hairpin that
  // could touch itself, which needs about 2 × minGap. Widen it and the guard
  // grows a blind spot.
  const nearWindow = NEAR_SPAN * minGap;
  // Smoothing alone can never flatten a crossing: the hop *is* what holds the
  // two strands apart, so the guard stops the flow dead and turning the dial up
  // does nothing. The way out is for something else to do that job — distance.
  // Strands shove each other out towards `pushGap`, the shove propagates
  // through the diffusion, and a strand that was only clear because of its hops
  // ends up clear because it has moved. See smoothen.md.
  const pushGap = minGap * (1 + Math.max(0, Math.min(1, spread)) * (PUSH_REACH - 1));

  // Steps to reach dose `a`. A closed strand's longest feature is one lap; an
  // open one pinned at both ends has a longest feature of OPEN_LAPS laps,
  // mirrored — and the dose enters squared, so the same dose has to run four
  // times as long for the two to mean the same thing. Without this, "flatten
  // this arc" would be off the end of the slider.
  const reach = closed ? 1 : OPEN_LAPS ** 2;
  const steps = Math.max(1, Math.round(STEP_SCALE * reach * a * a * work.length * work.length));
  // A shove has to propagate through the strand to turn into a tilt, and that
  // takes rounds — a heavy dose needs only four, which is not enough to move
  // anything anywhere. Scaled by how much shoving there is to do, because a
  // round costs two all-pairs distance sweeps and a barely-shoving strand
  // should not pay for twenty-four of them.
  const rounds = Math.max(1, Math.round(PUSH_ROUNDS * spread), Math.ceil(steps / PER_ROUND));
  const perRound = Math.ceil(steps / rounds);

  // Closed strands are flowed at constant size; open ones are held by their
  // ends instead, which is both what the handles need and what turns an arc
  // into the straight chord between them.
  const size = closed ? rmsRadius(work) : 0;

  const held = new Array(work.length).fill(false);

  // Get out of the way *first*, and rigidly. A drift and a tilt change no shape
  // whatsoever, so this buys the room a crossing needs without spending any of
  // the dose — which is the only way a strand comes out both flat and still the
  // shape you drew. Interleaving the shove with the diffusion instead makes the
  // two fight: the shove digs the hop deeper and only a dose heavy enough to
  // round every corner off can dig it back out.
  if (guarding && pushGap > minGap) {
    for (let r = 0; r < PUSH_ROUNDS; r++) {
      const near = nearest(work, closed, obstacles, nearWindow);
      if (!near.gaps.some((d, i) => near.dirs[i] && d < pushGap)) break;
      const moved = shove(work, near, closed, obstacles, nearWindow, pushGap, minGap, 0);
      if (moved === near) break; // rolled back: no room to move rigidly
    }
  }

  for (let r = 0; r < rounds; r++) {
    let near = guarding ? nearest(work, closed, obstacles, nearWindow) : null;
    if (near && pushGap > minGap) {
      near = shove(work, near, closed, obstacles, nearWindow, pushGap, minGap, PUSH_LOCAL);
    }

    const limits = near ? allowances(near.gaps, closed, minGap) : null;
    const start = work.map((p) => p.slice());

    let pts = work;
    for (let s = 0; s < perRound; s++) {
      pts = diffuse(pts, closed);
      if (limits) hold(pts, start, limits, held);
    }
    if (closed) {
      rescale(pts, size);
      if (limits) hold(pts, start, limits, held);
    }
    for (let i = 0; i < pts.length; i++) work[i] = pts[i];
  }
  return { points: work, blocked: held.filter(Boolean).length };
}

/** Even spacing in arclength. Closed strands don't repeat the seam. */
export function resample(points, closed, n) {
  const ring = closed ? [...points, points[0]] : points;
  const cum = [0];
  for (let i = 1; i < ring.length; i++) cum.push(cum[i - 1] + dist(ring[i - 1], ring[i]));
  const total = cum[cum.length - 1];
  if (!(total > 0)) return points.map((p) => p.slice());

  const span = total / (closed ? n : n - 1);
  const out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = k * span;
    while (j < ring.length - 2 && cum[j + 1] < target) j++;
    const seg = cum[j + 1] - cum[j];
    const t = seg > 0 ? (target - cum[j]) / seg : 0;
    out.push([
      ring[j][0] + (ring[j + 1][0] - ring[j][0]) * t,
      ring[j][1] + (ring[j + 1][1] - ring[j][1]) * t,
      ring[j][2] + (ring[j + 1][2] - ring[j][2]) * t,
    ]);
  }
  return out;
}

function pathLength(points, closed) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  if (closed) total += dist(points[points.length - 1], points[0]);
  return total;
}

/** One heat-equation step. Simultaneous, so it's the real thing and not a sweep. */
function diffuse(p, closed) {
  const n = p.length;
  const next = p.map((q) => q.slice());
  const lo = closed ? 0 : 1;
  const hi = closed ? n - 1 : n - 2;
  for (let i = lo; i <= hi; i++) {
    const before = p[(i - 1 + n) % n];
    const after = p[(i + 1) % n];
    const here = p[i];
    for (let d = 0; d < 3; d++) {
      next[i][d] = here[d] + LAMBDA * (before[d] - 2 * here[d] + after[d]);
    }
  }
  return next;
}

/**
 * For every point, how far it is from the nearest strand it is *not*
 * continuous with — any obstacle, or a stretch of itself more than `nearWindow` of
 * arclength away. This is the number the guard rations out: a point may spend
 * 45% of its slack per round, so two approaching points close at most 90% of
 * the gap between them and can never meet. That is what makes the knot type
 * survive by construction rather than by luck.
 */
function nearest(points, closed, obstacles, nearWindow) {
  const n = points.length;
  const s = arclength(points, closed);
  const total = s[n];
  const away = (a, b) => {
    const d = Math.abs(a - b);
    return closed ? Math.min(d, total - d) : d;
  };

  const gaps = new Array(n);
  const dirs = new Array(n);
  const q = [0, 0, 0]; // scratch: the closest point on the segment being tested

  for (let i = 0; i < n; i++) {
    const p = points[i];
    let best = Infinity;
    const escape = [0, 0, 0];
    const consider = (a, b) => {
      const d = closestOn(p, a, b, q);
      if (d >= best) return;
      best = d;
      for (let k = 0; k < 3; k++) escape[k] = p[k] - q[k];
    };

    const last = closed ? n - 1 : n - 2;
    for (let j = 0; j <= last; j++) {
      if (away(s[i], s[j]) < nearWindow || away(s[i], s[j + 1]) < nearWindow) continue;
      consider(points[j], points[(j + 1) % n]);
    }
    for (const other of obstacles) {
      for (let j = 0; j + 1 < other.length; j++) consider(other[j], other[j + 1]);
    }

    gaps[i] = best;
    dirs[i] = best > 0 && best < Infinity ? escape.map((x) => x / best) : null;
  }
  return { gaps, dirs };
}

/**
 * Push every point that is closer than `pushGap` straight away from whatever it
 * is close to, and report the state that leaves.
 *
 * The shove deliberately does *not* spend the guard's per-round budget. That
 * budget rations how fast things may **approach**, and a strand that is already
 * at `minGap` has none of it left — which is precisely the strand that needs
 * shoving. Moving directly away from the nearest stretch can only increase that
 * distance, so rationing it would be backwards.
 *
 * What a shove genuinely can do is walk a point out of one strand and into a
 * third. So it is measured afterwards, and if any point ended up worse than
 * both `minGap` and where it started, the whole round's shove is rolled back.
 * Reverting lands on a state that was already safe, which keeps the guarantee a
 * proof rather than a hope.
 */
function shove(points, near, closed, obstacles, nearWindow, pushGap, minGap, local) {
  // Nothing in range is the common case — most of a strand is nowhere near
  // anything — and it saves the verification sweep, which is not cheap.
  if (!near.gaps.some((d, i) => near.dirs[i] && d < pushGap)) return near;

  const before = points.map((p) => p.slice());

  // What every point would like to do to get clear.
  const want = points.map((_, i) =>
    !near.dirs[i] || near.gaps[i] >= pushGap
      ? [0, 0, 0]
      : near.dirs[i].map((x) => x * PUSH_RATE * (pushGap - near.gaps[i])),
  );

  // Applied as written, that is a purely local push — and at a crossing the
  // direction to get clear *is* the direction of the hop, so it digs the hop
  // deeper instead of moving the strand out of the way. The shape gets worse,
  // and diffusion cannot undo it because the push comes back every round.
  //
  // So the push is split. The part of it that is a rigid motion of the whole
  // strand — a drift plus a tilt — is what actually gets a strand out from
  // under another one, and it costs no shape at all, so it goes in at full
  // strength. The rest only bends the strand, which is what a knot needs to
  // open itself up but is also what digs the hole, so it is damped.
  const c = centroid(points);
  const drift = [0, 0, 0];
  const turn = [0, 0, 0];
  let spin = 0;
  for (let i = 0; i < points.length; i++) {
    const r = sub(points[i], c);
    for (let k = 0; k < 3; k++) drift[k] += want[i][k] / points.length;
    turn[0] += r[1] * want[i][2] - r[2] * want[i][1];
    turn[1] += r[2] * want[i][0] - r[0] * want[i][2];
    turn[2] += r[0] * want[i][1] - r[1] * want[i][0];
    spin += r[0] * r[0] + r[1] * r[1] + r[2] * r[2];
  }
  for (let k = 0; k < 3; k++) turn[k] /= Math.max(spin, TINY);

  for (let i = 0; i < points.length; i++) {
    const r = sub(points[i], c);
    const rigid = [
      drift[0] + turn[1] * r[2] - turn[2] * r[1],
      drift[1] + turn[2] * r[0] - turn[0] * r[2],
      drift[2] + turn[0] * r[1] - turn[1] * r[0],
    ];
    for (let k = 0; k < 3; k++) {
      points[i][k] += rigid[k] + local * (want[i][k] - rigid[k]);
    }
  }

  const after = nearest(points, closed, obstacles, nearWindow);
  const worse = after.gaps.some((d, i) => d < Math.min(near.gaps[i], minGap) - TINY);
  if (!worse) return after;

  for (let i = 0; i < points.length; i++) points[i] = before[i];
  return near;
}

/**
 * How far each point may travel this round. Moving a point moves the two
 * segments either side of it, so its allowance is the tightest of it and its
 * two neighbours — otherwise a point with room can drag a frozen neighbour's
 * segment inward and quietly spend clearance the guard thought it was holding.
 */
function allowances(gaps, closed, minGap) {
  const n = gaps.length;
  return gaps.map((_, i) => {
    const lo = closed ? gaps[(i - 1 + n) % n] : gaps[Math.max(0, i - 1)];
    const hi = closed ? gaps[(i + 1) % n] : gaps[Math.min(n - 1, i + 1)];
    return Math.max(0, SAFETY * (Math.min(gaps[i], lo, hi) - minGap));
  });
}

/** Running arclength, with the total in the last slot. */
function arclength(points, closed) {
  const s = [0];
  for (let i = 1; i < points.length; i++) s.push(s[i - 1] + dist(points[i - 1], points[i]));
  s.push(s[s.length - 1] + (closed ? dist(points[points.length - 1], points[0]) : 0));
  return s;
}

/** Closest point to `p` on segment ab, written into `out`. Returns the distance. */
function closestOn(p, a, b, out) {
  const ab = sub(b, a);
  const ap = sub(p, a);
  const len2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  let t = 0;
  if (len2 > 0) {
    t = (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / len2;
    t = Math.max(0, Math.min(1, t));
  }
  for (let k = 0; k < 3; k++) out[k] = a[k] + ab[k] * t;
  return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t);
}

/** Pull every point back inside its allowance, remembering which ones needed it. */
function hold(points, start, limits, held) {
  for (let i = 0; i < points.length; i++) {
    if (clampTo(points[i], start[i], limits[i])) held[i] = true;
  }
}

/** Pull `p` back to within `limit` of `start`. True if it had to. */
function clampTo(p, start, limit) {
  if (limit === Infinity) return false;
  const d = dist(p, start);
  if (d <= limit) return false;
  const f = limit / d; // d > limit >= 0 here, so this can't divide by zero
  for (let k = 0; k < 3; k++) p[k] = start[k] + (p[k] - start[k]) * f;
  return true;
}

function centroid(points) {
  const c = [0, 0, 0];
  for (const p of points) for (let k = 0; k < 3; k++) c[k] += p[k];
  for (let k = 0; k < 3; k++) c[k] /= points.length;
  return c;
}

/** RMS distance from the centroid — what "the same size" means here. */
function rmsRadius(points) {
  const c = centroid(points);
  let sum = 0;
  for (const p of points) {
    const d = dist(p, c);
    sum += d * d;
  }
  return Math.sqrt(sum / points.length);
}

/** Undo the shrinkage diffusion causes, about the centroid it leaves alone. */
function rescale(points, target) {
  const c = centroid(points);
  const now = rmsRadius(points);
  if (!(now > TINY) || !(target > 0)) return;
  const f = target / now;
  for (const p of points) {
    for (let k = 0; k < 3; k++) p[k] = c[k] + (p[k] - c[k]) * f;
  }
}
