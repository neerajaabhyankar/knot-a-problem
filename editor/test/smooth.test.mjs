// Unit tests for smoothing. No browser needed.
//
// Two things are worth proving here and everything else is detail: that one
// dose parameter really does separate hand jitter from the shape underneath it
// (smoothen.md §1), and that the collision guard makes it impossible to pull a
// strand through another one (§2).

import { resample, smooth } from '../src/smooth.js';

let failures = 0;
function check(ok, label, detail = '') {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);


function circle(n = 200, r = 100) {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return [r * Math.cos(t), r * Math.sin(t), 0];
  });
}

/** A closed polygon, sampled densely along its edges. */
function polygon(sides, r = 100, per = 80) {
  const out = [];
  for (let k = 0; k < sides; k++) {
    const a = ((k / sides) * Math.PI * 2), b = (((k + 1) / sides) * Math.PI * 2);
    const p = [r * Math.cos(a), r * Math.sin(a), 0];
    const q = [r * Math.cos(b), r * Math.sin(b), 0];
    for (let i = 0; i < per; i++) {
      const t = i / per;
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, 0]);
    }
  }
  return out;
}

/**
 * Hand tremor: a fixed high-frequency ripple, deterministic so a failure always
 * reproduces. Two tones at 37 and 61 cycles per loop — features around 2% of
 * the length, which is what a kink is. Deliberately *not* white noise: white
 * noise carries as much energy at k=1 as at k=61, and a low-pass filter is
 * supposed to keep the k=1 part, so it would test the opposite of the claim.
 */
function jitter(points, size) {
  const n = points.length;
  const wig = (i, phase) =>
    Math.sin((2 * Math.PI * 37 * i) / n + phase) + 0.6 * Math.sin((2 * Math.PI * 61 * i) / n + 2 * phase);
  return points.map((p, i) => [p[0] + size * wig(i, 0), p[1] + size * wig(i, 2.4), p[2]]);
}

/** RMS distance from the centroid — the module's notion of "size". */
function rms(points) {
  const c = [0, 1, 2].map((k) => points.reduce((s, p) => s + p[k], 0) / points.length);
  return Math.sqrt(points.reduce((s, p) => s + dist(p, c) ** 2, 0) / points.length);
}

/** How far a closed path strays from a perfect circle, as a fraction of size. */
function roundness(points) {
  const c = [0, 1, 2].map((k) => points.reduce((s, p) => s + p[k], 0) / points.length);
  const rs = points.map((p) => dist(p, c));
  const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
  const dev = Math.sqrt(rs.reduce((s, r) => s + (r - mean) ** 2, 0) / rs.length);
  return dev / mean;
}

/**
 * Distance from a point to a polyline — to its *segments*, not its vertices.
 * Point-to-point would floor every measurement here at the sample spacing,
 * which is how a phase shift once masqueraded as leftover tremor.
 */
function toPath(p, path, closed = false) {
  let best = Infinity;
  const last = closed ? path.length - 1 : path.length - 2;
  for (let j = 0; j <= last; j++) {
    const a = path[j], b = path[(j + 1) % path.length];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const len2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
    const t = len2 ? Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / len2)) : 0;
    best = Math.min(best, Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t));
  }
  return best;
}

/** Mean gap between two paths — how differently shaped they are. */
function apart(a, b, closed = true) {
  return a.reduce((s, p) => s + toPath(p, b, closed), 0) / a.length;
}

/** Closest approach between two paths. */
function closest(a, b) {
  return Math.min(...a.map((p) => toPath(p, b)));
}

/** Closest approach of a closed path to itself, ignoring nearby stretches. */
function selfClosest(points, skip) {
  const n = points.length;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.min(j - i, n - (j - i)) < skip) continue;
      best = Math.min(best, dist(points[i], points[j]));
    }
  }
  return best;
}

// --- resampling ---------------------------------------------------------------

const rs = resample(circle(37), true, 64);
const spans = rs.map((p, i) => dist(p, rs[(i + 1) % rs.length]));
check(rs.length === 64, 'resample returns the count asked for', `${rs.length}`);
check(
  Math.max(...spans) / Math.min(...spans) < 1.02,
  'resample spaces points evenly in arclength',
  `spread ${(Math.max(...spans) / Math.min(...spans)).toFixed(4)}`,
);
check(dist(rs[0], rs[rs.length - 1]) > 1, 'a closed resample does not repeat the seam');

const open = resample([[0, 0, 0], [10, 0, 0], [10, 10, 0]], false, 21);
check(
  dist(open[0], [0, 0, 0]) < 1e-9 && dist(open[20], [10, 10, 0]) < 1e-9,
  'an open resample lands exactly on both ends',
);

// --- a circle is a fixed point ------------------------------------------------

const clean = smooth(circle(), { closed: true, amount: 0.4 }).points;
check(roundness(clean) < 1e-3, 'a circle survives even a heavy dose', `dev ${roundness(clean).toExponential(1)}`);
check(
  Math.abs(rms(clean) - rms(circle())) / rms(circle()) < 0.01,
  'and keeps its size — no shrinkage',
  `${rms(clean).toFixed(2)} vs ${rms(circle()).toFixed(2)}`,
);

// --- the central claim: jitter dies, shape lives ------------------------------
//
// A hand-drawn triangle: the shake sits at k≈37-61, the triangle itself at k=3.
// exp(-4k^2a^2) says a 6% dose annihilates one (1e-9 left) and barely touches
// the other (87% kept). That gap is the whole reason one slider is enough.

const tri = polygon(3);
const shaky = jitter(tri, 4);

// The honest test of "the shake is gone" is not distance to the ideal triangle
// — smoothing rounds the corners on purpose, and that shows up in the same
// number. It is whether smoothing the shaky one lands on the *same place* as
// smoothing the clean one. Whatever is left over is the shake.
const clean3 = smooth(tri, { closed: true, amount: 0.06 }).points;
const gentle = smooth(shaky, { closed: true, amount: 0.06 }).points;
check(
  apart(gentle, clean3) < apart(shaky, tri) / 8,
  'a 6% dose takes the shake out of a hand-drawn triangle',
  `${apart(shaky, tri).toFixed(2)} of shake in → ${apart(gentle, clean3).toFixed(2)} left`,
);
check(
  roundness(gentle) > 0.8 * roundness(tri),
  'and leaves it recognisably a triangle',
  `cornerness ${roundness(gentle).toFixed(3)} vs ${roundness(tri).toFixed(3)} ideal`,
);

const heavy = smooth(shaky, { closed: true, amount: 0.4 }).points;
check(
  roundness(heavy) < 0.05,
  'a 40% dose rounds the same triangle into a circle',
  `cornerness ${roundness(heavy).toFixed(4)}`,
);
check(
  Math.abs(rms(heavy) - rms(tri)) / rms(tri) < 0.06,
  'without the circle drifting off in size',
  `${rms(heavy).toFixed(1)} vs ${rms(tri).toFixed(1)}`,
);

// The doses have to be ordered, or the slider is lying about what it does.
const doses = [0.02, 0.05, 0.1, 0.2, 0.4].map(
  (a) => roundness(smooth(shaky, { closed: true, amount: a }).points),
);
check(
  doses.every((d, i) => i === 0 || d <= doses[i - 1] + 1e-9),
  'more dose is monotonically rounder',
  doses.map((d) => d.toFixed(3)).join(' → '),
);

// --- open strands are held by their ends --------------------------------------

const arc = resample(
  Array.from({ length: 120 }, (_, i) => {
    const t = (i / 119) * Math.PI;
    return [100 * Math.cos(t), 100 * Math.sin(t), 0];
  }),
  false,
  120,
);
const shakyArc = jitter(arc, 3);
const flat = smooth(shakyArc, { closed: false, amount: 0.5 }).points;
check(
  dist(flat[0], shakyArc[0]) < 1e-9 && dist(flat[flat.length - 1], shakyArc[shakyArc.length - 1]) < 1e-9,
  'an open strand keeps both endpoints exactly where they were',
);
const straightness = Math.max(
  ...flat.map((p) => {
    // Distance from the chord between the two ends.
    const a = flat[0], b = flat[flat.length - 1];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const t = (ap[0] * ab[0] + ap[1] * ab[1]) / (ab[0] ** 2 + ab[1] ** 2);
    return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t);
  }),
);
// exp(-4a^2) of the original bulge should survive a dose of `a` — that is the
// same law as the closed case, which is the point of counting an open strand's
// reach as two laps rather than one.
check(
  straightness > 25 && straightness < 50,
  'and relaxes toward the chord by exactly the amount advertised',
  `bulge ${straightness.toFixed(1)} of 100, predicted ${(100 * Math.exp(-1)).toFixed(1)}`,
);
const chord = smooth(shakyArc, { closed: false, amount: 1 }).points;
check(
  Math.max(...chord.map((p) => Math.abs(p[1]))) < 6,
  'a full dose turns an open arc into the straight line between its ends',
  `bulge ${Math.max(...chord.map((p) => Math.abs(p[1]))).toFixed(1)} of 100`,
);

// --- the guard ----------------------------------------------------------------

// An arc pinned at both ends, with a wall between it and the chord it wants to
// flatten onto. The flow drives straight into the wall; only the guard stops
// it. The result should be a tent pitched over the wall.
const MIN_GAP = 8;
const wall = Array.from({ length: 40 }, (_, i) => [-60 + (120 * i) / 39, 60, 0]);
const hump = Array.from({ length: 200 }, (_, i) => {
  const t = (i / 199) * Math.PI;
  return [100 * Math.cos(t), 100 * Math.sin(t), 0];
});

const guarded = smooth(hump, { closed: false, amount: 1, obstacles: [wall], minGap: MIN_GAP });
check(
  closest(guarded.points, wall) >= MIN_GAP - 1e-6,
  'the guard never lets a strand reach another one',
  `closest ${closest(guarded.points, wall).toFixed(3)} vs ${MIN_GAP}`,
);
check(guarded.blocked > 0, 'and says so', `${guarded.blocked} points held back`);

// Distance alone can't tell "stopped short" from "sailed through and out the
// far side", so check the side as well.
const through = (path) => path.filter(([x, y]) => Math.abs(x) < 60 && y < 60).length;
check(through(guarded.points) === 0, 'the strand stays on the side it started');

const free = smooth(hump, { closed: false, amount: 1 }).points;
check(
  through(free) > 0,
  'without the guard the same flow goes straight through — so the test has teeth',
  `${through(free)} of ${free.length} points came out the far side`,
);

// A trefoil: heat flow untied on its own would sweep a strand through a
// crossing. The guard has to keep every pass clear of every other.
function trefoil(n = 300, scale = 40) {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return [
      scale * (Math.sin(t) + 2 * Math.sin(2 * t)),
      scale * (Math.cos(t) - 2 * Math.cos(2 * t)),
      scale * -Math.sin(3 * t),
    ];
  });
}

const knot = jitter(trefoil(), 4);
const GAP = 10;
const relaxed = smooth(knot, { closed: true, amount: 0.6, minGap: GAP, tolerance: 0 });
const tight = selfClosest(relaxed.points, 8);
check(tight >= GAP - 1e-6, 'a trefoil never passes through itself', `closest pass ${tight.toFixed(2)} vs ${GAP}`);
check(
  roundness(relaxed.points) > 0.02,
  'and does not collapse to a circle — the knot holds it open',
  `cornerness ${roundness(relaxed.points).toFixed(3)}`,
);

// The guard's promise is geometric — nothing comes within minGap. The promise
// the user cares about is topological, so check that one directly: a Hopf link
// smoothed hard is still a Hopf link.

function linking(A, B) {
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const mid = (u, v) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2, (u[2] + v[2]) / 2];
  const seg = (P, i) => [P[i], P[(i + 1) % P.length]];
  let sum = 0;
  for (let i = 0; i < A.length; i++) {
    const [a0, a1] = seg(A, i);
    const da = [a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]];
    const ma = mid(a0, a1);
    for (let j = 0; j < B.length; j++) {
      const [b0, b1] = seg(B, j);
      const db = [b1[0] - b0[0], b1[1] - b0[1], b1[2] - b0[2]];
      const r = [mid(b0, b1)[0] - ma[0], mid(b0, b1)[1] - ma[1], mid(b0, b1)[2] - ma[2]];
      const rn = Math.hypot(...r);
      const c = cross(da, db);
      sum += (c[0] * r[0] + c[1] * r[1] + c[2] * r[2]) / (rn * rn * rn);
    }
  }
  return sum / (4 * Math.PI);
}

const hoopA = jitter(
  Array.from({ length: 200 }, (_, i) => {
    const t = (i / 200) * Math.PI * 2;
    return [100 * Math.cos(t), 100 * Math.sin(t), 0];
  }),
  6,
);
const hoopB = jitter(
  Array.from({ length: 200 }, (_, i) => {
    const t = (i / 200) * Math.PI * 2;
    return [100 + 100 * Math.cos(t), 0, 100 * Math.sin(t)];
  }),
  6,
);
const LINK_GAP = 20;
check(Math.abs(Math.abs(linking(hoopA, hoopB)) - 1) < 0.05, 'the fixture starts out as a Hopf link', `Lk ${linking(hoopA, hoopB).toFixed(3)}`);

// Smoothed one at a time, each seeing the other as it currently is — exactly
// how main.js drives a multi-strand selection.
const smoothA = smooth(hoopA, { closed: true, amount: 0.6, obstacles: [hoopB], minGap: LINK_GAP }).points;
const smoothB = smooth(hoopB, { closed: true, amount: 0.6, obstacles: [smoothA], minGap: LINK_GAP }).points;
check(
  Math.abs(Math.abs(linking(smoothA, smoothB)) - 1) < 0.05,
  'and is still one after a heavy dose on both components',
  `Lk ${linking(smoothA, smoothB).toFixed(3)}`,
);
check(
  closest(smoothA, smoothB) >= LINK_GAP - 1e-6,
  'with the two components still clear of each other',
  `closest ${closest(smoothA, smoothB).toFixed(2)}`,
);

// --- the thing smoothing alone cannot do -------------------------------------
//
// Two triangles drawn flat in one plane, linked only by the hops the lift put
// in. Smoothing can never flatten those hops, because the hop *is* what holds
// the two strands apart — the guard stops the flow dead, and turning the dial
// up does nothing at all. The only way out is for the strands to shove each
// other into different planes, and then they can both go straight-edged.

/** RMS distance from the best-fit plane, in strand radii. */
function flatness(pts, radius = 0.075) {
  const c = [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / pts.length);
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) {
    const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i][j] += d[i] * d[j];
  }
  // Smallest eigenvector of the covariance = the plane normal. Power-iterate on
  // (trace*I - M), whose largest eigenvector is the one we want.
  const tr = m[0][0] + m[1][1] + m[2][2];
  let v = [0.31, 0.53, 0.79];
  for (let it = 0; it < 600; it++) {
    const t = [0, 1, 2].map((i) => m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2]);
    const w = [0, 1, 2].map((i) => tr * v[i] - t[i]);
    const nn = Math.hypot(...w);
    v = w.map((x) => x / nn);
  }
  const off = pts.reduce(
    (sum, p) => sum + ((p[0] - c[0]) * v[0] + (p[1] - c[1]) * v[1] + (p[2] - c[2]) * v[2]) ** 2, 0,
  );
  return Math.sqrt(off / pts.length) / radius;
}

const RAD = 0.075;
const TIGHT = 3 * RAD; // what the app uses: three strand radii, centre to centre

function flatTriangle(cx, per = 140) {
  const v = [0, 1, 2].map((k) => {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    return [cx + 1.5 * Math.cos(a), 1.5 * Math.sin(a)];
  });
  const out = [];
  for (let k = 0; k < 3; k++) {
    const p = v[k], q = v[(k + 1) % 3];
    for (let i = 0; i < per; i++) out.push([p[0] + (q[0] - p[0]) * (i / per), p[1] + (q[1] - p[1]) * (i / per), 0]);
  }
  return out;
}

/** Index pairs where two closed xy paths cross. */
function meetings(A, B) {
  const hits = [];
  for (let i = 0; i < A.length; i++) {
    const p = A[i], q = A[(i + 1) % A.length];
    for (let j = 0; j < B.length; j++) {
      const a = B[j], b = B[(j + 1) % B.length];
      const den = (q[0] - p[0]) * (b[1] - a[1]) - (q[1] - p[1]) * (b[0] - a[0]);
      if (!den) continue;
      const t = ((a[0] - p[0]) * (b[1] - a[1]) - (a[1] - p[1]) * (b[0] - a[0])) / den;
      const u = ((a[0] - p[0]) * (q[1] - p[1]) - (a[1] - p[1]) * (q[0] - p[0])) / den;
      if (t > 0 && t < 1 && u > 0 && u < 1) hits.push([i, j]);
    }
  }
  return hits;
}

/** Dive the path under, at one crossing, the way a pen lift does. */
const hop = (path, at, depth = 4 * RAD, width = 14) =>
  path.map((p, i) => {
    const d = Math.min(Math.abs(i - at), path.length - Math.abs(i - at));
    return [p[0], p[1], p[2] - depth * Math.exp(-((d / width) ** 2))];
  });

const flatA = flatTriangle(0);
const flatB = flatTriangle(1.7);
const met = meetings(flatA, flatB);
check(met.length === 2, 'the two triangles overlap at exactly two crossings', `${met.length}`);

// A dives at one crossing, B at the other: under then over, which is a link.
const triA = hop(flatA, met[0][0]);
const triB = hop(flatB, met[1][1]);
check(
  Math.abs(Math.abs(linking(triA, triB)) - 1) < 0.05,
  'and drawn with a hop each they make a Hopf link',
  `Lk ${linking(triA, triB).toFixed(3)}`,
);
check(flatness(triA) > 0.5 && flatness(triB) > 0.5, 'neither is flat, because of the hops',
  `${flatness(triA).toFixed(2)}R / ${flatness(triB).toFixed(2)}R`);

const relax = (spread, sweeps) => {
  let a = triA, b = triB;
  for (let i = 0; i < sweeps; i++) {
    a = smooth(a, { closed: true, amount: 0.4, obstacles: [[...b, b[0]]], minGap: TIGHT, spread }).points;
    b = smooth(b, { closed: true, amount: 0.4, obstacles: [[...a, a[0]]], minGap: TIGHT, spread }).points;
  }
  return [a, b];
};

// This is the regression that matters: without shoving, the heaviest dose there
// is leaves the hops exactly where they were.
const [noShoveA, noShoveB] = relax(0, 3);
check(
  flatness(noShoveA) > 0.5 && flatness(noShoveB) > 0.5,
  'smoothing alone cannot flatten them however hard it tries',
  `${flatness(noShoveA).toFixed(2)}R / ${flatness(noShoveB).toFixed(2)}R`,
);

const [openA, openB] = relax(1, 3);
check(
  flatness(openA) < 0.15 && flatness(openB) < 0.15,
  'shoving them apart lets both go completely flat',
  `${flatness(openA).toFixed(2)}R / ${flatness(openB).toFixed(2)}R`,
);

// The honest limitation, asserted so nobody claims otherwise later: flatness
// only arrives at a dose that has also rounded every corner off. Getting the
// hop out needs diffusion at the hop's own scale, and by the time there is
// enough of it the triangle is a circle. Flat-*and*-still-a-triangle would need
// a separate mechanism — pulling each strand onto its own best-fit plane, which
// flattens without smoothing. See smoothen.md.
check(
  roundness(openA) < 0.05 && roundness(openB) < 0.05,
  'but the dose that flattens them has rounded them into circles',
  `cornerness ${roundness(openA).toFixed(3)} / ${roundness(openB).toFixed(3)}, ideal triangle ${roundness(flatA).toFixed(3)}`,
);
const gentleA = smooth(triA, { closed: true, amount: 0.08, obstacles: [[...triB, triB[0]]], minGap: TIGHT, spread: 1 }).points;
check(
  roundness(gentleA) > 0.1 && flatness(gentleA) > 0.5,
  'and a dose gentle enough to keep the corners leaves the hops in',
  `cornerness ${roundness(gentleA).toFixed(3)}, still ${flatness(gentleA).toFixed(2)}R from flat`,
);check(
  Math.abs(Math.abs(linking(openA, openB)) - 1) < 0.05,
  'and they are still linked afterwards',
  `Lk ${linking(openA, openB).toFixed(3)}`,
);
check(
  closest(openA, openB) >= TIGHT - 1e-6,
  'with the two of them still clear of each other',
  `closest ${(closest(openA, openB) / RAD).toFixed(2)}R vs ${(TIGHT / RAD).toFixed(0)}R`,
);

// --- degenerate input ---------------------------------------------------------

check(smooth([[0, 0, 0], [1, 0, 0]], { closed: false }).points.length === 2, 'two points are left alone');
check(smooth([], {}).points.length === 0, 'an empty strand is left alone');
check(
  smooth(circle(50, 100), { closed: true, amount: 0 }).points.length === 50,
  'a zero dose changes nothing',
);

console.log(failures ? `\n${failures} failing check(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
