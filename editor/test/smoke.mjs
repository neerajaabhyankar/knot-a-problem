// End-to-end: drive the editor in Firefox the way a user would.
//
//   npm run dev          (in another shell)
//   node test/smoke.mjs
//
// Writes screenshots to test/out/.

import { firefox } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { trefoilPath, trefoilStrokes } from './trefoil.mjs';

const APP_URL = process.env.URL ?? 'http://localhost:5173/';
const OUT = new URL('./out/', import.meta.url).pathname;
const TUBE_RADIUS = 0.075;

const problems = [];
function check(ok, label, detail = '') {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(label);
}

// ---------- input helpers ----------

async function stroke(page, path, { shift = false } = {}) {
  await page.mouse.move(...path[0]);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.down();
  for (const p of path.slice(1)) await page.mouse.move(...p);
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
  await page.waitForTimeout(90);
}

/** Draw closes itself when the last stroke ends where the first began. */
async function drawStrand(page, strokes) {
  await page.keyboard.press('d');
  for (const s of strokes) await stroke(page, s);
  await page.waitForTimeout(180);
}

/** Left-drag orbits. */
async function orbit(page, dx, dy = 0) {
  const { width, height } = page.viewportSize();
  await page.mouse.move(width / 2, height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(width / 2 + (dx * i) / 20, height / 2 + (dy * i) / 20);
  }
  await page.mouse.up();
  await page.waitForTimeout(400); // let damping settle
}

const curveCount = (page) => page.evaluate(() => globalThis.knot.model.curves.length);

/**
 * Closest the first curve comes to itself, in world units. Points that are
 * neighbours *along* the curve are excluded — a tight bend is the tube curving,
 * not two strands meeting — so anything under a tube diameter is a real
 * self-intersection.
 */
const selfDistance = (page) =>
  page.evaluate(() => {
    const c = globalThis.knot.model.curves[0];
    const n = 500;
    const pts = Array.from({ length: n }, (_, i) => {
      const t = (i / n) * c.points.length;
      const a = c.points[Math.floor(t) % c.points.length];
      const b = c.points[(Math.floor(t) + 1) % c.points.length];
      const f = t - Math.floor(t);
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    });

    const cum = [0];
    for (let i = 1; i <= n; i++) {
      const a = pts[i - 1];
      const b = pts[i % n];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    }
    const EXCLUDE = 0.45; // world units of arclength — six tube radii

    let best = Infinity;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const along = cum[j] - cum[i];
        if (Math.min(along, cum[n] - along) < EXCLUDE) continue;
        best = Math.min(
          best,
          Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1], pts[i][2] - pts[j][2]),
        );
      }
    }
    return best;
  });

// ---------- shapes ----------

const circlePath = (cx, cy, r, steps = 64) =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const t = (i / steps) * Math.PI * 2;
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
  });

// ---------- run ----------

await mkdir(OUT, { recursive: true });

const browser = await firefox.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(APP_URL, { waitUntil: 'networkidle' });
await page.click('#help-close');
await page.waitForTimeout(300);

check(
  await page.evaluate(() => !!globalThis.knot && !!globalThis.knot.viewer.renderer),
  'app booted, WebGL context created',
);
check(
  await page.evaluate(() => globalThis.knot.viewer.tool === 'select'),
  'starts in Select mode',
);

// ===========================================================================
// 1. Hopf link — two plain loops on perpendicular planes
// ===========================================================================

await drawStrand(page, [circlePath(640, 400, 170)]);
check((await curveCount(page)) === 1, 'first strand made one curve');
check(
  await page.evaluate(() => globalThis.knot.model.curves[0].closed),
  'ending back at the start closed the loop',
);
check(
  await page.evaluate(() => globalThis.knot.viewer.tool === 'select'),
  'closing the strand hands the tool back to Select',
);

await orbit(page, page.viewportSize().height / 4);

// Pierce dots only exist while the pen is armed.
check(
  await page.evaluate(() => globalThis.knot.viewer.pierceGroup.visible === false),
  'no pink dots cluttering the view in Select mode',
);

const dots = await page.evaluate(() => {
  const { viewer, model } = globalThis.knot;
  viewer.setTool('draw');
  viewer.updatePierceMarkers(model);
  const out = viewer.pierceGroup.children
    .filter((d) => d.visible)
    .map((d) => viewer.project(d.position));
  viewer.setTool('select');
  viewer.updatePierceMarkers(model);
  return out;
});
check(dots.length === 2, 'loop 1 pierces the draw plane twice', `dots=${dots.length}`);
await page.screenshot({ path: OUT + '1-orbited.png' });

if (dots.length === 2) await drawStrand(page, [circlePath(dots[0][0], dots[0][1], 95)]);
check((await curveCount(page)) === 2, 'second strand made a second curve');

const lk = await page.evaluate(() => {
  const { model } = globalThis.knot;
  if (model.curves.length < 2) return null;
  const sample = (c) => {
    const p = c.points;
    return Array.from({ length: 240 }, (_, i) => {
      const t = (i / 240) * p.length;
      const a = p[Math.floor(t) % p.length];
      const b = p[(Math.floor(t) + 1) % p.length];
      const f = t - Math.floor(t);
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    });
  };
  const A = sample(model.curves[0]);
  const B = sample(model.curves[1]);
  let sum = 0;
  for (let i = 0; i < A.length; i++) {
    const a0 = A[i], a1 = A[(i + 1) % A.length];
    const da = [a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]];
    const am = [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2, (a0[2] + a1[2]) / 2];
    for (let j = 0; j < B.length; j++) {
      const b0 = B[j], b1 = B[(j + 1) % B.length];
      const db = [b1[0] - b0[0], b1[1] - b0[1], b1[2] - b0[2]];
      const bm = [(b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2, (b0[2] + b1[2]) / 2];
      const r = [am[0] - bm[0], am[1] - bm[1], am[2] - bm[2]];
      const d = Math.hypot(...r);
      if (d < 1e-9) continue;
      const c = [
        da[1] * db[2] - da[2] * db[1],
        da[2] * db[0] - da[0] * db[2],
        da[0] * db[1] - da[1] * db[0],
      ];
      sum += (r[0] * c[0] + r[1] * c[1] + r[2] * c[2]) / (d * d * d);
    }
  }
  return sum / (4 * Math.PI);
});
check(
  lk !== null && Math.abs(Math.abs(lk) - 1) < 0.12,
  'linking number is ±1 (a Hopf link)',
  `Lk = ${lk === null ? 'n/a' : lk.toFixed(3)}`,
);

await orbit(page, -140, 90);
await page.screenshot({ path: OUT + '2-hopf-link.png' });

// ===========================================================================
// 2. Undo / redo
// ===========================================================================

await page.keyboard.press('Control+z');
await page.waitForTimeout(200);
check((await curveCount(page)) === 1, 'undo removes the second loop');

await page.keyboard.press('Control+z');
await page.waitForTimeout(200);
check((await curveCount(page)) === 0, 'undo again removes the first');

await page.keyboard.press('Control+Shift+z');
await page.waitForTimeout(200);
check((await curveCount(page)) === 1, 'redo brings one back');

await page.keyboard.press('Control+Shift+z');
await page.waitForTimeout(200);
check((await curveCount(page)) === 2, 'redo brings the other back');

// ===========================================================================
// 3. Multi-select and the delete confirmation
// ===========================================================================

await page.keyboard.press('a');
check(
  await page.evaluate(() => globalThis.knot.viewer.selection.size === 2),
  'select-all picks up both curves',
);

await page.keyboard.press('Delete');
await page.waitForTimeout(200);
const confirmText = await page.textContent('#confirm-text');
check(/2/.test(confirmText ?? ''), 'bulk delete asks first, with the count', JSON.stringify(confirmText));

await page.click('#confirm-no');
await page.waitForTimeout(150);
check((await curveCount(page)) === 2, 'cancelling keeps the curves');

await page.keyboard.press('Delete');
await page.waitForTimeout(200);
await page.click('#confirm-yes');
await page.waitForTimeout(250);
check((await curveCount(page)) === 0, 'confirming deletes them');

await page.keyboard.press('Control+z');
await page.waitForTimeout(200);
check((await curveCount(page)) === 2, 'delete is undoable');

await page.evaluate(() => {
  globalThis.knot.model.clear();
  globalThis.knot.refresh();
});

// ===========================================================================
// 4. Pen lifts decide over and under
// ===========================================================================

// First without lifting the pen at all: rule 2 has to keep the geometry valid.
await drawStrand(page, [[...trefoilPath(640, 400, 78), trefoilPath(640, 400, 78)[0]]]);
check((await curveCount(page)) === 1, 'a trefoil shape drawn in one stroke still makes a curve');
check(
  /3 crossing/.test((await page.textContent('#status')) ?? ''),
  'and its 3 crossings were all decided',
  JSON.stringify(await page.textContent('#status')),
);
check(
  (await selfDistance(page)) > 2 * TUBE_RADIUS,
  'nothing intersects — the later strand simply passed over',
  `min separation ${(await selfDistance(page)).toFixed(3)}`,
);

await page.evaluate(() => {
  globalThis.knot.model.clear();
  globalThis.knot.refresh();
});

// Now with three breaks, which is what actually makes it a trefoil.
const strokes = trefoilStrokes(640, 400, 78);
check(strokes.length === 3, 'a trefoil is three strokes and three pen lifts',
  `${strokes.length} strokes`);

await drawStrand(page, strokes);
check((await curveCount(page)) === 1, 'the pen-lifted trefoil made one closed strand');
check(
  await page.evaluate(() => globalThis.knot.model.curves[0]?.closed === true),
  'and the third lift closed it',
);

const statusText = await page.textContent('#status');
check(
  /3 crossings, all from your breaks/.test(statusText ?? ''),
  'all 3 crossings were decided by the pen lifts, none by the default',
  JSON.stringify(statusText),
);

const spread = await page.evaluate(() => {
  const c = globalThis.knot.model.curves[0];
  const plane = globalThis.knot.viewer.drawPlaneObject();
  const depth = c.points.map(([x, y, z]) => plane.normal.dot({ x, y, z }) + plane.constant);
  return Math.max(...depth) - Math.min(...depth);
});

// Clearance is fixed at two tube diameters, whatever the drawing's size.
check(
  Math.abs(spread - 4 * TUBE_RADIUS) < 0.09,
  'strands part by the built-in clearance, not by drawing size',
  `spread ${spread.toFixed(3)}, expected ${(4 * TUBE_RADIUS).toFixed(3)}`,
);
check(
  (await selfDistance(page)) > 2 * TUBE_RADIUS,
  'the tubes do not intersect',
  `min separation ${(await selfDistance(page)).toFixed(3)} vs tube diameter ${(2 * TUBE_RADIUS).toFixed(3)}`,
);

await orbit(page, 150, 55);
await page.screenshot({ path: OUT + '3-trefoil-pen-lifts.png' });

// ===========================================================================
// 5. Eraser only touches the selection
// ===========================================================================

await page.evaluate(() => {
  globalThis.knot.model.clear();
  globalThis.knot.refresh();
});
await drawStrand(page, [circlePath(640, 400, 170)]);
await page.keyboard.press('Escape'); // clear selection
await page.keyboard.press('e');

await stroke(page, [
  [810, 380],
  [810, 400],
  [810, 420],
]);
check(
  await page.evaluate(() => globalThis.knot.model.curves[0]?.closed === true),
  'with nothing selected the eraser does nothing',
);

await page.keyboard.press('2'); // back to Select
await page.keyboard.press('a');
await page.keyboard.press('e');
await stroke(page, [
  [810, 380],
  [810, 400],
  [810, 420],
]);
await page.waitForTimeout(300);

const erased = await page.evaluate(() => {
  const cs = globalThis.knot.model.curves;
  return { n: cs.length, closed: cs.map((c) => c.closed) };
});
check(erased.n === 1 && erased.closed[0] === false, 'erasing a selected loop leaves an open arc',
  JSON.stringify(erased));

// ===========================================================================
// 6. Grab an end and keep drawing
// ===========================================================================

await page.keyboard.press('2');
await page.keyboard.press('a');
await page.waitForTimeout(150);

const handles = await page.evaluate(() => {
  const { viewer } = globalThis.knot;
  return viewer.handles.map((h) => viewer.project(h.position));
});
check(handles.length === 2, 'the open arc shows two endpoint handles', `handles=${handles.length}`);

const before = await page.evaluate(() => globalThis.knot.model.curves[0].points.length);
if (handles.length === 2) {
  const [hx, hy] = handles[0];
  await stroke(page, [
    [hx, hy],
    [hx + 40, hy + 40],
    [hx + 80, hy + 70],
    [hx + 120, hy + 80],
  ]);
}
await page.waitForTimeout(250);
const after = await page.evaluate(() => globalThis.knot.model.curves[0].points.length);
check(after > before, 'dragging an end continued the same strand', `${before} -> ${after} points`);
check((await curveCount(page)) === 1, 'and did not make a new one');

await page.screenshot({ path: OUT + '4-extended.png' });

// ===========================================================================
// 7. Shift draws a straight line
// ===========================================================================

await page.evaluate(() => {
  globalThis.knot.model.clear();
  globalThis.knot.refresh();
});
await page.keyboard.press('d');
await stroke(page, [
  [400, 300],
  [500, 380],
  [640, 500],
], { shift: true });
await page.keyboard.press('Enter');
await page.waitForTimeout(250);

const straight = await page.evaluate(() => {
  const c = globalThis.knot.model.curves[0];
  if (!c) return null;
  const p = c.points;
  const a = p[0];
  const b = p[p.length - 1];
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...ab);
  // Largest deviation of any control point from the straight chord.
  let worst = 0;
  for (const q of p) {
    const aq = [q[0] - a[0], q[1] - a[1], q[2] - a[2]];
    const cr = [
      aq[1] * ab[2] - aq[2] * ab[1],
      aq[2] * ab[0] - aq[0] * ab[2],
      aq[0] * ab[1] - aq[1] * ab[0],
    ];
    worst = Math.max(worst, Math.hypot(...cr) / len);
  }
  return { closed: c.closed, worst, len };
});
check(straight !== null, 'Shift-drag made a curve');
check(
  straight && !straight.closed && straight.worst < 1e-6,
  'Shift-drag is dead straight',
  straight ? `max deviation ${straight.worst.toExponential(1)} over ${straight.len.toFixed(2)}` : '',
);

check(errors.length === 0, 'no console or page errors', errors.slice(0, 3).join(' | '));

await browser.close();

console.log(problems.length ? `\n${problems.length} failing check(s)` : '\nall checks passed');
process.exit(problems.length ? 1 : 0);
