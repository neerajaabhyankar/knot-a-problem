// Glue: tools, pointer handling, keyboard, undo, render loop.
//
// The stylesheet is imported here rather than linked from index.html: theme.js
// reads the palette back out of it, so it has to be applied before any module
// body runs. Through the module graph that ordering is guaranteed.
import './style.css';

import { Scene } from './model.js';
import { DEFAULT_COLOR, DEFAULT_RADIUS, PALETTE } from './theme.js';
import { Viewer, vec3 } from './viewer.js';
import { EraseSession } from './eraser.js';
import { fillRun, liftStroke } from './crossings.js';
import { dedupe, simplifyStroke } from './simplify.js';
import { closeSwatch, colorSwatch, sizeSwatch } from './swatches.js';

const canvas = document.getElementById('view');
const statusEl = document.getElementById('status');
const helpEl = document.getElementById('help');
const eraserCursor = document.getElementById('eraser-cursor');
const btn = (id) => document.getElementById(id);

const model = new Scene();
const viewer = new Viewer(canvas);

// Select is home. Draw stays armed until you finish the strand.
let tool = 'select';
let selection = new Set();

// At most one strand is live: the one the next stroke continues. It always
// grows from its last point, so grabbing the other end reverses it and there is
// only ever one direction to think about. See design-drawing.md.
let live = null; // curve id, or null
let pen = null; // [[px, py]] while the pointer is down
// Points drawn with U held. `dedupe` and `rdp` return the very same point
// objects rather than copies, so membership survives simplification untouched.
let penUnder = new Set();
let underHeld = false;
let drawColor = DEFAULT_COLOR; // what the next strand gets
let drawRadius = DEFAULT_RADIUS;
let erase = null;
let downAt = null; // to tell a click apart from an orbit drag
let eraserRadius = 20;

const CLICK_SLOP = 5; // px of movement still counted as a click
const MIN_STROKE = 7; // px of travel before a drag counts as a stroke at all

// How far apart strands sit at a crossing: four times the strand's own radius,
// so they clear each other by a full strand thickness. Not scaled to how big you
// drew — a knot diagram is flat apart from a small hop at each crossing, and the
// hop should read the same at any size or zoom. A thick strand needs a bigger
// hop, which is why this follows the radius rather than being a constant.
const clearance = (radius) => 4 * radius;

/** The radius the next stroke will use — the live strand's, or the Draw swatch. */
function strokeRadius() {
  return liveCurve()?.radius ?? drawRadius;
}

/** The clearance, converted to the pixel units the lift works in. */
function separationPx() {
  return clearance(strokeRadius()) / viewer.worldPerPixel();
}

/** Below this the pen-up gap is a wobble, not a break, so the strand just joins. */
function minGapPx() {
  return separationPx() / 2;
}

/**
 * How close to the strand's start a stroke has to end to close it. The seam is
 * just one more break, so the tolerance is measured in breaks: a gap wider than
 * a couple of strand separations doesn't read as a break in the first place.
 */
function closeSlopPx() {
  return 2.5 * separationPx();
}

/** Total travel of a screen-space polyline. */
function pathLength(pts) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return total;
}

/** Catmull-Rom wants three points; a straight line only gives two. */
function padToThree(points) {
  if (points.length !== 2) return points;
  const [a, b] = points;
  return [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], b];
}

// ---------- history ----------

const past = [];
const future = [];
const HISTORY_LIMIT = 80;

/** Snapshot the model *before* mutating it. */
function record() {
  past.push(model.toJSON());
  if (past.length > HISTORY_LIMIT) past.shift();
  future.length = 0;
  updateHistoryButtons();
}

function undo() {
  if (!past.length) return;
  future.push(model.toJSON());
  model.restore(past.pop());
  afterHistory('undo');
}

function redo() {
  if (!future.length) return;
  past.push(model.toJSON());
  model.restore(future.pop());
  afterHistory('redo');
}

/** A strand that survived the step stays live, so you can undo a bad stroke and
 *  simply draw it again. */
function afterHistory(label) {
  pen = null;
  viewer.clearPreview();
  if (live && !model.get(live)) live = null;
  viewer.liveId = live;
  refresh();
  setSelection(live ? [live] : []);
  flashStatus(label);
}

function updateHistoryButtons() {
  btn('btn-undo').disabled = past.length === 0;
  btn('btn-redo').disabled = future.length === 0;
}

// ---------- tools ----------

function setTool(next) {
  pen = null;
  closeSwatch();
  viewer.clearPreview();
  endLive();
  tool = next;
  viewer.setTool(next);
  for (const b of document.querySelectorAll('#toolbar .tool')) {
    b.classList.toggle('active', b.dataset.tool === next);
  }
  btn('sc-erase').hidden = next !== 'erase';
  btn('sc-draw').hidden = next !== 'draw';
  eraserCursor.hidden = next !== 'erase';
  eraserCursor.classList.toggle('disabled', next === 'erase' && selection.size === 0);
  showSwatches();
  updateStatus();
}

function setSelection(ids) {
  selection = new Set(ids);
  viewer.setSelection(selection);
  selection = viewer.selection; // viewer drops ids that no longer exist
  viewer.updateHandles(model);
  btn('btn-delete').disabled = selection.size === 0;
  eraserCursor.classList.toggle('disabled', tool === 'erase' && selection.size === 0);
  showSwatches();
  updateStatus();
}

// ---------- colour and thickness ----------
//
// Each tool shows only its own settings. Draw's decide what the next strand
// gets; Select's edit the strands you have picked.

/** Reveal the swatches belonging to the current tool, and nothing else. */
function showSwatches() {
  const picked = [...selection].map((id) => model.get(id)).filter(Boolean);
  for (const [id, on] of [
    ['sw-draw-color', tool === 'draw'],
    ['sw-draw-size', tool === 'draw'],
    ['sw-sel-color', tool === 'select' && picked.length > 0],
    ['sw-sel-size', tool === 'select' && picked.length > 0],
    ['sw-erase-size', tool === 'erase'],
  ]) {
    btn(id).hidden = !on;
  }
  // Opening on a selection should show what that selection already is.
  if (picked.length) {
    selColor.set(picked[0].color);
    selSize.set(picked[0].radius ?? DEFAULT_RADIUS);
  }
}

/** Step to the next preset once a strand is finished, the way it used to cycle. */
function advanceDrawColor() {
  const i = PALETTE.indexOf(drawColor);
  if (i >= 0) drawColorSwatch.set(PALETTE[(i + 1) % PALETTE.length]);
  drawColor = drawColorSwatch.get();
}

/** Apply an edit to every selected strand. */
function editSelection(change) {
  const picked = [...selection].map((id) => model.get(id)).filter(Boolean);
  if (!picked.length) return;
  record();
  for (const curve of picked) Object.assign(curve, change);
  refresh();
}

/** Rebuild meshes and handles after any change to the model. */
function refresh() {
  viewer.syncCurves(model);
  setSelection(selection);
  updateHistoryButtons();
}

function updateStatus() {
  const n = model.curves.length;
  const count = `<b>${n}</b> curve${n === 1 ? '' : 's'}`;

  let hint;
  if (tool === 'draw') {
    if (underHeld) hint = '<b>under</b> &mdash; this stretch dives beneath whatever it crosses';
    else if (live) hint = 'continuing · every gap you leave goes under · come back to the other end to close';
    else hint = 'draw · lift the pen, or hold <b>U</b>, wherever the strand passes under';
  } else if (tool === 'erase') {
    hint = selection.size
      ? `rub to erase from <b>${selection.size}</b> selected · size <b>${eraserRadius}</b>px`
      : 'select a strand first — the eraser only touches what you pick';
  } else if (selection.size) {
    hint = `<b>${selection.size}</b> selected · drag an end to continue it · Del to remove`;
  } else if (n === 0) {
    hint = 'press <b>D</b> and sweep a loop';
  } else if (n === 1) {
    hint = 'drag to orbit &mdash; you draw on the plane facing you';
  } else {
    hint = 'drag to orbit · click a strand to select';
  }
  statusEl.innerHTML = `${count} &nbsp;&middot;&nbsp; ${hint}`;
}

let flashTimer = null;
function flashStatus(html) {
  statusEl.innerHTML = html;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(updateStatus, 2400);
}

// ---------- drawing: the live strand ----------
//
// One concept: at most one strand is live, and the next stroke continues it.
// The gap between the live end and where you put the pen down is filled with a
// straight run, which passes under anything it crosses — that is what a break
// in a knot diagram means. See design-drawing.md.

/** The strand the next stroke continues, if there is one. */
function liveCurve() {
  return live ? model.get(live) : null;
}

/** Make `id` live, growing from `end`. Growing always happens at the last point,
 *  so grabbing the start reverses the strand rather than adding a second case. */
function setLive(id, end = 'end') {
  const curve = model.get(id);
  if (curve && end === 'start') {
    record();
    curve.points.reverse();
  }
  live = curve ? id : null;
  viewer.liveId = live;
  setSelection(live ? [live] : []);
}

/** Release the live strand without leaving Draw. */
function endLive() {
  if (!live) return;
  live = null;
  viewer.liveId = null;
  setSelection([]);
}

/**
 * Done with this strand. Select is home — you almost always want to orbit and
 * look at what you just made, and Draw holds the left button hostage.
 */
function finishStrand() {
  if (live) advanceDrawColor();
  endLive();
  if (tool !== 'select') setTool('select');
  else updateStatus();
}

/** Everything already on screen, as depth-carrying obstacles for the lift. */
function obstacles() {
  const out = [];
  for (const curve of model.curves) {
    const projected = viewer.projectCurve(curve);
    // The live end is where the new stroke attaches, not something it crosses.
    if (curve.id === live) projected.length = Math.max(0, projected.length - 2);
    if (projected.length > 1) out.push(projected);
  }
  return out;
}

/** Screen points of the pen stroke, denoised and simplified. */
function penPoints() {
  const raw = dedupe(pen ?? [], 2);
  return raw.length < 2 || pathLength(raw) < MIN_STROKE ? null : simplifyStroke(raw, 6, 4);
}

/** One pen sample, remembering whether U was held as it was made. */
function mark(ev) {
  const p = [ev.clientX, ev.clientY];
  if (underHeld) penUnder.add(p);
  return p;
}

function showPen() {
  const raw = dedupe(pen ?? [], 2);
  if (raw.length < 2) return viewer.clearPreview();
  const world = raw.map(([x, y]) => viewer.unproject(x, y)).filter(Boolean);
  if (world.length >= 2) viewer.showPreview(world, false);
}

/**
 * Add one finished stroke to the live strand — or start a new strand with it.
 * The strand's existing points are never touched; this only ever appends.
 */
function addStroke(stroke, marked = new Set()) {
  const curve = liveCurve();
  // The far end of the strand — for a brand-new one, where this stroke began.
  const head = curve ? viewer.project(vec3(curve.points[0])) : stroke[0];

  // Splice the stroke onto the live end, filling the pen-up gap.
  // A stretch goes under either because you lifted the pen across it, or because
  // you held U while drawing it. Same flag, two ways to raise it.
  let pts = stroke;
  let isUnder = stroke.map((p) => marked.has(p));
  let startDepth = 0;

  if (curve) {
    const tail = vec3(curve.points[curve.points.length - 1]);
    const fill = fillRun(viewer.project(tail), stroke[0], minGapPx());
    pts = [...fill, ...stroke];
    isUnder = [...fill.map(() => true), ...isUnder];
    startDepth = viewer.depthOf(tail);
  }

  // Coming back to the far end ties the strand into a loop, and that closing gap
  // is a fill like any other.
  const last = stroke[stroke.length - 1];
  const closing = Math.hypot(last[0] - head[0], last[1] - head[1]) < closeSlopPx();
  if (closing) {
    const back = fillRun(last, head, minGapPx());
    pts = [...pts, ...back];
    isUnder = [...isUnder, ...back.map(() => true)];
  }

  const lifted = liftStroke(pts, isUnder, {
    startDepth,
    separation: separationPx(),
    obstacles: obstacles(),
  });
  const added = lifted.points
    .map(([x, y, d]) => viewer.unproject(x, y, d))
    .filter(Boolean)
    .map((v) => [v.x, v.y, v.z]);
  if (added.length < 2) return;

  record(); // one undo step per stroke
  if (curve) {
    curve.points.push(...added);
    curve.closed = closing;
  } else {
    live = model.addCurve(padToThree(added), {
      closed: closing,
      color: drawColor,
      radius: drawRadius,
    }).id;
  }
  viewer.clearPreview();
  refresh();
  if (closing) finishStrand(); // a loop has no end to grow from
  else {
    viewer.liveId = live;
    setSelection([live]);
  }
  report(lifted, closing);
}

function report({ crossings: n, under }, closed) {
  const made = n ? `<b>${n}</b> crossing${n === 1 ? '' : 's'}` : '';
  if (closed) return flashStatus(n ? `${made} — the strand is a loop` : 'the strand is a loop');
  if (!n) return;
  flashStatus(
    under === n
      ? `${made}, all passing under — orbit to check`
      : `${made}, <b>${n - under}</b> passed over — lift the pen there to go under instead`,
  );
}

function endPenStroke() {
  const stroke = penPoints();
  const marked = penUnder;
  pen = null;
  penUnder = new Set();
  viewer.clearPreview();
  // Too short to be a stroke: that was a click, which finishes the strand.
  if (!stroke) return finishStrand();
  addStroke(stroke, marked);
}

// ---------- erasing ----------

function beginErase(ev) {
  if (!selection.size) {
    flashStatus('select a strand first — the eraser only touches what you pick');
    return false;
  }
  record();
  erase = { session: new EraseSession(model, viewer, selection), queued: false };
  canvas.setPointerCapture(ev.pointerId);
  extendErase(ev);
  return true;
}

function extendErase(ev) {
  erase.session.rub(ev.clientX, ev.clientY, eraserRadius);
  if (erase.queued) return;
  // Rebuilding tube geometry is not free; coalesce to one update per frame.
  erase.queued = true;
  requestAnimationFrame(() => {
    if (!erase) return;
    erase.queued = false;
    if (erase.session.apply()) refresh();
  });
}

function endErase() {
  if (erase.session.apply()) refresh();
  erase = null;
}

// ---------- pointer wiring ----------

// Grabbing a handle has to beat OrbitControls to the event. Its listener is on
// the canvas, so we intercept during the capture phase on the way down. This is
// the one gesture that crosses modes: grab an end and you are drawing again.
addEventListener(
  'pointerdown',
  (ev) => {
    // Shift is allowed through: it straightens the stroke rather than panning.
    if (ev.button !== 0 || ev.target !== canvas || tool === 'erase') return;
    const handle = viewer.hitHandle(ev.clientX, ev.clientY);
    if (!handle) return;
    ev.stopPropagation();
    ev.preventDefault();
    setTool('draw');
    setLive(handle.curveId, handle.end);
    downAt = [ev.clientX, ev.clientY];
    pen = [mark(ev)];
    canvas.setPointerCapture(ev.pointerId);
  },
  true,
);

canvas.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0) return;
  downAt = [ev.clientX, ev.clientY];
  viewer.setDragging(true);
  if (tool === 'draw') {
    pen = [mark(ev)];
    canvas.setPointerCapture(ev.pointerId);
  } else if (tool === 'erase') {
    beginErase(ev);
  }
});

canvas.addEventListener('pointermove', (ev) => {
  if (tool === 'erase') {
    eraserCursor.style.left = `${ev.clientX}px`;
    eraserCursor.style.top = `${ev.clientY}px`;
  }
  // Light up the handle you are close enough to act on, in either mode.
  if (tool !== 'erase') viewer.setHotHandle(viewer.hitHandle(ev.clientX, ev.clientY, closeSlopPx()));

  if (pen) {
    // Shift collapses the stroke to a straight run from where it began.
    if (ev.shiftKey) pen = [pen[0], mark(ev)];
    else pen.push(mark(ev));
    showPen();
  } else if (erase) extendErase(ev);
});

canvas.addEventListener('pointerup', (ev) => {
  if (ev.button !== 0) return;
  viewer.setDragging(false);
  const moved = downAt && Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]);
  downAt = null;

  if (pen) {
    canvas.releasePointerCapture(ev.pointerId);
    endPenStroke();
  } else if (erase) {
    canvas.releasePointerCapture(ev.pointerId);
    endErase();
  } else if (tool === 'select' && moved !== null && moved < CLICK_SLOP) {
    // A click, not an orbit. Shift extends the selection.
    const id = viewer.pick(ev.clientX, ev.clientY);
    if (!id) setSelection(ev.shiftKey ? selection : []);
    else if (!ev.shiftKey) setSelection([id]);
    else {
      const next = new Set(selection);
      next.has(id) ? next.delete(id) : next.add(id);
      setSelection(next);
    }
  }
});

canvas.addEventListener('pointercancel', () => {
  viewer.setDragging(false);
  erase = null;
  downAt = null;
  pen = null;
  viewer.clearPreview();
});

// Right-drag pans, so the context menu has to go.
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

// ---------- confirm dialog ----------

const confirmEl = document.getElementById('confirm');
let confirmResolve = null;

function askConfirm(message) {
  document.getElementById('confirm-text').innerHTML = message;
  confirmEl.hidden = false;
  btn('confirm-yes').focus();
  return new Promise((resolve) => {
    confirmResolve = resolve;
  });
}

function closeConfirm(answer) {
  confirmEl.hidden = true;
  confirmResolve?.(answer);
  confirmResolve = null;
}

btn('confirm-yes').addEventListener('click', () => closeConfirm(true));
btn('confirm-no').addEventListener('click', () => closeConfirm(false));
confirmEl.addEventListener('click', (ev) => {
  if (ev.target === confirmEl) closeConfirm(false);
});

// ---------- commands ----------

async function deleteSelected() {
  if (!selection.size) return;
  // One curve goes without ceremony; a bulk delete asks first.
  if (selection.size > 1) {
    const ok = await askConfirm(`Delete <b>${selection.size}</b> selected curves?`);
    if (!ok) return;
  }
  record();
  for (const id of selection) model.remove(id);
  setSelection([]);
  refresh();
}

async function clearAll() {
  if (!model.curves.length) return;
  const ok = await askConfirm(`Delete all <b>${model.curves.length}</b> curves?`);
  if (!ok) return;
  record();
  model.clear();
  setSelection([]);
  refresh();
}

function setEraserRadius(r) {
  eraserRadius = Math.max(6, Math.min(90, r));
  eraserCursor.style.width = `${eraserRadius * 2}px`;
  eraserCursor.style.height = `${eraserRadius * 2}px`;
  eraseSizeSwatch?.set(eraserRadius);
  updateStatus();
}

function frameAll() {
  viewer.frameAll(model);
}

// ---------- toolbar & keys ----------

for (const b of document.querySelectorAll('#toolbar .tool')) {
  b.addEventListener('click', () => setTool(b.dataset.tool));
}

btn('btn-undo').addEventListener('click', undo);
btn('btn-redo').addEventListener('click', redo);
btn('btn-delete').addEventListener('click', deleteSelected);
btn('btn-clear').addEventListener('click', clearAll);
btn('btn-help').addEventListener('click', () => helpEl.classList.toggle('hidden'));
btn('help-close').addEventListener('click', () => helpEl.classList.add('hidden'));

// ⌘, Ctrl or ⇧ with a drag pans instead of orbiting. three.js swaps that itself;
// all we do is keep the cursor honest about it.
const PAN_KEYS = new Set(['Meta', 'Control', 'Shift']);

addEventListener('keydown', (ev) => {
  if (PAN_KEYS.has(ev.key)) viewer.setPanHint(true);
  if (ev.key === 'u' || ev.key === 'U') {
    underHeld = true;
    updateStatus();
  }

  if (ev.metaKey || ev.ctrlKey) {
    const k = ev.key.toLowerCase();
    if (k === 'z') {
      ev.preventDefault();
      ev.shiftKey ? redo() : undo();
    } else if (k === 'y') {
      ev.preventDefault();
      redo();
    }
    return;
  }
  if (ev.altKey) return;

  if (!confirmEl.hidden) {
    if (ev.key === 'Escape') closeConfirm(false);
    else if (ev.key === 'Enter') closeConfirm(true);
    return;
  }

  const k = ev.key;
  if (k === 'Escape') {
    if (!helpEl.classList.contains('hidden')) helpEl.classList.add('hidden');
    erase = null;
    pen = null;
    viewer.clearPreview();
    if (live || tool !== 'select') finishStrand();
    else setSelection([]);
  } else if (k === 'Enter') {
    finishStrand();
  } else if (k === 'd' || k === 'D') setTool('draw');
  else if (k === 's' || k === 'S') setTool('select');
  else if (k === 'e' || k === 'E') setTool('erase');
  else if (k === 'f' || k === 'F') frameAll();
  else if (k === 'Delete' || k === 'Backspace') {
    ev.preventDefault();
    deleteSelected();
  } else if (k === '[') setEraserRadius(eraserRadius - 4);
  else if (k === ']') setEraserRadius(eraserRadius + 4);
  else if (k === '?') helpEl.classList.toggle('hidden');
  else if (k === 'a' || k === 'A') setSelection(model.curves.map((c) => c.id));
});

addEventListener('keyup', (ev) => {
  if (PAN_KEYS.has(ev.key)) viewer.setPanHint(false);
  if (ev.key === 'u' || ev.key === 'U') {
    underHeld = false;
    updateStatus();
  }
});
addEventListener('blur', () => {
  viewer.setPanHint(false);
  underHeld = false;
});

// ---------- go ----------

// ---------- swatches ----------
//
// Thickness is capped at twice the default: a strand keeps the crossing
// separation it was drawn with, and past 2x its own tube would reach across that
// gap and touch itself.
const MAX_RADIUS = DEFAULT_RADIUS * 2;
const RADIUS_STEP = DEFAULT_RADIUS / 20;
const asWeight = (r) => `${(r / DEFAULT_RADIUS).toFixed(2)}×`;

const drawColorSwatch = colorSwatch(btn('sw-draw-color'), (c) => {
  drawColor = c;
});
const drawSizeSwatch = sizeSwatch(
  btn('sw-draw-size'),
  { min: DEFAULT_RADIUS / 2, max: MAX_RADIUS, step: RADIUS_STEP, value: DEFAULT_RADIUS, format: asWeight },
  (r) => {
    drawRadius = r;
  },
);

const selColor = colorSwatch(btn('sw-sel-color'), (c) => editSelection({ color: c }));
const selSize = sizeSwatch(
  btn('sw-sel-size'),
  { min: DEFAULT_RADIUS / 2, max: MAX_RADIUS, step: RADIUS_STEP, value: DEFAULT_RADIUS, format: asWeight },
  (r) => editSelection({ radius: r }),
);

const eraseSizeSwatch = sizeSwatch(
  btn('sw-erase-size'),
  { min: 6, max: 90, step: 2, value: eraserRadius, format: (r) => `${r}px` },
  (r) => setEraserRadius(r),
);

// The pan modifier is ⌘ on a Mac and Ctrl everywhere else.
if (!/Mac/i.test(navigator.platform || '')) btn('sc-pan').textContent = 'Ctrl drag';

setEraserRadius(eraserRadius);
setTool('select');
setSelection([]);
updateHistoryButtons();

(function loop() {
  requestAnimationFrame(loop);
  viewer.render();
})();

// Handy for poking at the model from the console, and a first sketch of the
// tool surface that level (b)'s agent will eventually drive.
globalThis.knot = { model, viewer, refresh, setTool, setSelection, undo, redo, frameAll };
