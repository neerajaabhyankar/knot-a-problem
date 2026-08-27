// Printing a projection as a knot diagram.
//
// The claim that matters is the convention itself: the strand that goes
// underneath is broken, the one that goes over is not. Everything else here is
// arithmetic in support of that.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { choose, project } from '../../knotlib/index.js';
import { parse } from '../src/io.js';
import { toSVG } from '../src/diagram2d.js';

let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const refuses = (fn, label) => {
  try {
    fn();
    check(false, label, 'it was accepted');
  } catch (e) {
    check(e instanceof Error && e.message.length > 8, label, JSON.stringify(e.message));
  }
};

const LIB = join(dirname(fileURLToPath(import.meta.url)), '../src/library');
const load = async (name) => parse(await readFile(join(LIB, `${name}.knot.json`), 'utf8'));

/** Every point the SVG actually draws, with y put back the way in came in. */
const drawn = (svg) =>
  [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) =>
    m[1]
      .split('M')
      .slice(1)
      .map((sub) =>
        sub
          .replace(/Z$/, '')
          .split('L')
          .map((p) => p.split(',').map(Number))
          .map(([x, y]) => [x, -y]),
      ),
  );

const polylineLength = (pts, closed) => {
  let s = 0;
  for (let i = 0; i < (closed ? pts.length : pts.length - 1); i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return s;
};
const nearest = (subpaths, at) =>
  Math.min(...subpaths.flat().map((p) => Math.hypot(p[0] - at[0], p[1] - at[1])));
/**
 * How far the middle of the nearest pair of loose ends sits from a point. A
 * break leaves two ends straddling the crossing, so this is ~0 there and large
 * anywhere else. Loose ends rather than distance-to-ink, because at a
 * self-crossing the over-pass's ink lies right across the gap.
 */
function breakOffset(subpaths, at) {
  const ends = subpaths.flatMap((s) => [s[0], s[s.length - 1]]);
  let best = Infinity;
  // The best *pair*, not the two nearest ends: where two crossings sit close
  // together the nearest two ends can belong to different breaks.
  for (let i = 0; i < ends.length; i++) {
    for (let j = i + 1; j < ends.length; j++) {
      const [a, b] = [ends[i], ends[j]];
      best = Math.min(best, Math.hypot((a[0] + b[0]) / 2 - at[0], (a[1] + b[1]) / 2 - at[1]));
    }
  }
  return best;
}

// --- the convention -------------------------------------------------------------

for (const name of ['trefoil', 'hopf-link', 'figure-eight', 'borromean', 'solomon']) {
  const scene = await load(name);
  const { diagram, layout } = choose(scene.curves, { samples: 96 });
  const svg = toSVG(scene.curves, layout);
  const paths = drawn(svg);

  // At every crossing: the under-strand stops short on both sides, and the
  // over-strand's ink runs straight through. Counting loose ends rather than
  // measuring distance, because at a self-crossing both passes belong to the
  // same path and the over-pass's ink sits right on top of the gap.
  const width = 2 * scene.curves[0].radius;
  let broken = 0;
  let solid = 0;
  for (const x of layout.crossings) {
    if (breakOffset(paths[x.under.component], x.at) < width * 0.5) broken++;
    if (nearest(paths[x.over.component], x.at) < width * 0.5) solid++;
  }
  check(
    broken === diagram.n && solid === diagram.n,
    `${name}: every under-strand is broken and every over-strand is not`,
    `${broken}/${diagram.n} broken, ${solid}/${diagram.n} solid`,
  );

  // And no more ink is removed than the breaks account for.
  const kept = paths.map((subs) => subs.reduce((t, s) => t + polylineLength(s, false), 0));
  const full = layout.components.map((c) => polylineLength(c, true));
  const cuts = layout.components.map((_, i) => layout.crossings.filter((x) => x.under.component === i).length);
  const ok = kept.every((k, i) => {
    const most = cuts[i] * 8 * width; // a break is at most 4 stroke widths either side
    return k <= full[i] + 1e-6 && k >= full[i] - most - 1e-6;
  });
  check(ok, `${name}: no more ink is missing than the breaks account for`, kept.map((k, i) => `${((k / full[i]) * 100).toFixed(0)}% drawn`).join(' '));

  const subs = paths.map((p) => p.length);
  check(
    subs.every((s, i) => s === Math.max(1, cuts[i])),
    `${name}: one subpath per break`,
    subs.map((s, i) => `${s}/${cuts[i]}`).join(' '),
  );
}

// --- a component with nothing crossing it ----------------------------------------

const circle = await load('circle');
const flat = project(circle.curves, [0, 0, 1]);
const closedSvg = toSVG(circle.curves, flat.layout);
check(/ d="M[^"]*Z"/.test(closedSvg), 'a strand nothing crosses is drawn as one closed loop');
check(flat.diagram.n === 0 && drawn(closedSvg).length === 1, 'with no breaks in it');

// --- orientation -----------------------------------------------------------------
//
// SVG counts y downwards and the projection frame counts it upwards. Getting
// that wrong draws the mirror image, which is a different knot and would be
// invisible in every other check here.

const tre = await load('trefoil');
const view = project(tre.curves, [0.02, 0, 1]);
// Read the file's own numbers, not the un-negated ones. SVG counts y
// downwards, so the projection's LOWEST point has to come out as the file's
// LARGEST y — at the same x. Comparing ranges instead would pass either way
// round on a symmetric shape, which is exactly how a mirrored diagram slips
// through.
const rawPts = [...toSVG(tre.curves, view.layout).matchAll(/(-?[\d.]+),(-?[\d.]+)/g)]
  .map((m) => [Number(m[1]), Number(m[2])])
  .slice(2); // past the viewBox and the page rect
const bottom = view.layout.components.flat().reduce((a, p) => (p[1] < a[1] ? p : a));
const lowestOnPage = rawPts.reduce((a, p) => (p[1] > a[1] ? p : a));
check(
  Math.abs(lowestOnPage[0] - bottom[0]) < 0.05 && Math.abs(lowestOnPage[1] + bottom[1]) < 0.05,
  'y is negated on the way out, so the printed diagram is the knot and not its mirror',
  `projection's lowest point (${bottom.map((v) => v.toFixed(2))}) is the file's largest y (${lowestOnPage.map((v) => v.toFixed(2))})`,
);

// --- the page --------------------------------------------------------------------

const svg = toSVG(tre.curves, view.layout, { background: '#123456', title: 'a & b <c>' });
const box = svg.match(/viewBox="([-\d. ]+)"/)[1].split(' ').map(Number);
const pts = view.layout.components.flat();
check(
  pts.every((p) => p[0] > box[0] && p[0] < box[0] + box[2] && -p[1] > box[1] && -p[1] < box[1] + box[3]),
  'the viewBox contains every point, with room for the stroke',
);
check(svg.includes('fill="#123456"'), 'the page colour is the one asked for');
const titled = svg.match(/<title>(.*)<\/title>/)[1];
check(
  !/[<>]/.test(titled) && !/&(?!(amp|lt|gt);)/.test(titled),
  'and a title with markup in it is escaped rather than able to break the file',
  JSON.stringify(titled),
);
check(svg.includes('stroke-linecap="round"'), 'ends are rounded, so a break reads as a break and not as a cut');
check(
  svg.includes(`stroke="${tre.curves[0].color}"`),
  'strands keep the colour they have in the editor',
  tre.curves[0].color,
);

refuses(() => toSVG([], { components: [], crossings: [] }), 'an empty scene is refused');

console.log(failures ? `\ndiagram2d.test: ${failures} failing check(s)` : '\ndiagram2d.test: all checks passed');
process.exit(failures ? 1 : 0);
