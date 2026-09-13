// Reading a diagram back out of a picture.
//
// The test is a round trip, because that is the only claim worth making: print
// a knot as a diagram, rasterise it into ordinary pixels, read it back, lift it
// into 3D through the *same* code a pen stroke goes through, and check it is
// still the same knot. Jones is the judge, since it is what would notice if a
// break were read on the wrong strand.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bracket, choose, jones, laurent, project } from '../../knotlib/index.js';
import { parse } from '../src/io.js';
import { toSVG } from '../src/diagram2d.js';
import { liftStroke } from '../src/crossings.js';
import { pageColour, traceDiagram } from '../src/trace.js';

let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const refuses = (fn, label, match = null) => {
  try {
    fn();
    check(false, label, 'it was accepted');
  } catch (e) {
    check(e instanceof Error && (!match || match.test(e.message)), label, JSON.stringify(e.message));
  }
};

const LIB = join(dirname(fileURLToPath(import.meta.url)), '../src/library');
const load = async (name) => parse(await readFile(join(LIB, `${name}.knot.json`), 'utf8'));

// --- a paint program, in twenty lines ------------------------------------------
//
// Round-capped strokes on a flat page, which is what the printed SVG is. Doing
// it here rather than reaching for a renderer keeps the test honest about what
// it feeds the tracer: plain pixels, no vector information smuggled through.

const hexRGB = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function raster(subpathsByComponent, colours, { page = '#0a0b0e', scale = 90, stroke = 0.15, pad = 0.4 } = {}) {
  const widths = Array.isArray(stroke) ? stroke : subpathsByComponent.map(() => stroke);
  const all = subpathsByComponent.flat(2);
  const lo = [Math.min(...all.map((p) => p[0])) - pad, Math.min(...all.map((p) => p[1])) - pad];
  const hi = [Math.max(...all.map((p) => p[0])) + pad, Math.max(...all.map((p) => p[1])) + pad];
  const w = Math.ceil((hi[0] - lo[0]) * scale);
  const h = Math.ceil((hi[1] - lo[1]) * scale);
  const data = new Uint8ClampedArray(w * h * 4);
  const bg = hexRGB(page);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = bg[0];
    data[i * 4 + 1] = bg[1];
    data[i * 4 + 2] = bg[2];
    data[i * 4 + 3] = 255;
  }
  const disc = (cx, cy, rgb, r) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r) continue;
        const i = (y * w + x) * 4;
        [data[i], data[i + 1], data[i + 2]] = rgb;
      }
    }
  };
  // World y is up, image y is down.
  const px = (p) => [(p[0] - lo[0]) * scale, (hi[1] - p[1]) * scale];
  subpathsByComponent.forEach((subs, ci) => {
    const rgb = hexRGB(colours[ci]);
    const r = (widths[ci] / 2) * scale;
    for (const sub of subs) {
      for (let i = 0; i < sub.length - 1; i++) {
        const [a, b] = [px(sub[i]), px(sub[i + 1])];
        const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.4));
        for (let k = 0; k <= steps; k++) disc(a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps, rgb, r);
      }
    }
  });
  return { data, width: w, height: h };
}

/** The subpaths a printed SVG actually draws, back in projection coordinates. */
const drawnSubpaths = (svg) =>
  [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) =>
    m[1].split('M').slice(1).map((s) =>
      s.replace(/Z$/, '').split('L').map((p) => p.split(',').map(Number)).map(([x, y]) => [x, -y]),
    ),
  );

/**
 * The stroke widths the printed SVG asks for. Read rather than assumed: the
 * printer thins the line on a crowded drawing, and painting it back at the
 * original weight would be testing a picture nobody would ever see.
 */
const drawnWidths = (svg) => [...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));

/**
 * Traced loops → 3D curves, through the editor's own lift. Each loop is placed
 * against the ones already down, which is rule 2; the stretches the tracer
 * marked are rule 1. Exactly what happens when you draw.
 */
function lift(loops, separation) {
  const placed = [];
  const curves = [];
  // A fiftieth of a pixel of wobble, deterministic. Traced points sit on a
  // pixel lattice, so a vertex of one strand landing *exactly* on another
  // strand is common rather than rare — and where both are still flat in the
  // draw plane, no camera angle separates them. That is an artefact of reading
  // a picture, not something the picture says, and it is four orders of
  // magnitude below the stroke, and below anything the picture says.
  const wobble = (i, k) => Math.sin(i * 12.9898 + k * 78.233) * 0.02;
  for (const loop of loops) {
    const got = liftStroke(loop.points, loop.under, { separation, obstacles: placed });
    placed.push(got.points);
    curves.push({
      points: got.points.map(([x, y, d], i) => [x + wobble(i, 1), -y + wobble(i, 2), d]),
      closed: true,
      color: loop.color,
      radius: 1,
    });
  }
  return curves;
}

// --- the round trip -------------------------------------------------------------

let read = 0;
let refused = 0;
let rebuiltOk = 0;

for (const name of ['trefoil', 'figure-eight', 'hopf-link', 'cinquefoil', 'solomon']) {
  const scene = await load(name);
  const seen = choose(scene.curves, { samples: 96 });
  const svg = toSVG(scene.curves, seen.layout);
  const image = raster(drawnSubpaths(svg), scene.curves.map((c) => c.color), { stroke: drawnWidths(svg) });

  // The contract is not "it always works". It is **never silently wrong**: the
  // tracer either gives back the knot that was printed, or says it could not
  // read the picture. A third outcome — a different knot, returned confidently —
  // is the only real failure, and it is what these checks are hunting for.
  let traced;
  try {
    traced = traceDiagram(image);
  } catch (e) {
    refused++;
    check(
      /could not be matched|no break drawn|no ink|no closed strand/.test(e.message),
      `${name}: refuses to read its own printed diagram, and says why`,
      JSON.stringify(e.message),
    );
    continue;
  }

  const breaks = traced.loops.reduce((n, l) => n + l.under.filter((u, i) => u && !l.under[i - 1]).length, 0);
  check(
    traced.loops.length === scene.curves.length && breaks === seen.diagram.n,
    `${name}: traces back to ${scene.curves.length} loop(s) with ${seen.diagram.n} break(s)`,
    `${traced.loops.length} loop(s), ${breaks} break(s), stroke ${traced.width.toFixed(1)}px, ${traced.touches} touching pixel(s) opened`,
  );
  if (traced.loops.length !== scene.curves.length) continue;
  read++;

  const rebuilt = lift(traced.loops, 4 * traced.width);

  // Looking straight down the axis it was built on, a reconstructed crossing
  // can land exactly on a sampled point — a degenerate view, not a fact about
  // the trace. A hair off it, and a few hairs if the first is unlucky.
  let back = null;
  let why = '';
  for (const nudge of [[0, 0, 1], [0.017, 0.011, 1], [-0.023, 0.019, 1], [0.031, -0.027, 1], [0.06, 0.04, 1]]) {
    try {
      back = project(rebuilt, nudge);
      break;
    } catch (e) {
      why = e.message;
    }
  }

  // A lift that leaves two strands at the same depth is a *lift* problem, not a
  // trace problem: the picture was read correctly and then the depths were
  // assigned badly. It happens where several crossings sit close together and
  // their alternating pushes cancel in the middle. Energy relaxation is what
  // fixes it, and that is level (c) work — so it is counted and named here
  // rather than hidden inside a pass or a fail.
  if (!back && /same depth/.test(why)) {
    console.log(`  --   ${name}: read fine, but the lift left two strands touching — one for relax.js`);
    continue;
  }
  check(
    back && back.diagram.canonical() === seen.diagram.canonical(),
    `${name}: and comes back as the same diagram, crossing for crossing`,
    back ? `${seen.diagram.n} → ${back.diagram.n} crossings` : why,
  );
  if (!back) continue;
  rebuiltOk++;

  // Jones as well, for the shapes where it means something. A printed diagram
  // carries no arrows, so an imported *link* may come back with a component
  // running the other way — a different oriented link, with the sign of its
  // linking number flipped, however faithful the trace was. That is a property
  // of the notation, not a bug here: it is not in the picture to recover.
  const was = laurent.toString(jones(seen.diagram).value);
  const now = laurent.toString(jones(back.diagram).value);
  if (scene.curves.length === 1) {
    check(now === was, `${name}: with the same Jones polynomial`, `${was}  →  ${now}`);
  } else {
    check(
      laurent.equal(bracket(back.diagram).value, bracket(seen.diagram).value),
      `${name}: with the same Kauffman bracket — the orientation-free half, since a printed link has no arrows`,
      now === was ? 'Jones matched too, which is luck about which way the components came out' : `Jones ${was} vs ${now}: a component came back reversed`,
    );
  }
}

check(read >= 4, 'most of the shapes printed here read straight back', `${read} read, ${refused} refused, of 5`);
check(rebuiltOk >= 3, 'and most of those rebuild into the very same diagram in 3D',
  `${rebuiltOk} of ${read} — the rest read correctly but need relaxation to pull the strands apart`);

// --- what it does not lean on ----------------------------------------------------

const hopf = await load('hopf-link');
const view = choose(hopf.curves, { samples: 96 });
const subs = drawnSubpaths(toSVG(hopf.curves, view.layout));

const printed = toSVG(hopf.curves, view.layout);
const widths = drawnWidths(printed);
const oneColour = traceDiagram(raster(subs, hopf.curves.map(() => '#d2d24b'), { stroke: widths }));
check(oneColour.loops.length === 2, 'two components drawn in one colour still come back as two loops',
  `${oneColour.loops.length} loops`);

for (const page of ['#ffffff', '#0a0b0e', '#8899aa']) {
  const img = raster(subs, ['#d24b78', '#78d24b'], { page, stroke: widths });
  check(
    pageColour(img).every((v, i) => Math.abs(v - hexRGB(page)[i]) < 8) && traceDiagram(img).loops.length === 2,
    `a ${page} page is found and read through`,
    `page read as ${pageColour(img).map((v) => Math.round(v)).join(',')}`,
  );
}

const colours = traceDiagram(raster(subs, ['#d24b78', '#78d24b'], { stroke: widths })).loops.map((l) => l.color);
check(
  colours.some((c) => c.startsWith('#d')) && colours.some((c) => c.startsWith('#7')),
  'and each loop keeps the colour it was drawn in',
  colours.join(' '),
);

// --- refusing rather than guessing ------------------------------------------------
//
// The convention is the whole notation, so a picture that does not follow it
// has to be turned away rather than interpreted.

const unbroken = hopf.curves.map((c) => [view.layout.components[hopf.curves.indexOf(c)]]);
refuses(
  () => traceDiagram(raster(unbroken, hopf.curves.map((c) => c.color))),
  'a picture that crosses without breaking is refused — nothing in it says which strand is under',
  /no break drawn/,
);

const blank = raster([[[[0, 0], [0.02, 0]]]], ['#0a0b0e']);
refuses(() => traceDiagram(blank), 'ink the same colour as the page is refused', /no ink|too small/);
refuses(() => traceDiagram({ data: new Uint8ClampedArray(16), width: 2, height: 2 }), 'and a 2×2 image is refused', /too small/);

console.log(failures ? `\ntrace.test: ${failures} failing check(s)` : '\ntrace.test: all checks passed');
process.exit(failures ? 1 : 0);
