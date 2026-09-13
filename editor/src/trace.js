// Reading a knot diagram back off a picture.
//
// The whole trick is that this needs no knot theory at all. A printed diagram
// already says which strand goes under: it is the broken one. So the job is
// only ever "find the ink, find the loose ends, work out which end joins which"
// — and what comes out the far side is a set of closed loops with some
// stretches marked *under*, which is **exactly what a pen stroke with lifts in
// it produces**. It goes through the same lift as a drawing does.
//
// Deliberately colour-blind about structure: a diagram may draw every component
// in one colour, so colour is sampled at the end for looks and is never used to
// decide what joins what.
//
// Pure: in is raw RGBA, out is polylines. No DOM, so it is testable in node.

const MAX_SIDE = 2000;
/** Ink is a pixel this far from the page colour, in RGB distance. */
const INK = 48;
/** A spur shorter than this many stroke widths is a thinning artefact. */
const SPUR = 2.5;
/** A break wider than this many stroke widths is not a break. */
const REACH = 12;
/** How far back along an arc to look for its heading, in stroke widths. */
const TANGENT = 1.5;

const idx = (x, y, w) => (y * w + x) * 4;
const dist2 = (d, i, c) => (d[i] - c[0]) ** 2 + (d[i + 1] - c[1]) ** 2 + (d[i + 2] - c[2]) ** 2;

/** The page colour: whatever the border of the image is mostly made of. */
export function pageColour({ data, width: w, height: h }) {
  const tally = new Map();
  const add = (x, y) => {
    const i = idx(x, y, w);
    // Quantised to 32 levels, so antialiasing doesn't split one colour into ten.
    const key = ((data[i] >> 5) << 10) | ((data[i + 1] >> 5) << 5) | (data[i + 2] >> 5);
    const t = tally.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    t.n++;
    t.r += data[i];
    t.g += data[i + 1];
    t.b += data[i + 2];
    tally.set(key, t);
  };
  for (let x = 0; x < w; x++) {
    add(x, 0);
    add(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    add(0, y);
    add(w - 1, y);
  }
  const best = [...tally.values()].reduce((a, b) => (b.n > a.n ? b : a));
  return [best.r / best.n, best.g / best.n, best.b / best.n];
}

/** Ink, as one byte per pixel. */
function inkMask(image, page, threshold) {
  const { data, width: w, height: h } = image;
  const m = new Uint8Array(w * h);
  const cut = threshold * threshold;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y, w);
      // A transparent pixel is page, whatever colour it claims to be.
      if (data[i + 3] > 128 && dist2(data, i, page) > cut) m[y * w + x] = 1;
    }
  }
  return m;
}

/**
 * Zhang–Suen thinning: erode the ink to a one-pixel skeleton without breaking
 * it apart. Two sub-passes per round, each deleting from a different side, which
 * is what keeps the result centred instead of shaved off one edge.
 */
export function thin(mask, w, h) {
  const m = Uint8Array.from(mask);
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : m[y * w + x]);
  const doomed = [];
  for (let round = 0; round < 200; round++) {
    let removed = 0;
    for (const step of [0, 1]) {
      doomed.length = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          if (!m[y * w + x]) continue;
          const p = [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1),
                     at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)];
          const b = p.reduce((s, v) => s + v, 0);
          if (b < 2 || b > 6) continue;
          let a = 0;
          for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) % 8]) a++;
          if (a !== 1) continue;
          const [N, , E, , S, , W] = p;
          if (step === 0 ? N * E * S || E * S * W : N * E * W || N * S * W) continue;
          doomed.push(y * w + x);
        }
      }
      for (const i of doomed) m[i] = 0;
      removed += doomed.length;
    }
    if (!removed) break;
  }
  return m;
}

const ORTHOGONAL = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const DIAGONAL = [[1, -1], [1, 1], [-1, 1], [-1, -1]];

/**
 * Neighbours, ignoring diagonals you could have walked round.
 *
 * Thinning leaves plenty of little right-angle triples — three pixels each
 * touching the other two. Counted naively every one of them is a three-way
 * junction, and a clean skeleton comes out looking like a hairball: 237 false
 * junctions in a two-crossing Hopf link, measured. A diagonal step only counts
 * when neither of the two orthogonal steps that would go round it exists, and
 * the hairball becomes a set of arcs.
 */
function neighbours(skel, w, h, p) {
  const [x, y] = [p % w, (p / w) | 0];
  const at = (i, j) => (i < 0 || j < 0 || i >= w || j >= h ? 0 : skel[j * w + i]);
  const out = [];
  for (const [dx, dy] of ORTHOGONAL) if (at(x + dx, y + dy)) out.push((y + dy) * w + (x + dx));
  for (const [dx, dy] of DIAGONAL) {
    if (at(x + dx, y + dy) && !at(x + dx, y) && !at(x, y + dy)) out.push((y + dy) * w + (x + dx));
  }
  return out;
}

function degrees(skel, w, h) {
  const deg = new Uint8Array(w * h);
  for (let p = 0; p < skel.length; p++) if (skel[p]) deg[p] = neighbours(skel, w, h, p).length;
  return deg;
}

/**
 * The skeleton as polylines: one per stretch between two ends, plus any closed
 * curve that has no ends at all — a component nothing crosses.
 */
function extract(skel, w, h) {
  const deg = degrees(skel, w, h);
  const node = (p) => deg[p] !== 2;
  const around = (p) => neighbours(skel, w, h, p);

  const used = new Set();
  const arcs = [];
  for (let p = 0; p < skel.length; p++) {
    if (!skel[p] || !node(p)) continue;
    for (const first of around(p)) {
      if (used.has(`${p}>${first}`)) continue;
      const path = [p];
      let prev = p;
      let cur = first;
      let guard = skel.length;
      while (!node(cur) && guard-- > 0) {
        path.push(cur);
        const next = around(cur).find((q) => q !== prev);
        if (next === undefined) break;
        prev = cur;
        cur = next;
      }
      path.push(cur);
      used.add(`${p}>${first}`);
      used.add(`${cur}>${prev}`);
      arcs.push({ pixels: path, closed: false });
    }
  }

  // Closed curves have no node to start from, so they are whatever is left.
  const seen = new Uint8Array(skel.length);
  for (const a of arcs) for (const p of a.pixels) seen[p] = 1;
  for (let p = 0; p < skel.length; p++) {
    if (!skel[p] || seen[p]) continue;
    const path = [p];
    seen[p] = 1;
    let cur = around(p)[0];
    let guard = skel.length;
    while (cur !== undefined && !seen[cur] && guard-- > 0) {
      seen[cur] = 1;
      path.push(cur);
      cur = around(cur).find((q) => !seen[q]);
    }
    if (path.length > 8) arcs.push({ pixels: path, closed: true });
  }
  return { arcs, deg };
}

/** The direction a branch leaves a junction in, looked at `look` pixels along. */
function branchDirection(skel, w, h, from, first, look) {
  let prev = from;
  let cur = first;
  for (let k = 0; k < look; k++) {
    const next = neighbours(skel, w, h, cur).find((q) => q !== prev);
    if (next === undefined) break;
    prev = cur;
    cur = next;
  }
  return norm([(cur % w) - (from % w), ((cur / w) | 0) - ((from / w) | 0)]);
}

/**
 * Is this junction two strands *grazing*, or two strands *crossing*?
 *
 * Both leave a four-way junction in the skeleton and they look identical
 * locally, but they mean opposite things. Grazing strands do not cross, so
 * rejoining them straight through recovers the truth and guesses nothing.
 * Crossing strands with no break drawn are a picture that does not say which
 * one is on top, and joining them through would invent an answer.
 *
 * They are told apart by how the four branches sit round the junction. Two
 * strands that cross leave in alternating order — A, B, A', B' — so each branch
 * faces the one *two* along. Two that merely touch leave as A, B, B', A', and
 * each branch faces its neighbour.
 */
function isGraze(skel, w, h, p, look) {
  const arms = neighbours(skel, w, h, p);
  if (arms.length !== 4) return false;
  const dirs = arms.map((q) => branchDirection(skel, w, h, p, q, look));
  const order = [0, 1, 2, 3].sort((a, b) => Math.atan2(dirs[a][1], dirs[a][0]) - Math.atan2(dirs[b][1], dirs[b][0]));
  const first = order[0];
  let opposite = order[1];
  for (const k of order.slice(1)) if (dot(dirs[k], dirs[first]) < dot(dirs[opposite], dirs[first])) opposite = k;
  return opposite !== order[2];
}

/** Rub out branches too short to be strand — thinning grows them at every cap. */
function prune(skel, w, h, limit) {
  for (let pass = 0; pass < 8; pass++) {
    const { arcs, deg } = extract(skel, w, h);
    const spurs = arcs.filter(
      (a) => !a.closed && a.pixels.length < limit && (deg[a.pixels[0]] > 2) !== (deg[a.pixels[a.pixels.length - 1]] > 2),
    );
    if (!spurs.length) return;
    for (const s of spurs) {
      for (const p of s.pixels) if (deg[p] <= 2) skel[p] = 0;
    }
  }
}

/** Ramer–Douglas–Peucker, on pixel coordinates. */
function rdp(points, epsilon) {
  if (points.length < 3) return points;
  const [a, b] = [points[0], points[points.length - 1]];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  let worst = 0;
  let at = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = Math.abs(dy * (points[i][0] - a[0]) - dx * (points[i][1] - a[1])) / len;
    if (d > worst) {
      worst = d;
      at = i;
    }
  }
  if (worst <= epsilon) return [a, b];
  return [...rdp(points.slice(0, at + 1), epsilon).slice(0, -1), ...rdp(points.slice(at), epsilon)];
}

const norm = (v) => {
  const m = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / m, v[1] / m];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

/**
 * Which way an arc is heading as it runs off its end.
 *
 * Measured back along a *distance*, not a number of points: the arcs have been
 * simplified, so a fixed number of points is a few pixels on a wiggly stretch
 * and half the strand on a straight one — and a heading taken over half a
 * curved strand points nowhere useful.
 */
function tangentAt(points, end, look) {
  const n = points.length;
  const tip = end === 0 ? points[0] : points[n - 1];
  let back = tip;
  for (let k = 1; k < n; k++) {
    back = end === 0 ? points[k] : points[n - 1 - k];
    if (Math.hypot(back[0] - tip[0], back[1] - tip[1]) >= look) break;
  }
  return norm([tip[0] - back[0], tip[1] - back[1]]);
}

/**
 * Join the loose ends across the breaks.
 *
 * Two ends belong together when they face each other: each one's outward
 * direction points at the other, and the two directions oppose. Distance alone
 * is not enough — in a busy diagram the nearest loose end is often on a
 * completely different strand running past.
 */
function pairEnds(open, reach, look) {
  const ends = [];
  open.forEach((arc, i) => {
    for (const end of [0, 1]) {
      const p = end === 0 ? arc.points[0] : arc.points[arc.points.length - 1];
      ends.push({ arc: i, end, at: p, dir: tangentAt(arc.points, end, look) });
    }
  });

  const candidates = [];
  for (let i = 0; i < ends.length; i++) {
    for (let j = i + 1; j < ends.length; j++) {
      const [A, B] = [ends[i], ends[j]];
      if (A.arc === B.arc && A.end === B.end) continue;
      const v = [B.at[0] - A.at[0], B.at[1] - A.at[1]];
      const d = Math.hypot(v[0], v[1]);
      if (d < 1e-6 || d > reach) continue;
      const u = norm(v);
      const facing = Math.min(dot(A.dir, u), dot(B.dir, [-u[0], -u[1]]));
      if (facing < 0.5 || dot(A.dir, B.dir) > -0.3) continue;
      candidates.push({ i, j, score: d * (2 - facing) });
    }
  }
  candidates.sort((a, b) => a.score - b.score);

  const partner = new Array(ends.length).fill(-1);
  for (const c of candidates) {
    if (partner[c.i] >= 0 || partner[c.j] >= 0) continue;
    partner[c.i] = c.j;
    partner[c.j] = c.i;
  }
  const loose = partner.filter((p) => p < 0).length;
  if (loose) {
    throw new Error(
      `${loose} loose end${loose === 1 ? '' : 's'} in this picture could not be matched across a break — ` +
        'a diagram needs every strand to carry on somewhere',
    );
  }
  return { ends, partner };
}

/** Straight run across a gap. Every point of it is marked under — that is the break. */
function bridge(from, to) {
  const steps = Math.max(2, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 3));
  return Array.from({ length: steps - 1 }, (_, k) => {
    const f = (k + 1) / steps;
    return [from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f];
  });
}

const hex = (c) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

/** The commonest ink colour under a run of points. */
function sampleColour(image, points, fallback) {
  const { data, width: w, height: h } = image;
  const tally = new Map();
  for (const [x, y] of points) {
    const [px, py] = [Math.round(x), Math.round(y)];
    if (px < 0 || py < 0 || px >= w || py >= h) continue;
    const i = idx(px, py, w);
    if (data[i + 3] < 128) continue;
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const t = tally.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    t.n++;
    t.r += data[i];
    t.g += data[i + 1];
    t.b += data[i + 2];
    tally.set(key, t);
  }
  if (!tally.size) return fallback;
  const best = [...tally.values()].reduce((a, b) => (b.n > a.n ? b : a));
  return hex([best.r / best.n, best.g / best.n, best.b / best.n]);
}

/**
 * A picture of a knot diagram, as closed loops with the under-stretches marked.
 *
 * @returns {{loops: {points: number[][], under: boolean[], color: string}[], width: number, page: string, notes: string[]}}
 *   `points` are in image pixels, y downwards — the same convention as a mouse.
 */
export function traceDiagram(image, { defaultColor = '#d2d24b', threshold = INK } = {}) {
  const { width: w, height: h } = image;
  if (!(w > 8 && h > 8)) throw new Error('that image is too small to read');
  if (Math.max(w, h) > MAX_SIDE) throw new Error(`that image is ${w}×${h}; scale it under ${MAX_SIDE} first`);

  const page = pageColour(image);
  const mask = inkMask(image, page, threshold);
  const ink = mask.reduce((s, v) => s + v, 0);
  if (ink < 40) throw new Error('no ink found — is the diagram the same colour as its background?');
  if (ink > w * h * 0.6) throw new Error('almost the whole image reads as ink — the background could not be told apart');

  const skel = thin(mask, w, h);
  const bones = skel.reduce((s, v) => s + v, 0) || 1;
  const strokeWidth = Math.max(1, ink / bones);
  prune(skel, w, h, Math.max(3, Math.round(SPUR * strokeWidth)));

  // Where two strands graze each other the ink merges and the skeleton grows a
  // little X. Rub the junction pixels out and the four branches become loose
  // ends like any others — and the pairing below rejoins them by direction,
  // which is the truth: a graze is not a crossing, so there is no over or under
  // being guessed at. Only a junction that survives this is a real problem.
  const look = Math.max(3, Math.round(TANGENT * strokeWidth));
  let touches = 0;
  for (let pass = 0; pass < 3; pass++) {
    const deg = degrees(skel, w, h);
    const opening = [];
    for (let p = 0; p < skel.length; p++) {
      if (skel[p] && deg[p] > 2 && isGraze(skel, w, h, p, look)) opening.push(p);
    }
    if (!opening.length) break;
    touches += opening.length;
    for (const p of opening) skel[p] = 0;
    prune(skel, w, h, Math.max(3, Math.round(SPUR * strokeWidth)));
  }

  const { arcs, deg } = extract(skel, w, h);
  const junctions = new Set();
  for (const a of arcs) {
    for (const end of [a.pixels[0], a.pixels[a.pixels.length - 1]]) if (deg[end] > 2) junctions.add(end);
  }
  if (junctions.size) {
    throw new Error(
      `${junctions.size} place${junctions.size === 1 ? '' : 's'} in this picture have strands crossing with no ` +
        'break drawn — nothing there says which one goes under, and guessing would invent an answer',
    );
  }

  const toXY = (p) => [p % w, (p / w) | 0];
  const traced = arcs.map((a) => ({ closed: a.closed, points: rdp(a.pixels.map(toXY), 1) }));
  const closed = traced.filter((a) => a.closed);
  const open = traced.filter((a) => !a.closed && a.points.length >= 2);
  const notes = [];
  if (touches) {
    notes.push(
      `${touches} pixel${touches === 1 ? '' : 's'} where strands touched were opened up and rejoined by direction`,
    );
  }

  const loops = closed.map((a) => ({
    points: a.points,
    under: a.points.map(() => false),
    color: sampleColour(image, a.points, defaultColor),
  }));

  if (open.length) {
    const { ends, partner } = pairEnds(open, REACH * strokeWidth, TANGENT * strokeWidth);
    const endAt = (arcIndex, end) => ends.findIndex((e) => e.arc === arcIndex && e.end === end);

    const done = new Set();
    for (let start = 0; start < open.length; start++) {
      if (done.has(start)) continue;
      const points = [];
      const under = [];
      let arc = start;
      let entry = 0; // the end we come in by
      let guard = open.length + 1;
      do {
        done.add(arc);
        const run = entry === 0 ? open[arc].points : [...open[arc].points].reverse();
        points.push(...run);
        under.push(...run.map(() => false));
        const exit = entry === 0 ? 1 : 0;
        const here = endAt(arc, exit);
        const there = partner[here];
        const fill = bridge(ends[here].at, ends[there].at);
        points.push(...fill);
        under.push(...fill.map(() => true));
        arc = ends[there].arc;
        entry = ends[there].end;
      } while (!done.has(arc) && guard-- > 0);
      if (arc !== start) notes.push('a strand did not come back to where it started; it was closed anyway');
      loops.push({ points, under, color: sampleColour(image, points, defaultColor) });
    }
  }

  if (!loops.length) throw new Error('no closed strand could be made out of this picture');
  return { loops, width: strokeWidth, page: hex(page), touches, notes };
}
