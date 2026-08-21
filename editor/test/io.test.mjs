// Unit tests for saving and loading. No browser needed.
//
// The two claims worth proving: a drawing survives the round trip intact, and a
// hostile file gets a refusal rather than a stack trace or a half-loaded scene.

import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FORMAT,
  bounds,
  parse,
  placement,
  serialize,
  stringify,
  suggestName,
  toOBJ,
  toVECT,
  translate,
} from '../src/io.js';

let failures = 0;
function check(ok, label, detail = '') {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

/** Did `fn` refuse, and does the message read like something you'd show a person? */
function refuses(fn, label) {
  try {
    fn();
    check(false, label, 'it was accepted');
  } catch (e) {
    const good = e instanceof Error && e.message.length > 8 && !/undefined|null|\[object/.test(e.message);
    check(good, label, JSON.stringify(e.message));
  }
}

const ring = (n, r, z = 0, cx = 0) =>
  Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return [cx + r * Math.cos(t), r * Math.sin(t), z + 0.31 * Math.sin(3 * t)];
  });

const scene = [
  { name: 'first', color: '#d2d24b', radius: 0.075, closed: true, points: ring(40, 1.5) },
  { name: 'second', color: '#4bd2d2', radius: 0.12, closed: false, points: ring(17, 0.6, 1.2) },
];

// --- round trip ---------------------------------------------------------------

const text = stringify(serialize(scene));
const back = parse(text);

check(back.curves.length === 2, 'both curves come back', `${back.curves.length}`);
check(
  back.curves.every((c, i) => c.name === scene[i].name && c.color === scene[i].color),
  'names and colours survive',
);
check(
  back.curves.every((c, i) => c.closed === scene[i].closed && c.radius === scene[i].radius),
  'open/closed and thickness survive',
  back.curves.map((c) => `${c.closed ? 'loop' : 'arc'}@${c.radius}`).join(' '),
);

const worst = Math.max(
  ...back.curves.flatMap((c, i) => c.points.flatMap((p, j) => p.map((v, k) => Math.abs(v - scene[i].points[j][k])))),
);
check(worst <= 5e-6, 'every coordinate survives to 5e-6 world units', `worst ${worst.toExponential(1)}`);
// The guard holds strands 0.225 apart, so this is four orders of magnitude below
// anything that could change the picture.
check(worst < 0.225 / 10000, 'which is far below anything the geometry cares about');

// Saving is idempotent — the second save rounds numbers that are already round.
const again = stringify(serialize(back.curves));
const strip = (s) => s.replace(/"saved": "[^"]*"/, '');
check(strip(again) === strip(text), 'saving a loaded scene reproduces the same file byte for byte');

// --- the file itself ----------------------------------------------------------

const parsed = JSON.parse(text);
check(parsed.format === FORMAT && parsed.version === 1, 'the file is tagged and versioned');
check(parsed.by === 'human', 'and records who made it', JSON.stringify(parsed.by));
check(!('id' in parsed.curves[0]), 'ids are not written — they are session-local');
check(
  text.split('\n').length > scene[0].points.length,
  'one point per line, so a diff is readable',
  `${text.split('\n').length} lines`,
);
check(/\.knot\.json$|^knot-\d{4}-\d{2}-\d{2}-\d{4}$/.test(suggestName(new Date(2026, 7, 20, 14, 2))),
  'the suggested filename sorts by date', suggestName(new Date(2026, 7, 20, 14, 2)));

// --- camera -------------------------------------------------------------------

const withCam = parse(
  stringify(serialize(scene, { camera: { position: [1, 2, 3], target: [0, 0.5, 0] } })),
);
check(
  withCam.camera && withCam.camera.position[2] === 3 && withCam.camera.target[1] === 0.5,
  'the camera round-trips when it is written',
);
check(parse(text).camera === null, 'and is absent, not invented, when it is not');

// --- refusing bad input -------------------------------------------------------

refuses(() => parse('not json at all'), 'a non-JSON file is refused');
refuses(() => parse('[1,2,3]'), 'a JSON array is refused');
refuses(() => parse('{"curves":[]}'), 'JSON without the format tag is refused');
refuses(() => parse(JSON.stringify({ format: FORMAT, version: 99, curves: [] })), 'a newer version is refused');
refuses(() => parse(JSON.stringify({ format: FORMAT, version: 1 })), 'a scene with no curves array is refused');
refuses(
  () => parse(JSON.stringify({ format: FORMAT, version: 1, curves: [{ points: [[0, 0, 0], [1, 'x', 0]] }] })),
  'a non-numeric coordinate is refused',
);
refuses(
  () => parse(JSON.stringify({ format: FORMAT, version: 1, curves: [{ points: [[0, 0, 0], [1, NaN, 0]] }] })),
  'NaN is refused',
);
refuses(
  () => parse(JSON.stringify({ format: FORMAT, version: 1, curves: [{ points: [[0, 0, 0], [1, 0]] }] })),
  'a point that is not three numbers is refused',
);
refuses(
  () => parse(JSON.stringify({ format: FORMAT, version: 1, curves: [{ points: [[0, 0, 0]] }] })),
  'a one-point curve is refused',
);
refuses(
  () => parse(JSON.stringify({ format: FORMAT, version: 1, curves: Array.from({ length: 5000 }, () => ({ points: [[0, 0, 0], [1, 1, 1]] })) })),
  'an absurd number of curves is refused',
);

// A bad colour is survivable, unlike everything above: fall back rather than
// fail the file. An unvalidated colour string reaching THREE.Color is exactly
// how every strand once rendered white.
const dodgy = parse(
  JSON.stringify({
    format: FORMAT,
    version: 1,
    curves: [{ color: 'rgb(1,2,3); background:url(x)', points: [[0, 0, 0], [1, 1, 1]] }],
  }),
);
check(/^#[0-9a-f]{6}$/i.test(dodgy.curves[0].color), 'a malformed colour falls back instead of failing the file',
  dodgy.curves[0].color);
check(dodgy.curves[0].radius > 0, 'and a missing radius takes the default', `${dodgy.curves[0].radius}`);

// --- placement ----------------------------------------------------------------

const left = [{ points: ring(24, 1, 0, 0), closed: true }];
const arriving = [{ points: ring(24, 1, 0, 0), closed: true }];

check(placement([], arriving, [1, 0, 0]).every((v) => v === 0),
  'an empty scene needs no offset — a file opens at its saved coordinates');

const dx = placement(left, arriving, [1, 0, 0]);
const moved = translate(arriving, dx);
const a = bounds(left), b = bounds(moved);
check(b.lo[0] > a.hi[0], 'an arriving scene lands clear of what is already there',
  `existing ends at x=${a.hi[0].toFixed(2)}, new starts at x=${b.lo[0].toFixed(2)}`);
check(Math.abs(b.centre[1] - a.centre[1]) < 1e-9, 'and only moves along the direction it was given');

// Camera-right, not world-right: viewed from another angle it still lands beside.
const diag = placement(left, arriving, [0, 0, 1]);
check(diag[2] > 0 && Math.abs(diag[0]) < 1e-9, 'it follows the camera, not the world axes',
  `[${diag.map((v) => v.toFixed(2))}]`);
check(
  Math.hypot(...placement(left, arriving, [3, 0, 0])) === Math.hypot(...dx),
  'and an unnormalised direction gives the same distance',
);

// --- export -------------------------------------------------------------------

const obj = toOBJ(scene);
const vs = obj.split('\n').filter((l) => l.startsWith('v ')).length;
const ls = obj.split('\n').filter((l) => l.startsWith('l '));
check(vs === 57, 'OBJ writes every vertex once', `${vs}`);
check(ls.length === 2, 'and one polyline per curve');
check(
  ls[0].split(' ').length === 42 && ls[0].endsWith(' 1'),
  'a closed curve repeats its first index to shut the loop',
);
check(!ls[1].slice(2).split(' ').some((n, i, all) => i && n === all[0]), 'an open curve does not');
check(
  Math.max(...obj.split('\n').filter((l) => l[0] === 'l').flatMap((l) => l.slice(2).split(' ').map(Number))) === 57,
  'OBJ indices are 1-based and run across the whole file',
);

const vect = toVECT(scene).split('\n');
check(vect[0] === 'VECT', 'VECT starts with its magic word');
check(vect[1] === '2 57 2', 'and counts polylines, vertices and colours', vect[1]);
check(vect[2] === '-40 17', 'a negative vertex count marks the closed loop', vect[2]);
const colours = vect.slice(4 + 57, 4 + 57 + 2);
check(colours.every((l) => l.split(' ').length === 4), 'colours are RGBA, one per polyline', JSON.stringify(colours));
check(colours[0].startsWith('0.8235 0.8235 0.2941'), 'and carry the strand colour through', colours[0]);

// --- the shipped library ------------------------------------------------------
//
// These are generated by tools/library.mjs and committed, so this is the check
// that catches drift: whatever is on disk has to be loadable and sane, however
// it got there.

const LIB = join(dirname(fileURLToPath(import.meta.url)), '../src/library');
const index = JSON.parse(await readFile(join(LIB, 'index.json'), 'utf8'));
const files = (await readdir(LIB)).filter((f) => f.endsWith('.knot.json')).sort();

check(files.length > 0, 'the library has shapes in it', `${files.length}`);
check(
  files.join() === index.shapes.map((s) => s.file).sort().join(),
  'and the index lists exactly the files on disk',
);
check(
  index.shapes.every((s) => s.title && ['shape', 'knot', 'link'].includes(s.kind)),
  'every entry has a title and a kind the picker knows',
);

/** Closest approach between stretches that aren't continuous, in strand radii. */
function clearance(curves, window) {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  let best = Infinity;
  for (const c of curves) {
    const n = c.points.length;
    const cum = [0];
    for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + d(c.points[i - 1], c.points[i % n]));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const along = cum[j] - cum[i];
        if (Math.min(along, cum[n] - along) < window) continue;
        best = Math.min(best, d(c.points[i], c.points[j]));
      }
    }
  }
  for (let a = 0; a < curves.length; a++) {
    for (let b = a + 1; b < curves.length; b++) {
      for (const p of curves[a].points) for (const q of curves[b].points) best = Math.min(best, d(p, q));
    }
  }
  return best;
}

let tightest = Infinity;
let biggest = 0;
for (const file of files) {
  const entry = index.shapes.find((s) => s.file === file);
  let loaded;
  try {
    loaded = parse(await readFile(join(LIB, file), 'utf8'));
  } catch (e) {
    check(false, `${file} loads`, e.message);
    continue;
  }
  const radius = loaded.curves[0].radius;
  const gap = clearance(loaded.curves, 2.5 * 2 * radius);
  tightest = Math.min(tightest, gap / radius);
  biggest = Math.max(biggest, loaded.curves.reduce((n, c) => n + c.points.length, 0));

  if (loaded.curves.length !== entry.parts) {
    check(false, `${file} has the component count the index claims`, `${loaded.curves.length} vs ${entry.parts}`);
  } else if (!loaded.curves.every((c) => c.closed)) {
    check(false, `${file} is made of closed loops`);
  } else if (gap < 2 * radius) {
    // A shape whose own tube passes through itself is not shippable.
    check(false, `${file} keeps its tubes apart`, `${(gap / radius).toFixed(2)}R, tubes touch at 2R`);
  }
}
check(tightest >= 2, 'every shipped shape keeps its tubes apart',
  `tightest ${tightest.toFixed(1)}R across ${files.length} shapes, tubes touch at 2R`);
check(biggest < 1000, 'and none is absurdly heavy', `largest ${biggest} points`);

console.log(failures ? `\n${failures} failing check(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
