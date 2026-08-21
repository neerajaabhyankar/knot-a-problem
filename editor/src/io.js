// Reading and writing scenes. See io.md.
//
// Pure serialisation: no DOM, no three.js, no Scene. In and out are plain
// objects and strings, so this is unit-testable in node like crossings.js and
// smooth.js. The file picker, the download and the camera easing live in
// main.js and viewer.js, which is where the impurity belongs.

export const FORMAT = 'knot-a-problem/scene';
export const VERSION = 1;
export const EXTENSION = '.knot.json';

// Five decimals. The crossing guard's minimum gap is 0.225 world units, so a
// worst-case error of 5e-6 is 45,000x below anything that can matter, and it
// takes a smoothed 240-point curve from 14.1KB to 6.2KB. Rounding is also what
// makes a save idempotent: the second save rounds numbers that are already
// round, so the two files come out byte identical.
const PLACES = 5;

// Sanity ceilings for untrusted input. A dropped file is arbitrary JSON from
// anywhere, so every one of these is a refusal rather than a clamp — silently
// loading half a file is worse than not loading it.
const MAX_CURVES = 2000;
const MAX_POINTS = 200000;
const HEX = /^#[0-9a-f]{6}$/i;

const round = (v) => +v.toFixed(PLACES);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * The model, ready for `JSON.stringify`. `curves` is the plain array off the
 * Scene; ids are deliberately not written — they are session-local, and letting
 * a file dictate them would collide the moment you insert one scene into
 * another. Loading mints fresh ones.
 */
export function serialize(curves, { camera = null, by = 'human' } = {}) {
  return {
    format: FORMAT,
    version: VERSION,
    saved: new Date().toISOString(),
    // Who last touched this. The top-level plan wants provenance once an agent
    // can drive the editor; the field is free now and a version bump later.
    by,
    ...(camera ? { camera: { position: camera.position.map(round), target: camera.target.map(round) } } : {}),
    curves: curves.map((c) => ({
      name: c.name,
      color: c.color,
      radius: round(c.radius),
      closed: !!c.closed,
      points: c.points.map((p) => [round(p[0]), round(p[1]), round(p[2])]),
    })),
  };
}

/** Serialised scene -> text, with one point per line so a diff is readable. */
export function stringify(scene) {
  const body = scene.curves
    .map((c) => {
      const head = JSON.stringify({ name: c.name, color: c.color, radius: c.radius, closed: c.closed });
      const pts = c.points.map((p) => `      ${JSON.stringify(p)}`).join(',\n');
      return `    { ${head.slice(1, -1)},\n      "points": [\n${pts}\n      ]\n    }`;
    })
    .join(',\n');
  const head = { ...scene };
  delete head.curves;
  const lines = Object.entries(head).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  return `{\n${lines.join(',\n')},\n  "curves": [\n${body}\n  ]\n}\n`;
}

/**
 * Text -> `{ curves, camera, by }`, validated. Throws an `Error` whose message
 * is fit to show a person; every path through here either returns something the
 * editor can safely add or explains why it can't.
 *
 * `fallbackColor` is used when a colour is missing or malformed rather than
 * failing the whole file — an unvalidated colour string reaching `THREE.Color`
 * is how every strand once rendered white.
 */
export function parse(text, { fallbackColor = '#d2d24b', defaultRadius = 0.075 } = {}) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('that file is not JSON');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('that file is not a scene');
  if (raw.format !== FORMAT) {
    throw new Error(`that file is not a knot scene (no "${FORMAT}" tag)`);
  }
  if (!Number.isInteger(raw.version) || raw.version < 1) throw new Error('that scene has no version');
  if (raw.version > VERSION) {
    throw new Error(`that scene was written by a newer version (${raw.version} > ${VERSION})`);
  }
  if (!Array.isArray(raw.curves)) throw new Error('that scene has no curves');
  if (raw.curves.length > MAX_CURVES) throw new Error(`that scene has too many curves (${raw.curves.length})`);

  let total = 0;
  const curves = [];
  raw.curves.forEach((c, i) => {
    if (!c || typeof c !== 'object' || !Array.isArray(c.points)) {
      throw new Error(`curve ${i + 1} has no points`);
    }
    total += c.points.length;
    if (total > MAX_POINTS) throw new Error('that scene has too many points to load');
    const points = c.points.map((p, j) => {
      if (!Array.isArray(p) || p.length !== 3 || !p.every(finite)) {
        throw new Error(`curve ${i + 1}, point ${j + 1} is not three numbers`);
      }
      return [p[0], p[1], p[2]];
    });
    // Two points is a straight line; anything less is not a curve.
    if (points.length < 2) throw new Error(`curve ${i + 1} has fewer than two points`);

    curves.push({
      name: typeof c.name === 'string' && c.name ? c.name.slice(0, 120) : `curve ${i + 1}`,
      color: typeof c.color === 'string' && HEX.test(c.color) ? c.color : fallbackColor,
      radius: finite(c.radius) && c.radius > 0 ? c.radius : defaultRadius,
      closed: !!c.closed,
      points,
    });
  });

  return { curves, camera: parseCamera(raw.camera), by: typeof raw.by === 'string' ? raw.by : null };
}

function parseCamera(cam) {
  const ok = (v) => Array.isArray(v) && v.length === 3 && v.every(finite);
  if (!cam || typeof cam !== 'object' || !ok(cam.position) || !ok(cam.target)) return null;
  return { position: [...cam.position], target: [...cam.target] };
}

// ---------- placement ----------

/** Axis-aligned bounds of a set of curves, or null if there are no points. */
export function bounds(curves) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  let any = false;
  for (const c of curves) {
    for (const p of c.points) {
      any = true;
      for (let k = 0; k < 3; k++) {
        if (p[k] < lo[k]) lo[k] = p[k];
        if (p[k] > hi[k]) hi[k] = p[k];
      }
    }
  }
  if (!any) return null;
  return { lo, hi, centre: [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2), size: [0, 1, 2].map((k) => hi[k] - lo[k]) };
}

/** Half-width of a box measured along an arbitrary unit direction. */
function reachAlong(size, dir) {
  return (Math.abs(size[0] * dir[0]) + Math.abs(size[1] * dir[1]) + Math.abs(size[2] * dir[2])) / 2;
}

/**
 * Where to put an arriving scene so it lands *beside* what is already there
 * rather than on top of it. Offsets along `right` — the camera's right vector,
 * not the world's — so it always appears next to what you are looking at, at
 * whatever angle you happen to be viewing from.
 *
 * Returns the translation to apply to every incoming point. A scene with
 * nothing in it needs no offset, which is what makes opening a file into an
 * empty editor reproduce the saved coordinates exactly.
 */
export function placement(existing, incoming, right, gapFraction = 0.25) {
  const here = bounds(existing);
  const there = bounds(incoming);
  if (!here || !there) return [0, 0, 0];

  const len = Math.hypot(...right) || 1;
  const dir = right.map((v) => v / len);

  // Push until the two boxes clear each other along `dir`, plus a gap scaled to
  // the arriving shape so a small one doesn't land miles away.
  const centreGap = reachAlong(here.size, dir) + reachAlong(there.size, dir);
  const gap = gapFraction * Math.max(...there.size);
  const along = (v) => v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2];
  const shift = along(here.centre) - along(there.centre) + centreGap + gap;

  return dir.map((v) => v * shift);
}

/** Move every point of every curve. Returns new curves; the input is untouched. */
export function translate(curves, delta) {
  if (delta.every((v) => v === 0)) return curves;
  return curves.map((c) => ({
    ...c,
    points: c.points.map((p) => [p[0] + delta[0], p[1] + delta[1], p[2] + delta[2]]),
  }));
}

/**
 * Rotate every point about the set's own centre, by the rotation that takes
 * unit vector `from` to unit vector `to`. Rodrigues, so no three.js.
 *
 * Used to turn a library shape to face the camera. A triangle stored in the
 * xy-plane would otherwise arrive edge-on — a line — whenever you had orbited,
 * which is a miserable way to meet a shape you just asked for. Saved scenes are
 * never rotated: those are your work, and they arrive exactly as you left them.
 */
export function orient(curves, from, to) {
  const k = cross(from, to);
  const s = Math.hypot(...k);
  const c = dot(from, to);
  if (s < 1e-9) {
    if (c > 0) return curves; // already facing that way
    // Antiparallel: any perpendicular axis will do for the half turn.
    const alt = Math.abs(from[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    return orient(curves, from, unit(cross(from, alt)));
  }
  const axis = k.map((v) => v / s);
  const theta = Math.atan2(s, c);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const centre = bounds(curves)?.centre ?? [0, 0, 0];

  const spin = (p) => {
    const v = [p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]];
    const kv = cross(axis, v);
    const kd = dot(axis, v) * (1 - cos);
    return [0, 1, 2].map((i) => centre[i] + v[i] * cos + kv[i] * sin + axis[i] * kd);
  };
  return curves.map((curve) => ({ ...curve, points: curve.points.map(spin) }));
}

const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v) => {
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
};

// ---------- export ----------
//
// One-way doors. Both of these lose the tube radius and the camera, and OBJ
// loses colour too, so neither is a save format — they exist to hand a knot to
// other software.

/** Wavefront OBJ. `l` elements are polylines; a closed loop repeats its first index. */
export function toOBJ(curves) {
  const out = ['# knot-a-problem', `# ${curves.length} curve(s)`];
  let base = 1; // OBJ indices are 1-based and run across the whole file
  for (const c of curves) {
    out.push(`o ${(c.name || 'curve').replace(/\s+/g, '_')}`);
    for (const p of c.points) out.push(`v ${p.map((v) => +v.toFixed(6)).join(' ')}`);
    const idx = c.points.map((_, i) => base + i);
    if (c.closed) idx.push(base);
    out.push(`l ${idx.join(' ')}`);
    base += c.points.length;
  }
  return out.join('\n') + '\n';
}

/**
 * Geomview VECT — what the knot-tightening tools (ridgerunner, octrope,
 * KnotPlot) actually read. A **negative** vertex count marks a closed polyline,
 * which is the one detail that makes this format fit knots properly.
 */
export function toVECT(curves) {
  const nv = curves.map((c) => (c.closed ? -c.points.length : c.points.length));
  const total = curves.reduce((s, c) => s + c.points.length, 0);
  const lines = [
    'VECT',
    `${curves.length} ${total} ${curves.length}`,
    nv.join(' '),
    curves.map(() => 1).join(' '), // one colour per polyline
  ];
  for (const c of curves) {
    for (const p of c.points) lines.push(p.map((v) => +v.toFixed(6)).join(' '));
  }
  for (const c of curves) {
    const [r, g, b] = rgb(c.color);
    lines.push(`${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)} 1`);
  }
  return lines.join('\n') + '\n';
}

/** '#rrggbb' -> three 0..1 components. Unparseable colours come back white. */
function rgb(hex) {
  if (!HEX.test(hex ?? '')) return [1, 1, 1];
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
}

/** A filename that sorts well and never collides: `knot-2026-08-20-1402`. */
export function suggestName(now = new Date()) {
  const p = (v) => String(v).padStart(2, '0');
  return (
    `knot-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}` +
    `-${p(now.getHours())}${p(now.getMinutes())}`
  );
}
