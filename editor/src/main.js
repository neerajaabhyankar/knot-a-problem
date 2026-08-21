// Glue: tools, pointer handling, keyboard, undo, render loop.
//
// The stylesheet is imported here rather than linked from index.html: theme.js
// reads the palette back out of it, so it has to be applied before any module
// body runs. Through the module graph that ordering is guaranteed.
import './style.css';

import { Scene } from './model.js';
import LIBRARY_INDEX from './library/index.json';
import { DEFAULT_COLOR, DEFAULT_RADIUS, PALETTE } from './theme.js';
import { Viewer, sampleCurve, vec3 } from './viewer.js';
import { EraseSession } from './eraser.js';
import { fillRun, liftStroke } from './crossings.js';
import { dedupe, simplifyStroke } from './simplify.js';
import { smooth } from './smooth.js';
import { closeSwatch, colorSwatch, menuSwatch, sizeSwatch } from './swatches.js';
import {
  EXTENSION,
  bounds,
  orient,
  parse,
  placement,
  serialize,
  stringify,
  suggestName,
  toOBJ,
  toVECT,
  translate,
} from './io.js';

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
let smoothAmount = 0.06; // how much of a strand the Smooth dial irons out
// The strands Smooth is currently working on, and how they looked before it
// started. Everything the dial does is recomputed from that, never stacked on
// top of the last go — see smoothen.md.
let smoothing = null;
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
  smoothing = null; // any other edit ends the smoothing session
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
  smoothing = null; // the baseline it held no longer describes anything
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
  smoothing = null;
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
  // Picking something else ends the smoothing session; re-selecting the same
  // strands does not, because that is all `refresh()` does.
  if (smoothing && !sameStrands(selection, smoothing.ids)) smoothing = null;
  viewer.updateHandles(model);
  btn('btn-delete').disabled = selection.size === 0;
  btn('btn-smooth').disabled = selection.size === 0;
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

// ---------- drag and drop ----------
//
// Dropping a file anywhere on the window is the same as opening it. The counter
// is because dragenter/dragleave fire for every element the pointer crosses, so
// a plain boolean flickers the hint on and off as you move across the rail.

const dropHint = btn('drop-hint');
let dragDepth = 0;
const hasFiles = (ev) => [...(ev.dataTransfer?.types ?? [])].includes('Files');

addEventListener('dragenter', (ev) => {
  if (!hasFiles(ev)) return;
  ev.preventDefault();
  dragDepth++;
  dropHint.hidden = false;
});
addEventListener('dragover', (ev) => {
  if (hasFiles(ev)) ev.preventDefault(); // or the browser navigates to the file
});
addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    dropHint.hidden = true;
  }
});
addEventListener('drop', (ev) => {
  if (!hasFiles(ev)) return;
  ev.preventDefault();
  dragDepth = 0;
  dropHint.hidden = true;
  openFiles([...ev.dataTransfer.files]);
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

// ---------- saving, loading, the shape library ----------
//
// See io.md. `io.js` does the serialising and the placement maths; everything
// impure — the file picker, the download, the camera — is here.
//
// Loading always *inserts*: one rule, and the one that lets you build a link out
// of pieces. What arrives is offset along the camera's right until it clears
// what is already there, and then the view glides across to it.

// The shapes are code-split — one chunk each, fetched the first time you pick
// one — so eleven knots cost nothing until they are wanted. The index is tiny
// and static, so it rides along in the bundle.
const LIBRARY = import.meta.glob('./library/*.knot.json');

/** Everything on screen, as the file format wants it. */
function sceneForSave() {
  return serialize(model.curves, { camera: viewer.camera3() });
}

function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  // Revoking immediately can beat the download on some engines; a tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function saveScene() {
  if (!model.curves.length) return flashStatus('nothing to save yet');
  download(suggestName() + EXTENSION, stringify(sceneForSave()));
  const n = model.curves.length;
  flashStatus(`saved <b>${n}</b> curve${n === 1 ? '' : 's'}`);
}

/**
 * Add a parsed scene to what's already on screen.
 *
 * `face` turns the incoming shape to look at you — right for a library shape,
 * which is a template and would otherwise arrive edge-on whenever you had
 * orbited; wrong for a saved file, which is your work and arrives exactly as
 * you left it.
 */
function insertScene({ curves, camera }, { face = false, label = 'loaded' } = {}) {
  if (!curves.length) return flashStatus('that file has no curves in it');

  const empty = model.curves.length === 0;
  let incoming = curves;
  if (face) incoming = orient(incoming, [0, 0, 1], viewer.forward().map((v) => -v));
  incoming = translate(incoming, placement(model.curves, incoming, viewer.right()));

  record();
  const added = incoming.map((c) =>
    model.addCurve(c.points, { closed: c.closed, color: c.color, radius: c.radius, name: c.name }),
  );
  refresh();
  setSelection(added.map((c) => c.id));

  // An empty canvas is the one case where a saved camera can be honoured: there
  // is nothing to place the scene beside, so it lands on its own coordinates and
  // the view it was saved from is exactly the view you get back.
  const box = bounds(incoming);
  if (empty && camera && !face) viewer.setCamera(camera);
  else if (box) viewer.easeTo(box.centre, Math.max(...box.size) / 2);

  const n = added.length;
  flashStatus(`${label} &nbsp;&middot;&nbsp; <b>${n}</b> curve${n === 1 ? '' : 's'}`);
}

/** Read one or more dropped/picked files. Each is inserted as it arrives. */
async function openFiles(files) {
  for (const file of files) {
    try {
      insertScene(parse(await file.text(), { fallbackColor: drawColor, defaultRadius: DEFAULT_RADIUS }), {
        label: file.name,
      });
    } catch (err) {
      flashStatus(`<b>${file.name}</b> &mdash; ${err.message}`);
      return;
    }
  }
}

async function loadShape(file) {
  const load = LIBRARY[`./library/${file}`];
  if (!load) return flashStatus('that shape is missing from the library');
  const shape = await load();
  // A bundled JSON import arrives as an object, not text.
  insertScene(parse(JSON.stringify(shape.default ?? shape)), { face: true, label: 'inserted' });
}

// ---------- smoothing ----------
//
// The heat equation along each strand's own arclength, with a guard that makes
// it impossible to pull one strand through another — so the knot survives and
// the depths never need recomputing. All of that lives in smooth.js; the two
// impure halves are here. See smoothen.md.
//
// Smooth is a dial, not a ratchet. Pressing it remembers how the selected
// strands looked and applies the current amount; moving the slider then
// recomputes from that same memory, so the result depends only on where the
// slider is and never on how you got there. Slide back to 0 and you have the
// strands you drew. One press plus all the fiddling after it is one undo step.

const SMOOTH_SAMPLES = 320;
/**
 * Obstacles are sampled far more coarsely than the strand being smoothed. The
 * guard measures point-to-*segment*, so a coarser polyline costs only its
 * sagitta — about 0.001 world units on a hand-drawn loop, against a minimum gap
 * of 0.225 — while the cost of a round is dominated by exactly this number.
 */
const OBSTACLE_SAMPLES = 120;
const SMOOTH_MAX = 0.4; // the top of the dial, and the one place that number lives

/**
 * How hard strands shove each other apart, ramped in with the dial. At the
 * bottom this is 0 and Smooth is pure local tidying that leaves everything
 * where you drew it. At the top the strands actively get out of each other's
 * way, which is the only thing that can flatten a crossing — the hop *is* what
 * holds two strands apart, so nothing can remove it until distance does that
 * job instead. See smoothen.md.
 *
 * Squared rather than linear so the bottom of the dial stays honestly local —
 * and cheap, since shoving costs two all-pairs distance sweeps per round.
 */
const spreadAt = (amount) => Math.min(1, Math.max(0, amount / SMOOTH_MAX)) ** 2;

/**
 * How close smoothing may bring two strand centre-lines. Tubes touch at 2× the
 * radius and a crossing is drawn at 4×, so 3× leaves visible daylight in a
 * crossing without freezing the flow the moment it meets one.
 */
const smoothGap = (radius) => 3 * radius;

const sameStrands = (ids, list) => ids.size === list.length && list.every((id) => ids.has(id));

/** A curve as smooth.js wants it: a dense world-space polyline off the spline
 *  you are actually looking at, not its sparse control polygon. */
function densePath(curve, samples = SMOOTH_SAMPLES) {
  const pts = sampleCurve(curve, samples).map((v) => [v.x, v.y, v.z]);
  if (curve.closed && pts.length) pts.push(pts[0]); // obstacles need the seam
  return pts;
}

/** Take hold of the selection and put the dial where the user can reach it. */
function beginSmooth() {
  const picked = [...selection].map((id) => model.get(id)).filter(Boolean);
  if (!picked.length) {
    return flashStatus('select a strand first — smoothing works on what you pick');
  }
  record(); // clears any previous session, and makes this one a single undo step
  smoothing = {
    ids: picked.map((c) => c.id),
    was: new Map(picked.map((c) => [c.id, structuredClone(c.points)])),
  };
  applySmooth();
  smoothSwatch.show();
}

/** Rebuild the selection at the current amount, always from how it was. */
function applySmooth() {
  if (!smoothing) return;
  for (const [id, points] of smoothing.was) {
    const curve = model.get(id);
    if (curve) curve.points = structuredClone(points);
  }

  const spread = spreadAt(smoothAmount);
  // Strands are done one at a time, each against the others as they currently
  // stand — so the first one moves before the others know about it. Once they
  // are shoving each other that lopsidedness shows, and the fix is simply to go
  // round again: the first strand gets its second go against neighbours that
  // have now moved too. Three sweeps takes the linked-triangles case from
  // "barely changed" to flat. Only worth paying for when there is shoving.
  const sweeps = 1 + Math.round(2 * spread);

  let held = 0;
  let done = 0;
  for (let sweep = 0; sweep < sweeps; sweep++) {
    held = 0;
    done = 0;
    for (const id of smoothing.ids) {
      const curve = model.get(id);
      if (!curve || curve.points.length < 3 || smoothAmount <= 0) continue;
      const dense = densePath(curve);
      if (curve.closed) dense.pop(); // it is the strand now, not an obstacle
      if (dense.length < 4) continue;

      const result = smooth(dense, {
        closed: curve.closed,
        amount: smoothAmount,
        obstacles: model.curves
          .filter((c) => c !== curve)
          .map((c) => densePath(c, OBSTACLE_SAMPLES))
          .filter((p) => p.length > 1),
        minGap: smoothGap(curve.radius ?? DEFAULT_RADIUS),
        spread,
      });
      if (result.points.length >= (curve.closed ? 3 : 2)) curve.points = result.points;
      held += result.blocked;
      done++;
    }
  }

  refresh();
  const n = smoothing.ids.length;
  const what = `<b>${n}</b> strand${n === 1 ? '' : 's'}`;
  if (!done) return flashStatus(`${what} &nbsp;&middot;&nbsp; back to how you drew ${n === 1 ? 'it' : 'them'}`);
  flashStatus(
    `smoothed ${what} &nbsp;&middot;&nbsp; ${held ? 'held back where they cross' : 'slide to taste'}`,
  );
}

// Rebuilding tube geometry is not free, and the slider fires all the way
// through a drag; coalesce to one rebuild per frame, like the eraser does.
let smoothQueued = false;
function queueSmooth() {
  if (!smoothing || smoothQueued) return;
  smoothQueued = true;
  requestAnimationFrame(() => {
    smoothQueued = false;
    applySmooth();
  });
}

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
btn('btn-smooth').addEventListener('click', beginSmooth);
btn('btn-delete').addEventListener('click', deleteSelected);
btn('btn-clear').addEventListener('click', clearAll);
btn('btn-help').addEventListener('click', () => helpEl.classList.toggle('hidden'));
btn('btn-save').addEventListener('click', saveScene);
btn('btn-open').addEventListener('click', () => btn('file-input').click());
btn('file-input').addEventListener('change', (ev) => {
  openFiles([...ev.target.files]);
  ev.target.value = ''; // so picking the same file twice still fires
});
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
    } else if (k === 's') {
      ev.preventDefault(); // or the browser offers to save the page
      saveScene();
    } else if (k === 'o') {
      ev.preventDefault();
      btn('file-input').click();
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
  else if (k === 'm' || k === 'M') beginSmooth();
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

// The dose, as a fraction of the strand's own length — scale-free, so it means
// the same thing however big you drew and whatever the zoom.
const smoothSwatch = sizeSwatch(
  btn('sw-smooth'),
  {
    min: 0, // all the way down is the strand exactly as it was drawn
    max: SMOOTH_MAX,
    step: 0.01,
    value: smoothAmount,
    label: 'Amount',
    format: (v) => `${Math.round(v * 100)}%`,
  },
  (v) => {
    smoothAmount = v;
    queueSmooth();
  },
);

const eraseSizeSwatch = sizeSwatch(
  btn('sw-erase-size'),
  { min: 6, max: 90, step: 2, value: eraserRadius, format: (r) => `${r}px` },
  (r) => setEraserRadius(r),
);

/** Move the dial from outside the panel — the keyboard, or a test. */
function setSmooth(v) {
  smoothSwatch.set(v);
  smoothAmount = smoothSwatch.get();
  applySmooth();
}

// ---------- the shape library, and export ----------

menuSwatch(
  btn('sw-export'),
  [
    {
      title: 'Export a copy',
      items: [
        { id: 'obj', title: 'Wavefront OBJ', note: '.obj' },
        { id: 'vect', title: 'Geomview VECT', note: '.vect' },
      ],
    },
  ],
  (id) => {
    if (!model.curves.length) return flashStatus('nothing to export yet');
    const name = suggestName();
    if (id === 'obj') download(`${name}.obj`, toOBJ(model.curves), 'text/plain');
    else download(`${name}.vect`, toVECT(model.curves), 'text/plain');
    flashStatus(`exported as <b>${id.toUpperCase()}</b> &nbsp;&middot;&nbsp; curves only, no thickness`);
  },
);

// The library is fetched once, the first time you open the picker — the shapes
// themselves are separate chunks, so none of this is in the initial bundle.
const KINDS = [
  ['shape', 'Shapes'],
  ['knot', 'Knots'],
  ['link', 'Links'],
];

const shapeGroups = KINDS.map(([kind, title]) => ({
  title,
  items: LIBRARY_INDEX.shapes
    .filter((s) => s.kind === kind)
    .map((s) => ({ id: s.file, title: s.title, note: s.note })),
})).filter((g) => g.items.length);

// menuSwatch binds the button's click itself, so there is nothing more to wire.
menuSwatch(btn('btn-library'), shapeGroups, loadShape);

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
globalThis.knot = { model, viewer, refresh, setTool, setSelection, undo, redo, frameAll, smoothen: beginSmooth, setSmooth };
