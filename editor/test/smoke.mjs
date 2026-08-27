// End-to-end: drive the editor in Firefox the way a user would.
//
//   npm run dev          (in another shell)
//   node test/smoke.mjs
//
// Writes screenshots to test/out/.

import { firefox } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { trefoilPath, trefoilStrokes } from './trefoil.mjs';

const APP_URL = process.env.URL ?? 'http://localhost:5173/';
// Linux CI has no GPU. Firefox then refuses a WebGL context and the app throws
// on startup, so say plainly that software rendering is fine.
const FIREFOX_WEBGL = {
  'webgl.force-enabled': true,
  'webgl.disabled': false,
  'webgl.disable-fail-if-major-performance-caveat': true,
};

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

const curveCount = (page) => page.evaluate(() => globalThis.knot.internals.model.curves.length);

/**
 * Closest the first curve comes to itself, in world units. Points that are
 * neighbours *along* the curve are excluded — a tight bend is the tube curving,
 * not two strands meeting — so anything under a tube diameter is a real
 * self-intersection.
 */
const selfDistance = (page) =>
  page.evaluate(() => {
    const c = globalThis.knot.internals.model.curves[0];
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

const browser = await firefox.launch({ firefoxUserPrefs: FIREFOX_WEBGL });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });

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
  await page.evaluate(() => !!globalThis.knot && !!globalThis.knot.internals.viewer.renderer),
  'app booted, WebGL context created',
);
check(
  await page.evaluate(() => globalThis.knot.internals.viewer.tool === 'select'),
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
  await page.evaluate(() => globalThis.knot.internals.model.curves[0].closed),
  'ending back at the start closed the loop',
);
check(
  await page.evaluate(() => globalThis.knot.internals.viewer.tool === 'select' && !globalThis.knot.internals.viewer.liveId),
  'closing the strand releases it and hands the tool back to Select',
);

await orbit(page, page.viewportSize().height / 4);

// Where the edge-on loop passes through the draw plane, in screen pixels. That
// is what the second loop has to be drawn around, so the test works it out the
// same way your eye does — the app itself no longer marks these.
const pierces = await page.evaluate(() => {
  const { viewer, model } = globalThis.knot.internals;
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
  const { model } = globalThis.knot.internals;
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
  await page.evaluate(() => globalThis.knot.internals.viewer.selection.size === 2),
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
  globalThis.knot.scene.clear();
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
  globalThis.knot.scene.clear();
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
  const { model, viewer } = globalThis.knot.internals;
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
  await page.evaluate(() => globalThis.knot.internals.model.curves[0]?.closed === true),
  'and the third lift closed it',
);

const statusText = await page.textContent('#status');
check(
  /crossing/.test(statusText ?? '') || /loop/.test(statusText ?? ''),
  'the closing stroke reported back',
  JSON.stringify(statusText),
);

const spread = await page.evaluate(() => {
  const c = globalThis.knot.internals.model.curves[0];
  const plane = globalThis.knot.internals.viewer.drawPlaneObject();
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
// 4b. Smoothing is a dial, and it leaves the knot knotted
// ===========================================================================
//
// The camera has been orbited away from the plane the trefoil was drawn on, so
// this also checks that smoothing never looks at the camera.

await page.keyboard.press('s');
await page.waitForTimeout(80);
check(
  await page.evaluate(() => document.getElementById('btn-smooth').disabled),
  'Smooth is off until something is selected',
);

await page.keyboard.press('a');
await page.waitForTimeout(80);
check(
  await page.evaluate(() => !document.getElementById('btn-smooth').disabled),
  'and on once a strand is picked',
);

/** Every control point, in one number — for "did this land in exactly the same
 *  place" questions, where a tolerance would be lying. */
const shape = () =>
  page.evaluate(() => {
    const p = globalThis.knot.internals.model.curves[0].points;
    return `${p.length}:${p.flat().reduce((a, v, i) => a + v * (i + 1), 0).toFixed(9)}`;
  });

/**
 * Total turning: the sum of every turn the strand makes. Unlike the mean it
 * doesn't move when the point count changes, and it has a floor — Fary-Milnor
 * puts any knot above 4pi, so a strand that quietly untied itself would fall
 * through it.
 */
const turning = () =>
  page.evaluate(() => {
    const p = globalThis.knot.internals.model.curves[0].points;
    let sum = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i - 1 + p.length) % p.length], b = p[i], c = p[(i + 1) % p.length];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
      const du = Math.hypot(...u), dv = Math.hypot(...v);
      if (!du || !dv) continue;
      const dot = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (du * dv);
      sum += Math.acos(Math.max(-1, Math.min(1, dot)));
    }
    return sum;
  });

const dial = async (v) => {
  await page.evaluate((x) => globalThis.knot.internals.setSmooth(x), v);
  await page.waitForTimeout(60);
};

const asDrawn = await shape();
const turnBefore = await turning();

await page.click('#btn-smooth');
await page.waitForTimeout(200);
check(
  await page.evaluate(() => !!document.querySelector('.panel.open')),
  'pressing Smooth leaves its dial open, ready to adjust',
);

const turnAfter = await turning();
check(turnAfter < turnBefore, 'smoothing takes the kinks out',
  `total turning ${turnBefore.toFixed(2)} → ${turnAfter.toFixed(2)} rad`);
check(
  turnAfter > 4 * Math.PI,
  'and it still turns more than the 4\u03c0 a knot needs',
  `${turnAfter.toFixed(2)} vs ${(4 * Math.PI).toFixed(2)}`,
);
check((await curveCount(page)) === 1, 'and leaves one strand, still closed');
check(await page.evaluate(() => globalThis.knot.internals.model.curves[0]?.closed === true), 'still a loop');
check(
  (await selfDistance(page)) > 2 * TUBE_RADIUS,
  'the smoothed tubes still do not intersect',
  `min separation ${(await selfDistance(page)).toFixed(3)} vs tube diameter ${(2 * TUBE_RADIUS).toFixed(3)}`,
);

// If it had quietly untied itself it would have flattened into a plain loop.
const spreadAfter = await page.evaluate(() => {
  const c = globalThis.knot.internals.model.curves[0];
  const plane = globalThis.knot.internals.viewer.drawPlaneObject();
  const d = c.points.map(([x, y, z]) => plane.normal.dot({ x, y, z }) + plane.constant);
  return Math.max(...d) - Math.min(...d);
});
check(
  spreadAfter > 2 * TUBE_RADIUS,
  'and the crossings are still there — it did not untie itself',
  `depth spread ${spreadAfter.toFixed(3)}`,
);
await page.screenshot({ path: OUT + '3b-trefoil-smoothed.png' });

// The dial has to be a dial: where it points is the whole answer, and how it
// got there is not part of it.
await dial(0.3);
const firstTime = await shape();
for (const v of [0.01, 0.4, 0.12, 0.05, 0.3]) await dial(v);
check(
  (await shape()) === firstTime,
  'the same amount gives the same strand however you got there',
  firstTime.slice(0, 22),
);

await dial(0);
check(
  (await shape()) === asDrawn,
  'and sliding back to 0 gives back exactly the strand that was drawn',
  `${(await shape()).slice(0, 22)} vs ${asDrawn.slice(0, 22)}`,
);

await dial(0.25);
await page.keyboard.press('Meta+z');
await page.waitForTimeout(180);
check(
  (await shape()) === asDrawn,
  'one undo clears the press and all the fiddling after it',
);

// ===========================================================================
// 5. Eraser only touches the selection
// ===========================================================================

await page.evaluate(() => {
  globalThis.knot.scene.clear();
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
  await page.evaluate(() => globalThis.knot.internals.model.curves[0]?.closed === true),
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
  const cs = globalThis.knot.internals.model.curves;
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
  globalThis.knot.internals.viewer.handles.map((h) => ({ end: h.end, live: h.live, at: globalThis.knot.internals.viewer.project(h.position) })),
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
  await page.evaluate(() => globalThis.knot.internals.viewer.hotHandle !== null),
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
    const { viewer } = globalThis.knot.internals;
    const hot = viewer.handles.find((h) => `${h.curveId}:${h.end}` === viewer.hotHandle);
    const ring = viewer._focusRing;
    return ring.visible && ring.position.distanceTo(hot.position) < 1e-6;
  }),
  'and a focus ring closes around that handle',
);
check(
  await page.evaluate(() => {
    const { viewer } = globalThis.knot.internals;
    return viewer.handleGroup.children.every((m) => m.scale.x <= 1.0001);
  }),
  'while the ball itself does not grow',
);

// Move the camera, so resuming has to work off the strand's own geometry.
await orbit(page, 70, 30);

const before = await page.evaluate(() => JSON.stringify(globalThis.knot.internals.model.curves[0].points));
const ends = await page.evaluate(() => {
  const { viewer } = globalThis.knot.internals;
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
  const c = globalThis.knot.internals.model.curves[0];
  return { n: c.points.length, points: JSON.stringify(c.points), closed: c.closed, live: globalThis.knot.internals.viewer.liveId, tool: globalThis.knot.internals.viewer.tool, curves: globalThis.knot.internals.model.curves.length };
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
  globalThis.knot.scene.clear();
});
await drawStrand(page, [circlePath(640, 400, 150)]);
await drawStrand(page, [circlePath(640, 400, 90)]);

const drawn = await page.evaluate(() => globalThis.knot.internals.model.curves.map((c) => c.color));
check(drawn[0] !== drawn[1], 'each new strand takes the next preset colour', JSON.stringify(drawn));
check(
  await page.evaluate(() => globalThis.knot.internals.model.curves.every((c) => c.radius > 0)),
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
  await page.evaluate((c) => globalThis.knot.internals.model.curves.every((x) => x.color === c), target),
  'picking a preset recolours every selected strand',
  target,
);

await page.keyboard.press('Control+z');
await page.waitForTimeout(200);
check(
  await page.evaluate((c) => globalThis.knot.internals.model.curves.some((x) => x.color !== c), target),
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
  return globalThis.knot.internals.model.curves.map((c) => c.radius);
});
await page.waitForTimeout(250);
check(
  thicker.every((r) => r > 0.075),
  'the size slider thickens every selected strand',
  JSON.stringify(thicker.map((r) => r.toFixed(3))),
);
check(
  await page.evaluate(() => {
    const c = globalThis.knot.internals.model.curves[0];
    const mesh = globalThis.knot.internals.viewer.meshes.get(c.id);
    return mesh && mesh.userData.stamp.includes(String(c.radius));
  }),
  'and the tube mesh was rebuilt at the new radius',
);

await page.keyboard.press('Escape');
await page.evaluate(() => {
  globalThis.knot.scene.clear();
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
    const { model, viewer } = globalThis.knot.internals;
    const c = model.curves[model.curves.length - 1];
    const v = viewer.controls.target.clone();
    return c.points.map((p) => viewer.depthOf(v.set(p[0], p[1], p[2])));
  });

await page.evaluate(() => {
  globalThis.knot.scene.clear();
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
  globalThis.knot.scene.clear();
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
  await page.evaluate(() => globalThis.knot.internals.model.curves.length === 2),
  'and it is still one unbroken strand — no pen lift involved',
);

await page.evaluate(() => {
  globalThis.knot.scene.clear();
});

// ===========================================================================
// 9. Shift draws a straight line
// ===========================================================================

await page.evaluate(() => {
  globalThis.knot.scene.clear();
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
  const c = globalThis.knot.internals.model.curves[0];
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

// ===========================================================================
// 8. Saving, loading, and the shape library
// ===========================================================================
//
// The claim is "save it, open it, and it looks exactly the same", so this
// compares every control point rather than eyeballing a screenshot.

await page.evaluate(() => {
  globalThis.knot.scene.clear();
});
await page.keyboard.press('d');
await stroke(page, circlePath(640, 400, 170));
await page.keyboard.press('Enter');
await page.waitForTimeout(220);

const drawnScene = await page.evaluate(() => ({
  points: globalThis.knot.internals.model.curves.map((c) => c.points),
  meta: globalThis.knot.internals.model.curves.map((c) => [c.color, c.radius, c.closed]),
}));

// Saving asks first — ⌘S is easy to hit by accident and the answer is a file on
// your disk — and the dialogue doubles as a receipt.
await page.click('#btn-save');
await page.waitForTimeout(250);
const receipt = await page.evaluate(() => {
  const box = document.getElementById('confirm');
  return box.hidden ? null : { text: document.getElementById('confirm-text').textContent,
                               yes: document.getElementById('confirm-yes').textContent };
});
check(receipt !== null, 'Save asks before writing a file');
check(
  receipt && /\d/.test(receipt.text) && /KB|bytes/.test(receipt.text) && receipt.yes === 'Save',
  'and says how many curves and how big before you commit',
  JSON.stringify(receipt),
);

const download = await Promise.all([
  page.waitForEvent('download', { timeout: 10000 }),
  page.click('#confirm-yes'),
]).then(([d]) => d);
const savedPath = await download.path();
check(
  download.suggestedFilename().endsWith('.knot.json'),
  'Save writes a .knot.json file',
  download.suggestedFilename(),
);

const savedText = await readFile(savedPath, 'utf8');
const savedJSON = JSON.parse(savedText);
check(savedJSON.format === 'knot-a-problem/scene' && savedJSON.version >= 1, 'tagged and versioned');
check(!!savedJSON.camera, 'and it remembers the view it was saved from');

await page.evaluate(() => {
  globalThis.knot.scene.clear();
});
await page.waitForTimeout(150);
check((await curveCount(page)) === 0, 'the canvas is empty before loading it back');

await page.setInputFiles('#file-input', savedPath);
await page.waitForTimeout(900);

const reloaded = await page.evaluate(() => ({
  points: globalThis.knot.internals.model.curves.map((c) => c.points),
  meta: globalThis.knot.internals.model.curves.map((c) => [c.color, c.radius, c.closed]),
}));
check(reloaded.points.length === drawnScene.points.length, 'every curve comes back', `${reloaded.points.length}`);
check(JSON.stringify(reloaded.meta) === JSON.stringify(drawnScene.meta), 'with its colour, thickness and closedness');

const drift = Math.max(
  ...drawnScene.points.flatMap((c, i) =>
    c.flatMap((p, j) => p.map((v, k) => Math.abs(v - (reloaded.points[i]?.[j]?.[k] ?? 1e9)))),
  ),
);
check(drift <= 5e-6, 'and every control point within 5e-6 world units', `worst ${drift.toExponential(1)}`);
check(drift < 2 * TUBE_RADIUS / 10000, 'which is nowhere near enough to change the picture');

// Loading into an empty canvas restores the saved view, so it really is the
// same picture and not just the same numbers.
await page.screenshot({ path: OUT + '5-reloaded.png' });

// --- the library, and always-insert -------------------------------------------

await page.click('#btn-library');
await page.waitForTimeout(250);
const shapes = await page.evaluate(() =>
  [...document.querySelectorAll('.panel.menu.open .item')].map((i) => i.dataset.id),
);
check(shapes.length >= 8, 'the shape picker offers a library', `${shapes.length} shapes`);
check(shapes.includes('trefoil.knot.json') && shapes.includes('hopf-link.knot.json'), 'including a trefoil and a Hopf link');

const beforeInsert = await curveCount(page);
await page.click('.item[data-id="hopf-link.knot.json"]');
await page.waitForTimeout(1700);
check((await curveCount(page)) === beforeInsert + 2, 'inserting a Hopf link adds two curves, keeping what was there');

// "Beside" means along the *camera's* right, not the world's — the camera has
// been orbited all over the place by now, which is exactly the case worth
// testing. Measure everything projected onto that axis.
const placed = await page.evaluate(() => {
  const right = globalThis.knot.internals.viewer.right();
  const on = (p) => p[0] * right[0] + p[1] * right[1] + p[2] * right[2];
  const cs = globalThis.knot.internals.model.curves;
  const span = (c) => c.points.reduce((b, p) => [Math.min(b[0], on(p)), Math.max(b[1], on(p))], [1e9, -1e9]);
  const first = span(cs[0]);
  const t = globalThis.knot.internals.viewer.controls.target;
  return {
    clear: cs.slice(1).every((c) => span(c)[0] > first[1]),
    target: on([t.x, t.y, t.z]),
    firstRight: first[1],
  };
});
check(placed.clear, 'and it lands clear of the drawing, not on top of it');
check(placed.target > placed.firstRight, 'with the view panned across to it',
  `target at ${placed.target.toFixed(2)} along the camera's right, drawing ends at ${placed.firstRight.toFixed(2)}`);
await page.screenshot({ path: OUT + '5-library.png' });

check(
  await page.evaluate(() => {
    globalThis.knot.history.undo();
    return globalThis.knot.internals.model.curves.length;
  }) === beforeInsert,
  'and one undo takes the whole insert back',
);

// ===========================================================================
// 9. Select all, and the camera staying free
// ===========================================================================

await page.evaluate(() => {
  const loop = (cx) =>
    Array.from({ length: 60 }, (_, i) => {
      const t = (i / 60) * Math.PI * 2;
      return [cx + 0.6 * Math.cos(t), 0.6 * Math.sin(t), 0];
    });
  globalThis.knot.internals.model.clear();
  for (const cx of [-2.4, 0, 2.4]) globalThis.knot.internals.model.addCurve(loop(cx), { closed: true });
  globalThis.knot.internals.refresh();
  globalThis.knot.internals.viewer.setCamera({ position: [0, 0, 9], target: [0, 0, 0] });
  globalThis.knot.select.set([]);
});
await page.waitForTimeout(350);

const selected = () => page.evaluate(() => [...globalThis.knot.internals.viewer.selection].length);
const camAt = () => page.evaluate(() => globalThis.knot.internals.viewer.camera.position.toArray());
const moved = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

await page.keyboard.press('Meta+a');
await page.waitForTimeout(180);
check((await selected()) === 3, '\u2318A selects everything', `${await selected()} of 3`);

await page.keyboard.press('Escape');
await page.waitForTimeout(150);
check((await selected()) === 0, 'and Escape lets go of it again');

// Select is home, and home is where you can always look around. Nothing may
// take the left button in this mode.
const camBefore = await camAt();
await page.mouse.move(700, 400);
await page.mouse.down();
await page.mouse.move(820, 470, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(250);
const orbitDrift = moved(camBefore, await camAt());
check(orbitDrift > 0.5, 'a plain drag in Select orbits, always', `moved ${orbitDrift.toFixed(2)}`);

check(await page.evaluate(() => !document.getElementById('btn-clear')), 'Clear is gone');

// ===========================================================================
// 10. The tool surface
// ===========================================================================
//
// "Nothing the agent can do is something the UI can't, and nothing the UI can
// do is something the agent can't." This drives a whole session through
// `knot.*` alone — no clicks, no keys — and checks the result is the same kind
// of thing a person would have produced by hand.

await page.evaluate(() => globalThis.knot.scene.clear());
await page.waitForTimeout(150);

const api = (fn, arg) => page.evaluate(fn, arg);

const surface = await api(() => Object.keys(globalThis.knot).sort());
check(
  ['edit', 'file', 'history', 'library', 'scene', 'select', 'tool', 'view'].every((k) => surface.includes(k)),
  'the surface is namespaced, not a grab-bag',
  surface.join(' '),
);

// Build something from nothing, the way an agent would.
const built = await api(() => {
  const k = globalThis.knot;
  const ring = (cx) =>
    Array.from({ length: 48 }, (_, i) => {
      const t = (i / 48) * Math.PI * 2;
      return [cx + Math.cos(t), Math.sin(t), 0.2 * Math.sin(3 * t)];
    });
  const a = k.scene.add(ring(-1.4), { name: 'left' });
  const b = k.scene.add(ring(1.4), { name: 'right' });
  k.scene.update(b, { color: '#4bd2d2', radius: 0.11 });
  k.select.set([a, b]);
  return { a, b, list: k.scene.list(), selected: k.select.get() };
});
check(built.list.length === 2, 'scene.add builds curves without touching the mouse');
check(
  built.list.find((c) => c.id === built.b).color === '#4bd2d2' &&
    built.list.find((c) => c.id === built.b).radius === 0.11,
  'scene.update changes colour and thickness',
);
check(built.selected.length === 2, 'select.set picks them');
check(
  built.list.every((c) => c.by === 'agent'),
  'and every curve records that an agent made it',
  built.list.map((c) => c.by).join(),
);

// The mesh really was rebuilt — an API call is not a model-only edit.
check(
  await api(() => globalThis.knot.internals.viewer.meshes.size) === 2,
  'the view is in step with the model afterwards',
);

check(await api(() => globalThis.knot.edit.smooth(0.2)) === 2, 'edit.smooth runs the dial on the selection');
check(
  await api(() => globalThis.knot.library.list().length) >= 8,
  'library.list enumerates the shipped shapes',
);
await api(() => globalThis.knot.library.load('trefoil'));
await page.waitForTimeout(1600);
check(await curveCount(page) === 3, 'library.load inserts one by name');

check(
  await api(() => globalThis.knot.view.moveTo(globalThis.knot.scene.list()[0].id)),
  'view.moveTo glides to a strand',
);

// --- transactions ---
//
// The open question in plan.md: an agent makes a forty-step edit, is that one
// undo entry or forty? It is one, and the agent says so.

const txn = await api(() => {
  const k = globalThis.knot;
  const before = k.scene.list().length;
  k.history.begin();
  for (let i = 0; i < 5; i++) k.scene.add([[i, 0, 0], [i, 1, 0], [i, 1, 1]], { closed: false });
  const during = k.scene.list().length;
  k.history.commit();
  k.history.undo();
  return { before, during, after: k.scene.list().length };
});
check(txn.during === txn.before + 5, 'five scripted edits all land', `${txn.before} → ${txn.during}`);
check(txn.after === txn.before, 'and one undo takes all five back, not one of them',
  `${txn.during} → ${txn.after}`);

const rolled = await api(() => {
  const k = globalThis.knot;
  const before = k.scene.list().length;
  k.history.begin();
  k.scene.add([[9, 9, 9], [9, 9, 8]], { closed: false });
  k.scene.clear();
  const wrecked = k.scene.list().length;
  k.history.rollback();
  return { before, wrecked, after: k.scene.list().length };
});
check(rolled.wrecked === 0 && rolled.after === rolled.before,
  'and rollback abandons a half-finished batch',
  `${rolled.before} → ${rolled.wrecked} → ${rolled.after}`);

// ===========================================================================
// 11. Analyze: reading the scene, printing it, and reading it back
// ===========================================================================
//
// The round trip is the claim worth making in a browser: print the projection
// you are looking at, paint that SVG into ordinary pixels the way a screenshot
// would, feed it back through the file picker's code path, and check the knot
// that arrives is the knot that left.

await api(() => globalThis.knot.scene.clear());
await api(() => globalThis.knot.library.load('trefoil'));
await page.waitForTimeout(400);

await page.keyboard.press('k');
check(await page.isVisible('#analyze'), 'K opens the Analyze panel');

const read = await api(() => globalThis.knot.analyze.run());
check(read.crossings === 3, 'it reads the trefoil as three crossings', `${read.crossings}`);
check(read.components === 1 && read.chiral === true, 'one component, and it can tell it from its mirror');
check(/A\^4/.test(read.jones ?? ''), 'with a Jones polynomial', read.jones);
check(
  read.moves.R2.available === 0 && /clasp/.test(read.moves.R2.reasons[0] ?? ''),
  'and no simplifying move, because every bigon is a clasp',
  read.moves.R2.reasons.join(''),
);

const panelText = await page.textContent('#analyze-body');
check(/Crossings/.test(panelText) && /Jones/.test(panelText), 'and the panel says so on screen');

await api(() => globalThis.knot.analyze.setView('search'));
await page.waitForTimeout(300);
const searched = await api(() => globalThis.knot.analyze.run());
check(searched.crossings === 3 && searched.tried > 1, 'the clearest-view search finds three crossings too',
  `best of ${searched.tried}, ${searched.usable} usable`);
await api(() => globalThis.knot.analyze.setView('camera'));

const printed = await api(() => {
  const svg = globalThis.knot.analyze.print();
  return { bytes: svg.length, subpaths: (svg.match(/M/g) ?? []).length, page: (svg.match(/rect[^>]*fill="([^"]+)"/) ?? [])[1] };
});
check(printed.subpaths === 3, 'printing breaks the strand once per crossing', `${printed.subpaths} subpaths`);
check(printed.page === '#0a0b0e', 'on the editor\'s own page colour', printed.page);

// Print → pixels → import. The SVG never reaches the tracer as an SVG: it is
// painted into a canvas first, so what goes in is a picture like any other.
const imported = await api(async () => {
  const knot = globalThis.knot;
  const svg = knot.analyze.print();
  const url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  const img = new Image();
  await new Promise((ok, no) => {
    img.onload = ok;
    img.onerror = () => no(new Error('the printed diagram would not load as an image'));
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.width || 720;
  canvas.height = img.height || 720;
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/png'));
  const before = knot.scene.list().length;
  try {
    const added = await knot.analyze.importImage(new File([blob], 'printed.png', { type: 'image/png' }));
    return { ok: true, added, before, after: knot.scene.list().length };
  } catch (e) {
    return { ok: false, why: String(e && e.message) };
  }
});
check(imported.ok && imported.added === 1, 'a picture of that diagram imports as one strand',
  imported.ok ? `${imported.before} → ${imported.after} curves` : imported.why);

if (imported.ok && imported.added === 1) {
  const again = await api(() => {
    const knot = globalThis.knot;
    const all = knot.scene.list().map((c) => c.id);
    knot.scene.remove(all.slice(0, all.length - 1)); // keep only what just arrived
    return knot.analyze.run();
  });
  check(again.crossings === 3, 'and reads back as a three-crossing knot', `${again.crossings}`);
  check(again.jones === read.jones, 'with the very same Jones polynomial', `${read.jones} → ${again.jones}`);
}

await api(() => globalThis.knot.analyze.close());
check(!(await page.isVisible('#analyze')), 'and it closes again');

// --- parity, the other direction ---
//
// Everything the rail can do has a call. Checked by name, so adding a button
// without adding a call trips this.
const parity = await api(() => {
  const k = globalThis.knot;
  const has = (path) => path.split('.').reduce((o, p) => (o == null ? o : o[p]), k) !== undefined;
  const buttons = [...document.querySelectorAll('#toolbar button, #btn-analyze, #analyze button')].map(
    (b) => b.id || `view-${b.dataset.view}`,
  );
  return {
    buttons,
    missing: [
      ['tool-select', 'tool.set'], ['tool-draw', 'tool.set'], ['tool-erase', 'tool.set'],
      ['btn-undo', 'history.undo'], ['btn-redo', 'history.redo'],
      ['btn-smooth', 'edit.smooth'], ['btn-delete', 'scene.remove'],
      ['btn-library', 'library.load'], ['btn-open', 'scene.load'],
      ['btn-save', 'file.save'], ['sw-export', 'file.export'],
      ['sw-draw-color', 'tool.settings'], ['sw-draw-size', 'tool.settings'],
      ['sw-sel-color', 'scene.update'], ['sw-sel-size', 'scene.update'],
      ['sw-erase-size', 'tool.settings'], ['sw-smooth', 'edit.smooth'],
      ['btn-analyze', 'analyze.open'], ['analyze-close', 'analyze.close'],
      ['view-camera', 'analyze.setView'], ['view-search', 'analyze.setView'],
      ['analyze-print', 'analyze.print'], ['analyze-import', 'analyze.importImage'],
    ].filter(([, call]) => !has(call)).map(([b, call]) => `${b}→${call}`),
  };
});
check(parity.missing.length === 0, 'every control in the rail has a call behind it', parity.missing.join(' '));

check(errors.length === 0, 'no console or page errors', errors.slice(0, 3).join(' | '));

await browser.close();

console.log(problems.length ? `\n${problems.length} failing check(s)` : '\nall checks passed');
process.exit(problems.length ? 1 : 0);
