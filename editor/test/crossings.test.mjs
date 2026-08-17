// Unit tests for the flat-drawing -> 3D-knot lift. No browser needed.

import { fillRun, findSelfCrossings, liftStroke } from '../src/crossings.js';
import { trefoilPath, trefoilStrokes } from './trefoil.mjs';

const SEPARATION = 60;

let failures = 0;
function check(ok, label, detail = '') {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

function circle(n = 64, r = 150) {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return [r * Math.cos(t), r * Math.sin(t)];
  });
}

/**
 * Draw a strand the way the app does: one stroke at a time, each lifted against
 * everything already drawn and then appended. Pure 2D, no camera — `depth` is
 * just the third coordinate.
 */
function draw(strokes, { closed = false, separation = SEPARATION } = {}) {
  const points = [];
  let crossings = 0;
  let under = 0;

  strokes.forEach((stroke, i) => {
    let pts = stroke;
    let isFill = stroke.map(() => false);
    let startDepth = 0;

    if (points.length) {
      const tail = points[points.length - 1];
      const fill = fillRun([tail[0], tail[1]], stroke[0], separation / 2);
      pts = [...fill, ...stroke];
      isFill = [...fill.map(() => true), ...stroke.map(() => false)];
      startDepth = tail[2];
    }
    if (closed && i === strokes.length - 1) {
      const head = points[0] ?? stroke[0];
      const back = fillRun(stroke[stroke.length - 1], [head[0], head[1]], separation / 2);
      pts = [...pts, ...back];
      isFill = [...isFill, ...back.map(() => true)];
    }

    // The live end is where this stroke attaches, not something it crosses.
    const obstacles = points.length > 3 ? [points.slice(0, -2)] : [];
    const lifted = liftStroke(pts, isFill, { separation, startDepth, obstacles });
    crossings += lifted.crossings;
    under += lifted.under;
    points.push(...lifted.points);
  });

  return { points, crossings, under };
}

/** Closest the strand comes to itself, ignoring points that are neighbours along it. */
function minSelfDistance(points, closed, exclude) {
  const cum = [0];
  const n = closed ? points.length : points.length - 1;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  const total = cum[n];

  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const along = cum[j] - cum[i];
      if (Math.min(along, total - along) < exclude) continue;
      const [ax, ay, az] = points[i];
      const [bx, by, bz] = points[j];
      best = Math.min(best, Math.hypot(ax - bx, ay - by, az - bz));
    }
  }
  return best;
}

/**
 * Walk the lifted strand and read off over/under at each crossing, in the order
 * you meet them. Over-under-over-under is the alternating pattern that makes a
 * trefoil; all-over is a descending diagram, which is the unknot.
 */
function overUnderWalk(points, closed) {
  const flat = points.map(([x, y]) => [x, y]);
  const cum = [0];
  const n = closed ? points.length : points.length - 1;
  for (let i = 0; i < n; i++) {
    const a = flat[i];
    const b = flat[(i + 1) % flat.length];
    cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const depthAt = (s) => {
    let i = 0;
    while (i < n - 1 && cum[i + 1] < s) i++;
    const f = (s - cum[i]) / (cum[i + 1] - cum[i] || 1);
    return points[i][2] + f * (points[(i + 1) % points.length][2] - points[i][2]);
  };

  return findSelfCrossings(flat, closed)
    .flatMap((c) => {
      const firstIsOver = depthAt(c.first) > depthAt(c.second);
      return [
        { s: c.first, over: firstIsOver },
        { s: c.second, over: !firstIsOver },
      ];
    })
    .sort((a, b) => a.s - b.s)
    .map((e) => (e.over ? 'O' : 'U'))
    .join('');
}

// --- crossing detection -----------------------------------------------------

const tref = trefoilPath(0, 0, 90);
check(findSelfCrossings(tref, true).length === 3, 'a trefoil projection has 3 self-crossings');
check(findSelfCrossings(circle(), true).length === 0, 'a circle has no self-crossings');

// --- rule 2: no pen lift, later strand on top -------------------------------

const oneStroke = draw([tref], { closed: true });
check(oneStroke.crossings === 3 && oneStroke.under === 0,
  'drawn in one stroke: 3 crossings, none decided by a break',
  `${oneStroke.under}/${oneStroke.crossings}`);

const oneStrokeWalk = overUnderWalk(oneStroke.points, true);
check([...oneStrokeWalk].filter((c) => c === 'O').length === 3,
  'every crossing still got one over and one under', oneStrokeWalk);
check(
  minSelfDistance(oneStroke.points, true, 2 * SEPARATION) > SEPARATION / 2,
  'and the strand never passes through itself',
  `closest approach ${minSelfDistance(oneStroke.points, true, 2 * SEPARATION).toFixed(1)} px`,
);

// --- rule 1: breaks decide, and give a real trefoil --------------------------

const strokes = trefoilStrokes(0, 0, 90);
check(strokes.length === 3, 'the trefoil fixture is three pen-down strokes', `${strokes.length}`);

const trefoil = draw(strokes, { closed: true });
// Two of the three are dives by the stroke that made them; the third is an
// earlier break, passed over by a later stroke. Same answer, other rule.
check(trefoil.crossings === 3 && trefoil.under === 2,
  'the breaks decided all 3 crossings', `${trefoil.under} dived, ${3 - trefoil.under} passed over`);
check(
  overUnderWalk(trefoil.points, true) === 'OUOUOU',
  'walking it gives over, under, over, under — a genuine trefoil',
  overUnderWalk(trefoil.points, true),
);
check(
  minSelfDistance(trefoil.points, true, 2 * SEPARATION) > SEPARATION / 2,
  'and the strand never passes through itself',
  `closest approach ${minSelfDistance(trefoil.points, true, 2 * SEPARATION).toFixed(1)} px`,
);

// --- immutable geometry ------------------------------------------------------

// The whole point of lifting one stroke at a time: what you already drew is
// final. Drawing the first two strokes of the trefoil must give byte-identical
// points to the first two strokes of the finished one.
const partial = draw(strokes.slice(0, 2));
const prefix = trefoil.points.slice(0, partial.points.length);
check(
  JSON.stringify(partial.points) === JSON.stringify(prefix),
  'a later stroke never moves an earlier one',
  `${partial.points.length} points compared`,
);

// --- resuming from a depth ---------------------------------------------------

// Grabbing a handle that sits mid-dive: the new stroke has to start at that
// depth and ease back to the draw plane, not jump.
const resumed = liftStroke(
  [[0, 0], [40, 0], [80, 0], [200, 0]],
  null,
  { separation: SEPARATION, startDepth: -SEPARATION },
);
check(
  Math.abs(resumed.points[0][2] + SEPARATION) < 1e-6,
  'a stroke resumed from a dipped end starts at that depth',
  `${resumed.points[0][2].toFixed(1)}`,
);
check(
  Math.abs(resumed.points[resumed.points.length - 1][2]) < 1e-6,
  'and eases back to the draw plane',
  `${resumed.points[resumed.points.length - 1][2].toFixed(1)}`,
);

// --- already-clear crossings are left alone ----------------------------------

// A stroke crossing something that is already a full separation away in depth
// needs no correction — that is most of a link seen from an angle.
const overFar = liftStroke(
  [[-100, 0], [100, 0]],
  null,
  {
    separation: SEPARATION,
    obstacles: [[[0, -100, 4 * SEPARATION], [0, 100, 4 * SEPARATION]]],
  },
);
check(
  overFar.crossings === 1 && overFar.points.every((p) => p[2] === 0),
  'a crossing that already clears in depth is left flat',
);

// --- rule 1 without a pen lift: holding U -------------------------------------

// A single unbroken stroke that crosses itself. Rule 2 alone sends the *earlier*
// pass under. Marking the later pass instead — which is what holding U does —
// has to override that, with no gap anywhere in the ink.
const figureEight = Array.from({ length: 120 }, (_, i) => {
  const t = (i / 119) * Math.PI * 2;
  const d = 1 + Math.sin(t) ** 2;
  return [(200 * Math.cos(t)) / d, (200 * Math.sin(t) * Math.cos(t)) / d];
});
const [{ first, second }] = findSelfCrossings(figureEight, false);

const plain = liftStroke(figureEight, null, { separation: SEPARATION });
check(
  plain.crossings === 1 && plain.under === 0,
  'unmarked: one crossing, decided by rule 2',
  `${plain.under}/${plain.crossings}`,
);
check(
  overUnderWalk(plain.points, false) === 'UO',
  'and the earlier pass is the one that dives',
  overUnderWalk(plain.points, false),
);

// Mark only the half of the stroke carrying the later pass.
const cum = [0];
for (let i = 1; i < figureEight.length; i++) {
  const [a, b] = [figureEight[i - 1], figureEight[i]];
  cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
}
const held = cum.map((s) => s > (first + second) / 2);

const marked = liftStroke(figureEight, held, { separation: SEPARATION });
check(
  marked.crossings === 1 && marked.under === 1,
  'holding U marks the crossing as decided',
  `${marked.under}/${marked.crossings}`,
);
check(
  overUnderWalk(marked.points, false) === 'OU',
  'and it flips which pass dives — no gap in the ink',
  overUnderWalk(marked.points, false),
);
check(
  Math.min(...marked.points.map((p) => p[2])) < -SEPARATION / 2,
  'the strand really dips, it is not just relabelled',
  `${Math.min(...marked.points.map((p) => p[2])).toFixed(1)}px`,
);

// Marking both passes says nothing, so it must fall back to rule 2 rather than
// sending both under and leaving them at the same depth.
const both = liftStroke(figureEight, figureEight.map(() => true), { separation: SEPARATION });
check(
  overUnderWalk(both.points, false) === 'UO' && both.under === 0,
  'marking both passes says nothing, so rule 2 decides',
  overUnderWalk(both.points, false),
);

// --- a crossing in the middle of a long segment -------------------------------

// Two points is a legal stroke — Shift draws exactly that. If the crossing falls
// between them, the segment still has to be subdivided or the dip never happens.
const straight = liftStroke(
  [[-200, 0], [200, 0]],
  null,
  {
    separation: SEPARATION,
    obstacles: [[[0, -100, 0], [0, 100, 0]]],
  },
);
check(
  straight.crossings === 1 && Math.max(...straight.points.map((p) => p[2])) > SEPARATION / 2,
  'a crossing mid-segment still lifts the stroke',
  `${straight.points.length} points, peak ${Math.max(...straight.points.map((p) => p[2])).toFixed(1)}px`,
);

// --- plain loops are untouched -----------------------------------------------

const flat = draw([circle()], { closed: true });
check(flat.crossings === 0 && flat.points.every((p) => p[2] === 0), 'a plain loop stays flat');
check(fillRun([0, 0], [5, 0], SEPARATION / 2).length === 0, 'a gap too small to be a break is not filled');
check(fillRun([0, 0], [200, 0], SEPARATION / 2).length > 0, 'a real gap is filled');

console.log(failures ? `\n${failures} failing check(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
