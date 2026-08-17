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

/** Draw closes itself when the last stroke ends near where the first began. */
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
await page.screenshot({ path: OUT + '0-help.png' });
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
// 0. The legend and the cursor
// ===========================================================================

const legend = await page.evaluate(() => {
  const rail = document.getElementById('shortcuts');
  return {
    sections: [...rail.querySelectorAll('section')].map((sec) => ({
      title: sec.querySelector('h3').textContent,
      hidden: sec.hidden,
      rows: [...sec.querySelectorAll('.row')].map((r) => [
        r.querySelector('span').textContent,
        r.querySelector('kbd').textContent,
      ]),
    })),
    text: rail.textContent,
  };
});
check(
  legend.sections.map((s) => s.title).join('/') === 'Mode/View/Draw/Erase/Edit',
  'the legend is grouped into sections',
  legend.sections.map((s) => s.title).join('/'),
);
check(
  legend.sections.every((s) => s.rows.every(([action, key]) => action && key)),
  'every row reads action-then-key',
);
check(
  !/right-drag/.test(legend.text) && /drag/.test(legend.text),
  'right-drag is gone from the legend',
);
check(
  legend.sections.find((s) => s.title === 'Draw').hidden &&
    legend.sections.find((s) => s.title === 'Erase').hidden,
  'mode-specific sections are hidden until you are in that mode',
);
check(
  ['S', 'D', 'E'].every((k) => legend.sections[0].rows.some((r) => r[1] === k)),
  'the mode keys are listed',
  JSON.stringify(legend.sections[0].rows),
);

// The bug that wasted an afternoon: a font that silently falls back looks fine
// until you measure it. Same string, two families — if the widths match, the
// webfont never loaded.
const fonts = await page.evaluate(async () => {
  await document.fonts.ready;
  const measure = (family) => {
    const el = document.createElement('span');
    el.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${/px/.test(family) ? family : '13px ' + family}`;
    el.textContent = 'The quick brown fox jumps over the lazy dog';
    document.body.appendChild(el);
    const w = el.getBoundingClientRect().width;
    el.remove();
    return w;
  };
  return {
    files: [...document.fonts].length,
    body: getComputedStyle(document.body).fontFamily,
    // Compare each face against a generic that looks nothing like it: if the
    // webfont failed, the width collapses onto the generic exactly.
    sans: measure("'Overpass', monospace"),
    sansFallback: measure('monospace'),
    mono: measure("'Overpass Mono', serif"),
    monoFallback: measure('serif'),
    // Overpass is variable — one file, every weight. Check the axis actually
    // moves, or 500 and 600 would silently render as 400.
    w400: measure("400 13px 'Overpass', monospace"),
    w600: measure("600 13px 'Overpass', monospace"),
  };
});
check(fonts.files === 2, 'two font faces — one variable sans, one mono', `${fonts.files} faces`);
check(/Overpass/.test(fonts.body), 'the app is set in Overpass', fonts.body);
check(
  Math.abs(fonts.sans - fonts.sansFallback) > 1,
  'Overpass really renders — it is not silently falling back',
  `${fonts.sans.toFixed(1)}px vs ${fonts.sansFallback.toFixed(1)}px if it had failed`,
);
check(
  fonts.w600 > fonts.w400 + 1,
  'the variable weight axis works — 600 is heavier than 400',
  `${fonts.w400.toFixed(1)}px at 400, ${fonts.w600.toFixed(1)}px at 600`,
);
check(
  Math.abs(fonts.mono - fonts.monoFallback) > 1,
  'Overpass Mono really renders too',
  `${fonts.mono.toFixed(1)}px vs ${fonts.monoFallback.toFixed(1)}px if it had failed`,
);

// A swatch that escapes the rail means a cascade collision — the base
// `#toolbar button` rule outranks `.swatch` unless it is scoped away from it.
await page.keyboard.press('d');
await page.waitForTimeout(120);
const swatches = await page.evaluate(() => {
  const rail = document.getElementById('rail').getBoundingClientRect();
  const tool = document.querySelector('[data-tool="draw"]').getBoundingClientRect();
  return ['sw-draw-color', 'sw-draw-size'].map((id) => {
    const b = document.getElementById(id).getBoundingClientRect();
    return {
      id,
      w: Math.round(b.width),
      h: Math.round(b.height),
      square: Math.abs(b.width - b.height) < 1.5,
      matchesButton: Math.abs(b.height - tool.height) < 1.5,
      inside: b.right <= rail.right + 1,
    };
  });
});
// An undefined custom property invalidates the whole declaration, so a ring
// that is meant to mark the current colour can vanish without a peep.
await page.click('#sw-draw-color');
await page.waitForTimeout(200);
const chip = await page.evaluate(() => {
  const on = document.querySelector('.panel.open .chip.on');
  return { found: !!on, ring: on ? getComputedStyle(on).boxShadow : 'none' };
});
check(
  chip.found && chip.ring !== 'none',
  'the current colour is ringed in the picker',
  JSON.stringify(chip),
);
await page.keyboard.press('Escape');

check(
  swatches.every((s) => s.square && s.matchesButton && s.inside),
  'the Draw swatches are square, match the button height, and stay inside the rail',
  JSON.stringify(swatches),
);
check(
  await page.evaluate(() => document.getElementById('sw-erase-size').hidden),
  "and a tool's swatches are hidden while another tool is active",
);
await page.keyboard.press('s');

const cursorNow = () => page.evaluate(() => getComputedStyle(document.getElementById('view')).cursor);
check((await cursorNow()) === 'all-scroll', 'Select shows the orbit cursor', await cursorNow());

await page.keyboard.down('Meta');
await page.waitForTimeout(60);
check((await cursorNow()) === 'grab', 'holding the pan modifier shows the hand', await cursorNow());
await page.keyboard.up('Meta');
await page.waitForTimeout(60);
check((await cursorNow()) === 'all-scroll', 'and it goes back on release', await cursorNow());

await page.keyboard.press('d');
await page.waitForTimeout(60);
check((await cursorNow()) === 'crosshair', 'Draw shows a crosshair', await cursorNow());
check(
  await page.evaluate(() => !document.getElementById('sc-draw').hidden),
  'and the Draw section of the legend appears',
);
// Draw mode is the tallest the rail ever gets; it still has to fit on screen.
const railFit = await page.evaluate(() => {
  const r = document.getElementById('rail').getBoundingClientRect();
  return { bottom: Math.round(r.bottom), viewport: innerHeight };
});
check(railFit.bottom < railFit.viewport, 'the rail fits on screen with every section open',
  `${railFit.bottom}px of ${railFit.viewport}px`);
await page.screenshot({ path: OUT + '0-legend.png', clip: { x: 0, y: 0, width: 200, height: railFit.viewport } });
await page.keyboard.press('s');

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
  await page.evaluate(() => globalThis.knot.viewer.tool === 'select' && !globalThis.knot.viewer.liveId),
  'closing the strand releases it and hands the tool back to Select',
);

await orbit(page, page.viewportSize().height / 4);

// Where the edge-on loop passes through the draw plane, in screen pixels. That
// is what the second loop has to be drawn around, so the test works it out the
// same way your eye does — the app itself no longer marks these.
const pierces = await page.evaluate(() => {
  const { viewer, model } = globalThis.knot;
  const plane = viewer.drawPlaneObject();
  const pts = model.curves[0].points;
  const side = (p) => plane.normal.dot({ x: p[0], y: p[1], z: p[2] }) + plane.constant;

  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const [da, db] = [side(a), side(b)];
    if (da === 0 || (da < 0) === (db < 0)) continue;
    const f = da / (da - db);
    // project() wants a real Vector3; borrow one rather than importing three.js.
    const hit = viewer.controls.target
      .clone()
      .set(a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2]));
    out.push(viewer.project(hit));
  }
  return out;
});
check(pierces.length === 2, 'loop 1 pierces the draw plane twice', `${pierces.length}`);
await page.screenshot({ path: OUT + '1-orbited.png' });

if (pierces.length === 2) await drawStrand(page, [circlePath(pierces[0][0], pierces[0][1], 95)]);
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
  /crossing|loop/.test((await page.textContent('#status')) ?? ''),
  'and it reported back',
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

// Lifting the pen mid-strand should turn what you've drawn into a real tube,
// clear the pencil preview, and leave Draw armed for the next stroke.
await page.keyboard.press('d');
await stroke(page, strokes[0]);
const midStrand = await page.evaluate(() => {
  const { model, viewer } = globalThis.knot;
  return {
    curves: model.curves.length,
    meshes: viewer.meshes.size,
    preview: viewer.preview !== null,
    tool: viewer.tool,
    live: viewer.liveId,
    handles: viewer.handles.length,
    selected: viewer.selection.size,
  };
});
check(
  midStrand.curves === 1 && midStrand.meshes === 1 && !midStrand.preview,
  'lifting the pen materialises the strand-so-far as a tube, not a pencil line',
  JSON.stringify(midStrand),
);
check(midStrand.tool === 'draw' && midStrand.live !== null,
  'and the strand is live, so the next stroke continues it');
check(midStrand.handles === 2 && midStrand.selected === 1,
  'a live strand reads as selected, with a handle on each end');

for (const s of strokes.slice(1)) await stroke(page, s);
await page.waitForTimeout(180);
check((await curveCount(page)) === 1, 'the pen-lifted trefoil made one closed strand');
check(
  await page.evaluate(() => globalThis.knot.model.curves[0]?.closed === true),
  'and the third lift closed it',
);

const statusText = await page.textContent('#status');
check(
  /crossing/.test(statusText ?? '') || /loop/.test(statusText ?? ''),
  'the closing stroke reported back',
  JSON.stringify(statusText),
);

const spread = await page.evaluate(() => {
  const c = globalThis.knot.model.curves[0];
  const plane = globalThis.knot.viewer.drawPlaneObject();
  const depth = c.points.map(([x, y, z]) => plane.normal.dot({ x, y, z }) + plane.constant);
  return Math.max(...depth) - Math.min(...depth);
});

// The hop at a crossing is a fixed clearance, so the whole strand stays close to
// the draw plane however big you drew it — a diagram, not a sculpture.
check(
  spread > 2 * TUBE_RADIUS && spread < 2.4 * (4 * TUBE_RADIUS),
  'the strand stays within a couple of clearances of the draw plane',
  `spread ${spread.toFixed(3)}, clearance ${(4 * TUBE_RADIUS).toFixed(3)}`,
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

await page.keyboard.press('s'); // back to Select
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
// 6. Erase a bite, orbit away, then grab a handle and keep drawing
// ===========================================================================
//
// The scenario the whole design turns on: an old strand with real depth, cut
// open, resumed from a different camera angle. Its existing points must not
// move a millimetre.

await page.keyboard.press('s');
await page.keyboard.press('a');
await page.waitForTimeout(150);

const handles = await page.evaluate(() =>
  globalThis.knot.viewer.handles.map((h) => ({ end: h.end, live: h.live, at: globalThis.knot.viewer.project(h.position) })),
);
check(handles.length === 2, 'the cut strand shows two endpoint handles', `handles=${handles.length}`);
check(
  handles.every((h) => !h.live),
  'neither is emphasised — nothing is live until you grab one',
);

// Pointing at a handle lights it up, so you know it will act.
if (handles.length === 2) {
  await page.mouse.move(handles[0].at[0] + 4, handles[0].at[1] + 4);
  await page.waitForTimeout(80);
}
check(
  await page.evaluate(() => globalThis.knot.viewer.hotHandle !== null),
  'pointing at a handle marks it hot',
);
if (handles.length === 2) {
  const [hx, hy] = handles[0].at;
  await page.screenshot({
    path: OUT + '0-focus-ring.png',
    clip: { x: Math.max(0, hx - 90), y: Math.max(0, hy - 90), width: 180, height: 180 },
  });
}
check(
  await page.evaluate(() => {
    const { viewer } = globalThis.knot;
    const hot = viewer.handles.find((h) => `${h.curveId}:${h.end}` === viewer.hotHandle);
    const ring = viewer._focusRing;
    return ring.visible && ring.position.distanceTo(hot.position) < 1e-6;
  }),
  'and a focus ring closes around that handle',
);
check(
  await page.evaluate(() => {
    const { viewer } = globalThis.knot;
    return viewer.handleGroup.children.every((m) => m.scale.x <= 1.0001);
  }),
  'while the ball itself does not grow',
);

// Move the camera, so resuming has to work off the strand's own geometry.
await orbit(page, 70, 30);

const before = await page.evaluate(() => JSON.stringify(globalThis.knot.model.curves[0].points));
const ends = await page.evaluate(() => {
  const { viewer } = globalThis.knot;
  const at = (end) => {
    const h = viewer.handles.find((x) => x.end === end);
    return h ? viewer.project(h.position) : null;
  };
  return { grab: at('end'), head: at('start') };
});
check(ends.grab !== null, 'the handle is still there after orbiting');

// Head away from the strand's other end, or we'd snap shut into a loop.
if (ends.grab) {
  const [gx, gy] = ends.grab;
  const [hx, hy] = ends.head;
  const len = Math.hypot(gx - hx, gy - hy) || 1;
  const [ux, uy] = [(gx - hx) / len, (gy - hy) / len];
  // The stroke has to begin ON the handle — that grab is what makes it live.
  await stroke(page, [ends.grab, ...[1, 2, 3].map((k) => [gx + ux * 45 * k, gy + uy * 45 * k])]);
}
await page.waitForTimeout(250);

const resumed = await page.evaluate(() => {
  const c = globalThis.knot.model.curves[0];
  return { n: c.points.length, points: JSON.stringify(c.points), closed: c.closed, live: globalThis.knot.viewer.liveId, tool: globalThis.knot.viewer.tool, curves: globalThis.knot.model.curves.length };
});
const kept = JSON.parse(before);
check(
  resumed.n > kept.length &&
    JSON.stringify(JSON.parse(resumed.points).slice(0, kept.length)) === before,
  'grabbing a handle continued the strand and left every old point untouched',
  `${kept.length} -> ${resumed.n} points`,
);
check(resumed.curves === 1, 'and did not make a new curve');
check(resumed.live !== null, 'the strand is live, so you can keep going',
  `closed=${resumed.closed} live=${resumed.live} tool=${resumed.tool}`);

await page.screenshot({ path: OUT + '4-resumed.png' });

// ===========================================================================
// 7. Colour and thickness
// ===========================================================================

await page.evaluate(() => {
  globalThis.knot.model.clear();
  globalThis.knot.refresh();
});
await drawStrand(page, [circlePath(640, 400, 150)]);
await drawStrand(page, [circlePath(640, 400, 90)]);

const drawn = await page.evaluate(() => globalThis.knot.model.curves.map((c) => c.color));
check(drawn[0] !== drawn[1], 'each new strand takes the next preset colour', JSON.stringify(drawn));
check(
  await page.evaluate(() => globalThis.knot.model.curves.every((c) => c.radius > 0)),
  'and carries its own tube radius',
);

// Recolour a selection from the panel.
await page.keyboard.press('s');
await page.keyboard.press('a');
await page.waitForTimeout(200);
await page.click('#sw-sel-color');
await page.waitForTimeout(200);
const target = await page.evaluate(() => {
  const chips = [...document.querySelectorAll('.panel.open .chip')];
  return chips[chips.length - 1].dataset.color;
});
await page.click(`.panel.open .chip[data-color="${target}"]`);
await page.waitForTimeout(250);
check(
  await page.evaluate((c) => globalThis.knot.model.curves.every((x) => x.color === c), target),
  'picking a preset recolours every selected strand',
  target,
);

await page.keyboard.press('Control+z');
await page.waitForTimeout(200);
check(
  await page.evaluate((c) => globalThis.knot.model.curves.some((x) => x.color !== c), target),
  'and the recolour is undoable',
);

// Thicken a selection from the slider.
await page.keyboard.press('a');
await page.waitForTimeout(150);
await page.click('#sw-sel-size');
await page.waitForTimeout(200);
const thicker = await page.evaluate(() => {
  const input = document.querySelector('.panel.open input[type=range]');
  input.value = input.max;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return globalThis.knot.model.curves.map((c) => c.radius);
});
await page.waitForTimeout(250);
check(
  thicker.every((r) => r > 0.075),
  'the size slider thickens every selected strand',
  JSON.stringify(thicker.map((r) => r.toFixed(3))),
);
check(
  await page.evaluate(() => {
    const c = globalThis.knot.model.curves[0];
    const mesh = globalThis.knot.viewer.meshes.get(c.id);
    return mesh && mesh.userData.stamp.includes(String(c.radius));
  }),
  'and the tube mesh was rebuilt at the new radius',
);

await page.keyboard.press('Escape');
await page.evaluate(() => {
  globalThis.knot.model.clear();
  globalThis.knot.refresh();
});

// ===========================================================================
// 8. Holding U goes under without lifting the pen
// ===========================================================================
//
// One scalar decides it: a stroke crossing an existing flat strand goes over by
// rule 2 (depth above the draw plane) and under when marked (depth below).

// Slanted, and deliberately not symmetric: a crossing that lands exactly on a
// shared vertex of both polylines is rejected by design, since an intersection
// at a segment endpoint would otherwise be counted twice.
const across = [
  [600, 300],
  [625, 355],
  [650, 410],
  [675, 465],
  [700, 520],
];
const along = [
  [500, 400],
  [650, 400],
  [800, 400],
];

/** Depth of the most recent strand, in pixels; positive is toward the viewer. */
const lastDepths = (page) =>
  page.evaluate(() => {
    const { model, viewer } = globalThis.knot;
    const c = model.curves[model.curves.length - 1];
    const v = viewer.controls.target.clone();
    return c.points.map((p) => viewer.depthOf(v.set(p[0], p[1], p[2])));
  });

await page.evaluate(() => {
  globalThis.knot.model.clear();
  globalThis.knot.refresh();
});
await drawStrand(page, [along]);
await drawStrand(page, [across]);
const over = await lastDepths(page);
check(
  Math.max(...over) > 1 && Math.min(...over) > -1,
  'pen down, the crossing stroke passes over',
  `depth ${Math.min(...over).toFixed(1)} .. ${Math.max(...over).toFixed(1)}px`,
);

await page.evaluate(() => {
  globalThis.knot.model.clear();
  globalThis.knot.refresh();
});
await drawStrand(page, [along]);
await page.keyboard.press('d');
await page.keyboard.down('u');
await stroke(page, across);
await page.keyboard.up('u');
await page.waitForTimeout(250);
const under = await lastDepths(page);
check(
  Math.min(...under) < -1 && Math.max(...under) < 1,
  'holding U, the same stroke passes under instead',
  `depth ${Math.min(...under).toFixed(1)} .. ${Math.max(...under).toFixed(1)}px`,
);
check(
  await page.evaluate(() => globalThis.knot.model.curves.length === 2),
  'and it is still one unbroken strand — no pen lift involved',
);

await page.evaluate(() => {
  globalThis.knot.model.clear();
  globalThis.knot.refresh();
});

// ===========================================================================
// 9. Shift draws a straight line
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
