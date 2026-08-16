// Unit tests for the flat-drawing -> 3D-knot lift. No browser needed.

import { assembleStrokes, findSelfCrossings, liftPath } from '../src/crossings.js';
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
check(
  findSelfCrossings(tref, true).length === 3,
  'a trefoil projection has 3 self-crossings',
  `found ${findSelfCrossings(tref, true).length}`,
);
check(findSelfCrossings(circle(), true).length === 0, 'a circle has no self-crossings');

// --- rule 2: no pen lift, later strand on top -------------------------------

const oneStroke = liftPath(tref, null, true, { separation: SEPARATION });
check(oneStroke.crossings === 3 && oneStroke.broken === 0,
  'drawn in one stroke: 3 crossings, none decided by a break');
const oneStrokeWalk = overUnderWalk(oneStroke.points, true);
check(
  [...oneStrokeWalk].filter((c) => c === 'O').length === 3,
  'every crossing still got one over and one under',
  oneStrokeWalk,
);
check(
  minSelfDistance(oneStroke.points, true, 2 * SEPARATION) > SEPARATION / 2,
  'and the strand never passes through itself',
  `closest approach ${minSelfDistance(oneStroke.points, true, 2 * SEPARATION).toFixed(1)} px`,
);

// --- rule 1: breaks decide, and give a real trefoil --------------------------

const strokes = trefoilStrokes(0, 0, 90);
check(strokes.length === 3, 'the trefoil fixture is three pen-down strokes', `${strokes.length}`);

const { pts, isBridge } = assembleStrokes(strokes, { closed: true, minGap: SEPARATION / 2 });
check(
  isBridge.filter((b, i) => b && !isBridge[i - 1]).length === 3,
  'assembling them leaves three pen-up gaps, the last one closing the loop',
);

const lifted = liftPath(pts, isBridge, true, { separation: SEPARATION });
check(lifted.crossings === 3 && lifted.broken === 3,
  'all 3 crossings were decided by the breaks', `${lifted.broken}/${lifted.crossings}`);
check(
  overUnderWalk(lifted.points, true) === 'OUOUOU',
  'walking it gives over, under, over, under — a genuine trefoil',
  overUnderWalk(lifted.points, true),
);
check(
  minSelfDistance(lifted.points, true, 2 * SEPARATION) > SEPARATION / 2,
  'and the strand never passes through itself',
  `closest approach ${minSelfDistance(lifted.points, true, 2 * SEPARATION).toFixed(1)} px`,
);

const depths = lifted.points.map((p) => p[2]);
check(
  Math.max(...depths) === 0 && Math.abs(Math.min(...depths) + SEPARATION) < 1,
  'the dives go one separation below the flat drawing, and nothing rises above it',
  `${Math.min(...depths).toFixed(1)} .. ${Math.max(...depths).toFixed(1)}`,
);

// --- plain loops are untouched ----------------------------------------------

const flat = liftPath(circle(), null, true, { separation: SEPARATION });
check(flat.crossings === 0 && flat.points.every((p) => p[2] === 0), 'a plain loop stays flat');

const wobble = assembleStrokes([circle()], { closed: true, minGap: SEPARATION / 2 });
check(wobble.isBridge.every((b) => !b), 'closing a single continuous loop makes no bridge');

console.log(failures ? `\n${failures} failing check(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
