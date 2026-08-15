// Unit tests for the flat-drawing -> 3D-knot lift. No browser needed.

import { assignAlternating, findSelfCrossings, liftStroke } from '../src/crossings.js';
import { simplifyStroke } from '../src/simplify.js';

let failures = 0;
function check(ok, label, detail = '') {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

/** Standard 3-crossing trefoil projection. */
function trefoil(n = 200, scale = 90, cx = 0, cy = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push([
      cx + scale * (Math.sin(t) + 2 * Math.sin(2 * t)),
      cy + scale * (Math.cos(t) - 2 * Math.cos(2 * t)),
    ]);
  }
  return pts;
}

function circle(n = 64, r = 150) {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return [r * Math.cos(t), r * Math.sin(t)];
  });
}

// --- crossing detection -----------------------------------------------------

const tref = trefoil();
const crossings = findSelfCrossings(tref, true);
check(crossings.length === 3, 'trefoil projection has 3 self-crossings', `found ${crossings.length}`);

check(findSelfCrossings(circle(), true).length === 0, 'a circle has no self-crossings');

// A figure eight drawn as a lemniscate: exactly one crossing.
const lemniscate = Array.from({ length: 200 }, (_, i) => {
  const t = (i / 200) * Math.PI * 2;
  const d = 1 + Math.sin(t) ** 2;
  return [(200 * Math.cos(t)) / d, (200 * Math.sin(t) * Math.cos(t)) / d];
});
check(
  findSelfCrossings(lemniscate, true).length === 1,
  'a lemniscate has 1 self-crossing',
  `found ${findSelfCrossings(lemniscate, true).length}`,
);

// --- alternating assignment -------------------------------------------------

// The whole scheme rests on this: walking the curve and alternating over/under
// must give each crossing one of each. It holds for any closed plane curve
// because the two visits to a crossing always land on opposite parities.
const encounters = assignAlternating(crossings);
check(encounters.length === 6, 'three crossings give six encounters');

const byId = new Map();
let parityConsistent = true;
encounters.forEach((e, i) => {
  if (byId.has(e.id)) {
    if (i % 2 === byId.get(e.id) % 2) parityConsistent = false;
  } else {
    byId.set(e.id, i);
  }
});
check(parityConsistent, 'the two visits to each crossing have opposite parity');

const signs = new Map();
let balanced = true;
for (const e of encounters) {
  if (signs.has(e.id) && signs.get(e.id) === e.sign) balanced = false;
  signs.set(e.id, e.sign);
}
check(balanced, 'every crossing gets exactly one over and one under');

// --- the lift ---------------------------------------------------------------

// Lift what the app actually lifts: an RDP-simplified stroke, not the dense
// mouse trace.
const drawn = simplifyStroke(tref, 6, 8);
check(
  findSelfCrossings(drawn, true).length === 3,
  'simplification preserves the 3 crossings',
  `${tref.length} -> ${drawn.length} points`,
);

const lifted = liftStroke(drawn, true, { height: 40 });
check(lifted.crossings === 3, 'lift reports 3 crossings');

const depths = lifted.points.map((p) => p[2]);
const lo = Math.min(...depths);
const hi = Math.max(...depths);
check(hi > 30 && lo < -30, 'strands are pushed both toward and away from the viewer',
  `depth range ${lo.toFixed(1)} .. ${hi.toFixed(1)}`);

check(
  lifted.points.length > drawn.length,
  'points were inserted near crossings so the spline can follow the lift',
  `${drawn.length} -> ${lifted.points.length}`,
);

// Wherever two strands overlap in the plane they must be separated in depth,
// otherwise the "knot" still self-intersects and none of this bought anything.
let minGap = Infinity;
for (let i = 0; i < lifted.points.length; i++) {
  for (let j = i + 2; j < lifted.points.length; j++) {
    const [ax, ay, az] = lifted.points[i];
    const [bx, by, bz] = lifted.points[j];
    if (Math.hypot(ax - bx, ay - by) > 6) continue; // not near each other in plane
    minGap = Math.min(minGap, Math.abs(az - bz));
  }
}
check(
  minGap === Infinity || minGap > 20,
  'strands that overlap in the plane are separated in depth',
  `min gap ${minGap === Infinity ? 'n/a' : minGap.toFixed(1)}`,
);

// A stroke with no crossings must come out perfectly flat, so the Hopf-link
// workflow of drawing plain loops on planes is untouched.
const flat = liftStroke(circle(), true, { height: 40 });
check(
  flat.crossings === 0 && flat.points.every((p) => p[2] === 0),
  'a plain loop stays flat',
);

console.log(failures ? `\n${failures} failing check(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
