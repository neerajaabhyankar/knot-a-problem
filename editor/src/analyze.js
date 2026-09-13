// The Analyze panel: what the scene is, mathematically.
//
// Everything here is a thin wrapper round knotlib — this file chooses a
// projection, formats the answer, and owns some DOM. It contains no knot
// theory, deliberately: if a number looks wrong the bug is one directory over,
// where it can be tested without a browser.
//
// The default view is **the one you are looking at**, because a crossing is a
// property of a projection and the projection you care about is the one on
// screen. "Clearest view" searches instead, and says how many it tried.

import {
  BRACKET_LIMIT,
  DegenerateProjection,
  choose,
  fingerprint,
  jones,
  laurent,
  linking,
  project,
  roundness,
  simplify,
  survey,
} from '../../knotlib/index.js';
import { toSVG } from './diagram2d.js';
import { suggestName } from './io.js';
import { traceDiagram } from './trace.js';

const SAMPLES = 64;

/**
 * Read the scene, from one direction or from the best of many.
 *
 * Open arcs are set aside rather than refused: half a drawing is often closed,
 * and "3 of 4 strands are still open" is a more useful answer than nothing.
 */
export function analyse(allCurves, { direction = null, samples = SAMPLES } = {}) {
  const curves = allCurves.filter((c) => c.closed);
  const skipped = allCurves.length - curves.length;
  if (!curves.length) {
    return { ok: false, skipped, reason: allCurves.length ? 'every strand here is an open arc — an arc has no knot type' : 'nothing drawn yet' };
  }

  let got;
  let nudged = 0;
  if (direction) {
    try {
      got = { ...project(curves, direction), tried: 1, usable: 1, flat: 0, squashed: false };
    } catch (e) {
      if (!(e instanceof DegenerateProjection)) throw e;
      got = nudge(curves, direction, e);
      if (!got) return { ok: false, skipped, curves, degenerate: true, reason: e.message };
      nudged = got.nudged;
    }
  } else {
    try {
      got = choose(curves, { samples });
    } catch (e) {
      if (!(e instanceof DegenerateProjection)) throw e;
      return { ok: false, skipped, curves, degenerate: true, reason: e.message };
    }
  }

  const { diagram: D, layout } = got;
  const report = {
    ok: true,
    skipped,
    curves,
    diagram: D,
    layout,
    direction: got.direction,
    tried: got.tried,
    usable: got.usable,
    flat: got.flat,
    squashed: got.squashed,
    roundness: layout.roundness,
    nudged,
    crossings: D.n,
    components: D.componentCount(),
    loops: D.loops,
    faces: D.faces().map((f) => f.length).sort((a, b) => a - b),
    writhe: D.writhe(),
    linking: [],
    jones: null,
    chiral: null,
    fingerprint: null,
    moves: {},
    simplify: null,
  };

  const lk = linking(D).value;
  for (let i = 0; i < lk.length; i++) {
    for (let j = i + 1; j < lk.length; j++) report.linking.push({ a: i, b: j, value: lk[i][j] });
  }

  try {
    const v = jones(D).value;
    report.jones = laurent.toString(v);
    report.chiral = !laurent.equal(v, laurent.reflect(v));
    report.fingerprint = fingerprint(D);
  } catch (e) {
    report.jones = null;
    report.jonesWhy = e.message;
  }

  for (const kind of ['R1', 'R2', 'R3']) {
    const all = survey(D).filter((m) => m.kind === kind);
    report.moves[kind] = {
      total: all.length,
      available: all.filter((m) => m.available).length,
      reasons: [...new Set(all.filter((m) => !m.available).map((m) => m.reason))],
    };
  }

  const run = simplify(D);
  report.simplify = {
    from: D.n,
    to: run.diagram.n,
    applied: run.applied,
    loops: run.diagram.loops,
    held: run.applied.length ? fingerprint(run.diagram) === report.fingerprint : true,
  };
  return report;
}

/**
 * Some ways of failing are about the *view*, and some are only about where the
 * points happened to land. A ring seen edge-on has no diagram from any nearby
 * angle and should be reported as such. A crossing sitting exactly on a sampled
 * vertex, or two crossings landing on the same pixel, is an accident of
 * discretisation — a fraction of a degree away the picture is the same picture
 * and the diagram is fine. Looking straight down a trefoil's own axis hits
 * exactly that, and refusing there would be pedantry rather than honesty.
 */
const ACCIDENTAL = /vertex|same point|straight through/;
const NUDGES = [0.4, -0.4, 0.9, -0.9, 2, -2];

function nudge(curves, direction, why) {
  if (!ACCIDENTAL.test(why.message)) return null;
  const [x, y, z] = direction;
  for (const degrees of NUDGES) {
    const a = (degrees * Math.PI) / 180;
    // A small turn about whichever axis the direction leans on least.
    const spun = Math.abs(z) < 0.9
      ? [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z]
      : [x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a)];
    try {
      return { ...project(curves, spun), tried: 1, usable: 1, flat: 0, squashed: false, nudged: Math.abs(degrees) };
    } catch (e) {
      if (!(e instanceof DegenerateProjection)) throw e;
    }
  }
  return null;
}

// ---------------------------------------------------------------- the panel --

const esc = (s) => String(s).replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'));
const row = (label, value, note = '') =>
  `<div class="a-row"><span>${label}</span><b>${esc(value)}</b>${note ? `<i>${esc(note)}</i>` : ''}</div>`;

function body(r) {
  if (!r.ok) {
    return `<p class="a-note">${esc(r.reason)}</p>${
      r.degenerate
        ? '<p class="a-note">A crossing is a property of a projection, not of a curve. Orbit a little, or ask for the clearest view.</p>'
        : ''
    }`;
  }

  const dir = r.direction.map((v) => v.toFixed(2)).join(', ');
  const parts = [];

  parts.push(`<h3>View</h3>`);
  parts.push(row('Looking along', `[${dir}]`, r.nudged ? `turned ${r.nudged}° — dead on, a crossing sat exactly on a point` : ''));
  if (r.tried > 1) parts.push(row('Directions tried', `${r.usable} of ${r.tried} usable`, r.flat ? `${r.flat} too flat to read` : ''));
  parts.push(row('Readability', r.roundness.toFixed(2), r.squashed ? 'no rounder view exists' : ''));
  if (r.skipped) parts.push(row('Set aside', `${r.skipped} open arc${r.skipped === 1 ? '' : 's'}`, 'an arc has no knot type'));

  parts.push(`<h3>Diagram</h3>`);
  parts.push(row('Crossings', r.crossings));
  parts.push(row('Components', r.components, r.loops ? `${r.loops} with no crossings` : ''));
  parts.push(row('Faces', r.faces.join(', '), 'degree of each'));

  parts.push(`<h3>Invariants</h3>`);
  parts.push(row('Writhe', r.writhe, 'not a knot invariant — a kink changes it'));
  for (const l of r.linking) parts.push(row(`Linking ${l.a + 1}–${l.b + 1}`, l.value));
  if (r.jones) {
    parts.push(row('Jones', r.jones, 'in A; V(t) has t = A⁻⁴'));
    parts.push(row('Chirality', r.chiral ? 'differs from its mirror' : 'this polynomial cannot tell it from its mirror'));
  } else {
    parts.push(row('Jones', 'not computed', `over ${BRACKET_LIMIT} crossings`));
  }

  parts.push(`<h3>Reidemeister moves</h3>`);
  for (const kind of ['R1', 'R2', 'R3']) {
    const m = r.moves[kind];
    if (!m.total) {
      parts.push(row(kind, 'no such face'));
      continue;
    }
    parts.push(row(kind, `${m.available} of ${m.total}`, m.reasons.join('; ')));
  }
  const s = r.simplify;
  parts.push(
    row(
      'Simplify',
      s.applied.length ? `${s.from} → ${s.to}` : 'nothing to remove',
      s.applied.length ? `${s.applied.join(', ')} · fingerprint ${s.held ? 'held' : 'CHANGED — a bug'}` : 'greedy R1/R2 only, not a claim of minimality',
    ),
  );
  return parts.join('');
}

/**
 * Wire the button, the panel and the two things it can do.
 *
 * `deps` is what this module is not allowed to reach for itself: the scene, the
 * camera, and the editor's own download and insert paths. Keeping them
 * injected is what lets `analyse()` above stay testable in node.
 */
export function setupAnalyze({ curves, forward, download, insert, flash, defaultRadius, defaultColor }) {
  const panel = document.getElementById('analyze');
  const bodyEl = document.getElementById('analyze-body');
  const button = document.getElementById('btn-analyze');
  const fileInput = document.getElementById('analyze-file');

  let mode = 'camera'; // or 'search'
  let latest = null;
  let open = false;

  function run() {
    const report = analyse(curves(), { direction: mode === 'camera' ? forward() : null });
    latest = report;
    bodyEl.innerHTML = body(report);
    panel.querySelector('#analyze-print').disabled = !report.ok;
    return report;
  }

  let queued = null;
  const invalidate = () => {
    if (!open) return;
    clearTimeout(queued);
    queued = setTimeout(run, 220);
  };

  function show(next = true) {
    open = next;
    panel.hidden = !open;
    button.classList.toggle('active', open);
    if (open) run();
  }

  button.addEventListener('click', () => show(!open));
  panel.querySelector('#analyze-close').addEventListener('click', () => show(false));
  for (const b of panel.querySelectorAll('[data-view]')) {
    b.addEventListener('click', () => {
      mode = b.dataset.view;
      for (const other of panel.querySelectorAll('[data-view]')) other.classList.toggle('on', other === b);
      run();
    });
  }

  function print() {
    const r = latest?.ok ? latest : run();
    if (!r.ok) {
      flash(esc(r.reason));
      return null;
    }
    const page = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0a0b0e';
    const name = suggestName();
    const svg = toSVG(r.curves, r.layout, { background: page, title: name });
    download(`${name}.svg`, svg, 'image/svg+xml');
    flash(`printed <b>${r.crossings}</b> crossing diagram`);
    return svg;
  }
  panel.querySelector('#analyze-print').addEventListener('click', print);

  async function importDiagram(file) {
    const pixels = await readPixels(file);
    let traced;
    try {
      traced = traceDiagram(pixels, { defaultColor });
    } catch (e) {
      flash(esc(e.message));
      return 0;
    }
    insert(traced, file.name);
    return traced.loops.length;
  }
  panel.querySelector('#analyze-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const [file] = fileInput.files ?? [];
    fileInput.value = '';
    if (file) await importDiagram(file);
  });

  return { run, print, importDiagram, show, isOpen: () => open, invalidate, latest: () => latest, mode: () => mode,
    setMode(next) {
      const b = panel.querySelector(`[data-view="${next}"]`);
      if (!b) throw new Error(`no such view mode: ${next}`);
      b.click();
      return mode;
    } };
}

/** An image file as raw pixels. The browser does the decoding; we only measure. */
async function readPixels(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return ctx.getImageData(0, 0, w, h);
}
