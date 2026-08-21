// Build the shipped shape library.
//
// Every shape comes from an exact parametrisation and is written out as an
// ordinary `.knot.json` — the same file you would get by drawing it and hitting
// Save — so the editor needs no special loader for them. See io.md §6.
//
// Run with `npm run library`. The output is committed, so a plain `npm run
// build` never needs this script; `test/io.test.mjs` re-validates the shipped
// files, which is what catches drift.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { orient, serialize, stringify } from '../src/io.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '../src/library');

// Everything is normalised to this bounding-sphere radius, so a triangle and a
// trefoil arrive the same size as each other and as a hand-drawn loop.
const SIZE = 1.5;

// ---------- the palette, read back out of the stylesheet ----------
//
// style.css is the single source of stylistic truth, and a build script running
// in node can't call getComputedStyle the way theme.js does. Reading the file is
// the next best thing, and it keeps the invariant.

const css = await readFile(join(HERE, '../src/style.css'), 'utf8');
const PALETTE = [...css.matchAll(/--strand-(\d):\s*(#[0-9a-f]{6})/gi)]
  .sort((a, b) => +a[1] - +b[1])
  .map((m) => m[2]);
const RADIUS = Number(css.match(/--strand-radius:\s*([\d.]+)/)?.[1]);
if (PALETTE.length !== 9 || !(RADIUS > 0)) {
  throw new Error(`could not read the palette out of style.css (${PALETTE.length} colours, radius ${RADIUS})`);
}

// ---------- parametrisations ----------

const TAU = Math.PI * 2;
const sample = (n, f) => Array.from({ length: n }, (_, i) => f((i / n) * TAU, i));

/** A regular n-gon, sampled densely enough that the spline keeps its corners. */
const polygon = (sides, per = 34) => {
  const out = [];
  for (let k = 0; k < sides; k++) {
    const a = (k / sides) * TAU + Math.PI / 2;
    const b = ((k + 1) / sides) * TAU + Math.PI / 2;
    const p = [Math.cos(a), Math.sin(a), 0];
    const q = [Math.cos(b), Math.sin(b), 0];
    for (let i = 0; i < per; i++) {
      const t = i / per;
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, 0]);
    }
  }
  return out;
};

/**
 * A (p, q) curve on a torus. With `gcd(p, q) = 1` this is the (p, q) torus
 * knot; otherwise the family below uses it once per component.
 */
const torus = (p, q, phase = 0, n = 260, tube = 0.42) =>
  sample(n, (t) => {
    const theta = p * t;
    const phi = q * t + phase;
    const r = 1 + tube * Math.cos(phi);
    return [r * Math.cos(theta), r * Math.sin(theta), tube * Math.sin(phi)];
  });

/** The (p, q) torus link: `gcd(p, q)` components, evenly spaced round the tube. */
const torusLink = (p, q) => {
  const d = gcd(p, q);
  return Array.from({ length: d }, (_, k) => torus(p / d, q / d, (TAU * k) / d));
};

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/** The figure-eight knot, 4₁. */
const figureEight = (n = 300) =>
  sample(n, (t) => [
    (2 + Math.cos(2 * t)) * Math.cos(3 * t),
    (2 + Math.cos(2 * t)) * Math.sin(3 * t),
    Math.sin(4 * t),
  ]);

/** Borromean rings: three mutually perpendicular ellipses. */
const borromean = (n = 200, a = 1, b = 0.55) => [
  sample(n, (t) => [0, a * Math.cos(t), b * Math.sin(t)]),
  sample(n, (t) => [b * Math.sin(t), 0, a * Math.cos(t)]),
  sample(n, (t) => [a * Math.cos(t), b * Math.sin(t), 0]),
];

/** Two circles in perpendicular planes, each through the other — a Hopf link. */
const hopf = (n = 180, r = 1) => [
  sample(n, (t) => [r * Math.cos(t), r * Math.sin(t), 0]),
  sample(n, (t) => [r + r * Math.cos(t), 0, r * Math.sin(t)]),
];

/**
 * Turn a shape so that `view` becomes the direction you look down. Shapes are
 * stored the way they should first be seen, and a link made of perpendicular
 * rings has no axis-aligned view where every component reads as a ring — one of
 * them is always exactly edge-on, i.e. a straight line. A few degrees off-axis
 * fixes that, and costs nothing.
 */
const tilt = (parts, view) => {
  const n = Math.hypot(...view);
  const curves = parts.map((points) => ({ points }));
  return orient(curves, view.map((v) => v / n), [0, 0, 1]).map((c) => c.points);
};

// ---------- geometry helpers ----------

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function centreAndScale(components) {
  const all = components.flat();
  const c = [0, 1, 2].map((k) => {
    const vs = all.map((p) => p[k]);
    return (Math.min(...vs) + Math.max(...vs)) / 2;
  });
  const radius = Math.max(...all.map((p) => dist(p, c)));
  const f = SIZE / radius;
  return components.map((comp) => comp.map((p) => [0, 1, 2].map((k) => (p[k] - c[k]) * f)));
}

/**
 * Closest approach between two stretches that are not continuous with each
 * other. The self-exclusion window is measured in **arclength**, not point
 * indices, for the same reason the smoothing guard is: a polygon's corner is a
 * place where the strand genuinely doubles back on itself, and an index window
 * reads that as a self-intersection. Two points at arclength `s` either side of
 * a 60° corner sit exactly `s` apart, so a window of 2.5 × the clearance being
 * tested puts the first pair it *does* judge comfortably clear.
 */
function tightest(components, window) {
  let best = Infinity;
  for (const comp of components) {
    const n = comp.length;
    const cum = [0];
    for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + dist(comp[i - 1], comp[i % n]));
    const total = cum[n];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const along = cum[j] - cum[i];
        if (Math.min(along, total - along) < window) continue;
        best = Math.min(best, dist(comp[i], comp[j]));
      }
    }
  }
  // And between components.
  for (let a = 0; a < components.length; a++) {
    for (let b = a + 1; b < components.length; b++) {
      for (const p of components[a]) for (const q of components[b]) best = Math.min(best, dist(p, q));
    }
  }
  return best;
}

/** Gauss linking number, to check the links really are linked. */
function linking(A, B) {
  const cr = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  let sum = 0;
  for (let i = 0; i < A.length; i++) {
    const a0 = A[i], a1 = A[(i + 1) % A.length];
    const da = [a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]];
    for (let j = 0; j < B.length; j++) {
      const b0 = B[j], b1 = B[(j + 1) % B.length];
      const db = [b1[0] - b0[0], b1[1] - b0[1], b1[2] - b0[2]];
      const r = [0, 1, 2].map((k) => (b0[k] + b1[k]) / 2 - (a0[k] + a1[k]) / 2);
      const rn = Math.hypot(...r);
      const c = cr(da, db);
      sum += (c[0] * r[0] + c[1] * r[1] + c[2] * r[2]) / (rn * rn * rn);
    }
  }
  return sum / (4 * Math.PI);
}

// ---------- the catalogue ----------

const SHAPES = [
  { file: 'triangle', title: 'Triangle', kind: 'shape', parts: () => [polygon(3)] },
  { file: 'square', title: 'Square', kind: 'shape', parts: () => [polygon(4)] },
  { file: 'pentagon', title: 'Pentagon', kind: 'shape', parts: () => [polygon(5)] },
  { file: 'circle', title: 'Circle', kind: 'shape', parts: () => [sample(120, (t) => [Math.cos(t), Math.sin(t), 0])] },

  { file: 'trefoil', title: 'Trefoil', note: '3₁', kind: 'knot', parts: () => [torus(2, 3)] },
  { file: 'figure-eight', title: 'Figure eight', note: '4₁', kind: 'knot', parts: () => [figureEight()] },
  { file: 'cinquefoil', title: 'Cinquefoil', note: '5₁', kind: 'knot', parts: () => [torus(2, 5)] },
  { file: 'torus-3-4', title: 'Torus (3,4)', note: '8₁₉', kind: 'knot', parts: () => [torus(3, 4)] },

  { file: 'hopf-link', title: 'Hopf link', note: 'Lk 1', kind: 'link', parts: () => tilt(hopf(), [0.55, 0.4, 1]), linked: 1 },
  { file: 'solomon', title: "Solomon's seal", note: 'Lk 2', kind: 'link', parts: () => torusLink(2, 4), linked: 2 },
  // Down the diagonal: the symmetric view, and the only one where all three
  // rings read as rings.
  { file: 'borromean', title: 'Borromean rings', kind: 'link', parts: () => tilt(borromean(), [1, 1, 1]), linked: 0 },
];

// ---------- build ----------

await mkdir(OUT, { recursive: true });
const index = [];
let worst = Infinity;

for (const shape of SHAPES) {
  const parts = centreAndScale(shape.parts());

  // A shape whose own tube passes through itself is not shippable. Checked here
  // rather than trusted, because a parametrisation that looks right can still
  // be too tight once it is scaled to a fixed size.
  const gap = tightest(parts, 2.5 * 2 * RADIUS);
  worst = Math.min(worst, gap);
  if (gap < 2 * RADIUS) {
    throw new Error(`${shape.file}: strands come within ${gap.toFixed(3)}, tubes touch at ${(2 * RADIUS).toFixed(3)}`);
  }

  // And a link that isn't linked is a bug, not a shape.
  if (shape.linked !== undefined && parts.length > 1) {
    const lk = Math.abs(linking(parts[0], parts[1]));
    if (Math.abs(lk - shape.linked) > 0.05) {
      throw new Error(`${shape.file}: expected linking number ${shape.linked}, measured ${lk.toFixed(3)}`);
    }
  }
  if (shape.linked !== undefined && parts.length < 2) {
    throw new Error(`${shape.file}: expected several components, got ${parts.length}`);
  }

  const curves = parts.map((points, i) => ({
    name: parts.length > 1 ? `${shape.title} ${i + 1}` : shape.title,
    // Keep the colour it was generated with, so a link's components stay
    // distinguishable however the draw swatch happens to be set.
    color: PALETTE[(i * 3 + SHAPES.indexOf(shape)) % PALETTE.length],
    radius: RADIUS,
    closed: true,
    by: 'library',
    points,
  }));

  const text = stringify(serialize(curves, { by: 'library' }));
  await writeFile(join(OUT, `${shape.file}.knot.json`), text);
  index.push({
    file: `${shape.file}.knot.json`,
    title: shape.title,
    note: shape.note ?? '',
    kind: shape.kind,
    parts: parts.length,
  });
  console.log(
    `  ${shape.file.padEnd(14)} ${String(parts.length).padStart(2)} curve(s)  ` +
      `${String(parts.reduce((s, p) => s + p.length, 0)).padStart(4)} pts  ` +
      `clearance ${(gap / RADIUS).toFixed(1)}R  ${(text.length / 1024).toFixed(1)}KB`,
  );
}

// The index is library metadata, not part of the scene format. `front` records
// which way a shape is drawn to be looked at, so inserting one can turn it to
// face the camera; everything here is generated lying in the xy-plane.
await writeFile(join(OUT, 'index.json'), `${JSON.stringify({ front: [0, 0, 1], shapes: index }, null, 2)}\n`);
console.log(`\n${index.length} shapes, tightest clearance ${(worst / RADIUS).toFixed(1)}R (tubes touch at 2R)`);
