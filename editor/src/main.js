// Glue: tools, pointer handling, keyboard, undo, render loop.

import { Scene } from './model.js';
import { Viewer, TUBE_RADIUS, vec3 } from './viewer.js';
import { EraseSession } from './eraser.js';
import { liftPath } from './crossings.js';
import { dedupe, simplifyStroke } from './simplify.js';

const canvas = document.getElementById('view');
const statusEl = document.getElementById('status');
const helpEl = document.getElementById('help');
const eraserCursor = document.getElementById('eraser-cursor');
const btn = (id) => document.getElementById(id);

const model = new Scene();
const viewer = new Viewer(canvas);

// Select is home. Draw stays armed across pen lifts until the strand closes.
let tool = 'select';
let selection = new Set();

let draft = null; // { strokes: [[px,py][]], current } while drawing
let erase = null;
let extending = null; // { curveId, end, anchor, points }
let downAt = null; // to tell a click apart from an orbit drag
let eraserRadius = 20;

const CLICK_SLOP = 5; // px of movement still counted as a click
const CLOSE_SLOP = 26; // px from the strand's start that counts as closing it
const MIN_STROKE = 7; // px of travel before a drag counts as a stroke at all

// How far apart strands sit at a crossing, in world units. Fixed, not scaled to
// how big you drew: a knot diagram is flat apart from a small hop at each
// crossing, and the hop should always read the same. Centre-to-centre is two
// tube diameters, so the strands clear each other by a full strand thickness.
const CROSSING_CLEARANCE = 4 * TUBE_RADIUS;

/** Half the clearance, converted to the pixel units the lift works in. */
function liftHeight() {
  return CROSSING_CLEARANCE / 2 / viewer.worldPerPixel();
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
  cancelDraft();
  setSelection([]);
  refresh();
  flashStatus('undo');
}

function redo() {
  if (!future.length) return;
  past.push(model.toJSON());
  model.restore(future.pop());
  cancelDraft();
  setSelection([]);
  refresh();
  flashStatus('redo');
}

function updateHistoryButtons() {
  btn('btn-undo').disabled = past.length === 0;
  btn('btn-redo').disabled = future.length === 0;
}

// ---------- tools ----------

function setTool(next) {
  if (next !== 'draw') cancelDraft();
  tool = next;
  viewer.setTool(next);
  for (const b of document.querySelectorAll('#toolbar .tool')) {
    b.classList.toggle('active', b.dataset.tool === next);
  }
  btn('sc-erase').hidden = next !== 'erase';
  btn('sc-draw').hidden = next !== 'draw';
  btn('sc-drag').textContent = next === 'select' ? 'orbit' : next;
  eraserCursor.hidden = next !== 'erase';
  eraserCursor.classList.toggle('disabled', next === 'erase' && selection.size === 0);
  if (next === 'draw') draft = { strokes: [], current: null };
  viewer.updatePierceMarkers(model);
  updateStatus();
}

function setSelection(ids) {
  selection = new Set(ids);
  viewer.setSelection(selection);
  selection = viewer.selection; // viewer drops ids that no longer exist
  viewer.updateHandles(model);
  btn('btn-delete').disabled = selection.size === 0;
  eraserCursor.classList.toggle('disabled', tool === 'erase' && selection.size === 0);
  updateStatus();
}

/** Rebuild meshes and markers after any change to the model. */
function refresh() {
  viewer.syncCurves(model);
  viewer.updatePierceMarkers(model);
  setSelection(selection);
  updateHistoryButtons();
}

function updateStatus() {
  const n = model.curves.length;
  const count = `<b>${n}</b> curve${n === 1 ? '' : 's'}`;

  let hint;
  if (tool === 'draw') {
    const k = draft?.strokes.length ?? 0;
    hint = k
      ? `<b>${k}</b> stroke${k === 1 ? '' : 's'} · lift the pen to go under · finish at the start to close`
      : 'draw · lift the pen where the strand goes under';
  } else if (tool === 'erase') {
    hint = selection.size
      ? `rub to erase from <b>${selection.size}</b> selected · size <b>${eraserRadius}</b>px`
      : 'select a strand first — the eraser only touches what you pick';
  } else if (extending) {
    hint = 'extending the strand';
  } else if (selection.size) {
    hint = `<b>${selection.size}</b> selected · drag an end to continue it · Del to remove`;
  } else if (n === 0) {
    hint = 'press <b>D</b> and sweep a loop';
  } else if (n === 1) {
    hint = 'orbit 90&deg;, press <b>D</b>, then draw around <b>one</b> pink dot';
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

// ---------- drawing: many strokes, one strand ----------
//
// Each pen-down stroke is one piece of the strand. The gap where you lifted the
// pen becomes a bridge that dips underneath whatever it crosses. The strand is
// finished when a stroke ends back at the very start.

/** Straight run of points across a pen-up gap. */
function bridgePoints(from, to) {
  const dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const steps = Math.max(4, Math.ceil(dist / 12));
  return Array.from({ length: steps - 1 }, (_, i) => {
    const f = (i + 1) / steps;
    return [from[0] + f * (to[0] - from[0]), from[1] + f * (to[1] - from[1])];
  });
}

/**
 * Splice the strokes into one path, remembering which points are bridges.
 * Strokes are simplified individually — simplifying the concatenation would
 * smooth the bridges away, and the bridges are the whole point.
 */
function assemble(strokes, includeCurrent = null) {
  const all = includeCurrent ? [...strokes, includeCurrent] : strokes;
  const pts = [];
  const isBridge = [];

  all.forEach((raw, i) => {
    const simplified = simplifyStroke(dedupe(raw, 2), 6, 4);
    if (i > 0 && pts.length) {
      for (const b of bridgePoints(pts[pts.length - 1], simplified[0])) {
        pts.push(b);
        isBridge.push(true);
      }
    }
    for (const p of simplified) {
      pts.push(p);
      isBridge.push(false);
    }
  });

  return { pts, isBridge };
}

function draftPreview() {
  const { pts } = assemble(draft.strokes, draft.current);
  if (pts.length < 2) return;
  const world = pts.map(([x, y]) => viewer.unproject(x, y)).filter(Boolean);
  viewer.showPreview(world, false);
}

function cancelDraft() {
  draft = tool === 'draw' ? { strokes: [], current: null } : null;
  viewer.clearPreview();
}

function endStrokePiece() {
  const raw = dedupe(draft.current, 2);
  draft.current = null;
  // Judge by travel, not point count — a Shift-straightened stroke is two points.
  if (raw.length < 2 || pathLength(raw) < MIN_STROKE) {
    draftPreview();
    return; // a click, not a stroke
  }

  draft.strokes.push(raw);

  // Finished when the strand comes back to where it started.
  const start = draft.strokes[0][0];
  const here = raw[raw.length - 1];
  if (draft.strokes.length > 0 && Math.hypot(here[0] - start[0], here[1] - start[1]) < CLOSE_SLOP) {
    commitDraft(true);
  } else {
    draftPreview();
    updateStatus();
  }
}

function commitDraft(closed) {
  if (!draft?.strokes.length) return;
  const { pts, isBridge } = assemble(draft.strokes);

  // Drop the duplicated seam point on a closed strand.
  if (closed && pts.length > 3) {
    pts.pop();
    isBridge.pop();
  }
  if (pts.length < (closed ? 3 : 2)) {
    cancelDraft();
    setTool('select');
    return;
  }

  const lifted = liftPath(pts, isBridge, closed, { height: liftHeight() });

  const points3 = padToThree(
    lifted.points
      .map(([x, y, d]) => viewer.unproject(x, y, d))
      .filter(Boolean)
      .map((v) => [v.x, v.y, v.z]),
  );

  cancelDraft();
  setTool('select');
  if (points3.length < 3) return;

  record();
  model.addCurve(points3, { closed });
  refresh();

  if (lifted.crossings) {
    const guessed = lifted.guessed
      ? ` (<b>${lifted.guessed}</b> left ambiguous — made alternating)`
      : '';
    flashStatus(
      `<b>${lifted.crossings}</b> crossing${lifted.crossings === 1 ? '' : 's'}${guessed} — orbit to check`,
    );
  }
}

// ---------- extending a strand from its end ----------

function beginExtend(handle, ev) {
  const curve = model.get(handle.curveId);
  if (!curve) return;
  const anchorPt = handle.end === 'start' ? curve.points[0] : curve.points[curve.points.length - 1];
  extending = {
    curveId: handle.curveId,
    end: handle.end,
    anchor: vec3(anchorPt),
    points: [[ev.clientX, ev.clientY]],
  };
  canvas.setPointerCapture(ev.pointerId);
  canvas.style.cursor = 'grabbing';
  updateStatus();
}

function extendMove(ev) {
  if (ev.shiftKey) extending.points = [extending.points[0], [ev.clientX, ev.clientY]];
  else extending.points.push([ev.clientX, ev.clientY]);
  const world = dedupe(extending.points, 4)
    .map(([x, y]) => viewer.unproject(x, y, 0, extending.anchor))
    .filter(Boolean);
  viewer.showPreview(world, false);
}

function endExtend() {
  const { curveId, end, anchor } = extending;
  const raw = dedupe(extending.points, 2);
  extending = null;
  viewer.clearPreview();
  canvas.style.cursor = 'default';

  const curve = model.get(curveId);
  if (!curve || raw.length < 2 || pathLength(raw) < MIN_STROKE) {
    updateStatus();
    return;
  }

  const simplified = simplifyStroke(raw, 6, 4);
  // The first point sits on the handle we grabbed; don't duplicate it.
  const tail = simplified.length > 2 ? simplified.slice(1) : simplified;
  if (tail.length < 2) {
    updateStatus();
    return;
  }

  const lifted = liftPath(tail, null, false, { height: liftHeight() });
  const added = lifted.points
    .map(([x, y, d]) => viewer.unproject(x, y, d, anchor))
    .filter(Boolean)
    .map((v) => [v.x, v.y, v.z]);
  if (added.length < 2) {
    updateStatus();
    return;
  }

  record();
  if (end === 'end') curve.points.push(...added);
  else curve.points.unshift(...added.reverse());

  // Reaching the strand's other end ties it into a loop.
  const otherEnd = end === 'end' ? curve.points[0] : curve.points[curve.points.length - 1];
  const [ox, oy] = viewer.project(vec3(otherEnd));
  const [nx, ny] = raw[raw.length - 1];
  if (Math.hypot(ox - nx, oy - ny) < CLOSE_SLOP) {
    curve.closed = true;
    if (end === 'end') curve.points.pop();
    else curve.points.shift();
    flashStatus('ends joined — the strand is a loop');
  }

  refresh();
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

// Grabbing an endpoint has to beat OrbitControls to the event. Its listener is
// on the canvas, so we intercept during the capture phase on the way down.
addEventListener(
  'pointerdown',
  (ev) => {
    // Shift is allowed through: it straightens the extension rather than panning.
    if (ev.button !== 0 || ev.target !== canvas || tool !== 'select') return;
    const handle = viewer.hitHandle(ev.clientX, ev.clientY);
    if (!handle) return;
    ev.stopPropagation();
    ev.preventDefault();
    beginExtend(handle, ev);
  },
  true,
);

canvas.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0) return;
  downAt = [ev.clientX, ev.clientY];
  if (tool === 'draw') {
    draft.current = [[ev.clientX, ev.clientY]];
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
  if (tool === 'select' && !extending) {
    canvas.style.cursor = viewer.hitHandle(ev.clientX, ev.clientY) ? 'grab' : 'default';
  }

  if (extending) extendMove(ev);
  else if (draft?.current) {
    // Shift collapses the stroke to a straight run from where it began.
    if (ev.shiftKey) draft.current = [draft.current[0], [ev.clientX, ev.clientY]];
    else draft.current.push([ev.clientX, ev.clientY]);
    draftPreview();
  } else if (erase) extendErase(ev);
});

canvas.addEventListener('pointerup', (ev) => {
  if (ev.button !== 0) return;
  const moved = downAt && Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]);
  downAt = null;

  if (extending) {
    canvas.releasePointerCapture(ev.pointerId);
    endExtend();
  } else if (draft?.current) {
    canvas.releasePointerCapture(ev.pointerId);
    endStrokePiece();
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
  extending = null;
  erase = null;
  downAt = null;
  if (draft) draft.current = null;
  viewer.clearPreview();
});

// Right-drag pans, so the context menu has to go.
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

// The draw plane moves with the camera; so do the pierce markers.
viewer.controls.addEventListener('change', () => viewer.updatePierceMarkers(model));

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
  updateStatus();
}

function frameAll() {
  viewer.frameAll(model);
  viewer.updatePierceMarkers(model);
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

addEventListener('keydown', (ev) => {
  if (ev.key === 'Shift') viewer.setPanModifier(true);

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
    extending = null;
    erase = null;
    viewer.clearPreview();
    if (tool !== 'select') setTool('select');
    else setSelection([]);
  } else if (k === 'Enter') {
    if (tool === 'draw' && draft?.strokes.length) commitDraft(false);
  } else if (k === 'd' || k === 'D' || k === '1') setTool('draw');
  else if (k === '2') setTool('select');
  else if (k === 'e' || k === 'E' || k === '3') setTool('erase');
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
  if (ev.key === 'Shift') viewer.setPanModifier(false);
});
addEventListener('blur', () => viewer.setPanModifier(false));

// ---------- go ----------

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
