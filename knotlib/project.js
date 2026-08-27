// Space curve → diagram.
//
// This is the bridge between the editor's world and everything combinatorial,
// and it is the step that has to be careful, because **a crossing is a property
// of a projection, not of a curve**. There is nothing to point at until a
// direction has been chosen, and not every direction works: a Hopf link of two
// perpendicular circles, viewed down the axis of one, projects that component
// to a line segment and defines no crossings at all.
//
// So `project` refuses rather than guesses. `choose` searches directions and
// keeps the best one that is generic — deterministically, from a fixed spiral,
// so the same curves always give the same answer and a test can rely on it.

import { DART, Diagram } from './diagram.js';

/** Relative tolerances, all measured against the diameter of the drawing. */
const TOL = {
  angle: 1e-3,      // |sin| between crossing segments — below this it's a tangency
  coincide: 1e-4,   // two crossings at the same place
  height: 1e-6,     // the two strands at a crossing are at the same depth, i.e. they touch
  endpoint: 1e-7,   // a crossing sitting exactly on a vertex
  collinear: 1e-4,  // two stretches of strand lying along the same line
};
/** Segments this close together along one component are neighbours, not crossings. */
const NEIGHBOUR = 2;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm3 = (a) => {
  const m = Math.hypot(...a);
  if (!(m > 0)) throw new Error('direction has no length');
  return [a[0] / m, a[1] / m, a[2] / m];
};

export class DegenerateProjection extends Error {}

/** A right-handed frame whose third axis is `w`. */
function frame(w) {
  const n = norm3(w);
  const seed = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = norm3(cross3(seed, n));
  const v = cross3(n, u);
  return { u, v, w: n };
}

/**
 * Flatten the curves along `direction`: 2D positions plus the height that
 * decides which strand is on top.
 */
function flatten(curves, direction) {
  const { u, v, w } = frame(direction);
  return curves.map((curve) => ({
    xy: curve.points.map((p) => [dot3(p, u), dot3(p, v)]),
    h: curve.points.map((p) => dot3(p, w)),
  }));
}

function diameter(flat) {
  const all = flat.flatMap((f) => f.xy);
  const lo = [Math.min(...all.map((p) => p[0])), Math.min(...all.map((p) => p[1]))];
  const hi = [Math.max(...all.map((p) => p[0])), Math.max(...all.map((p) => p[1]))];
  return Math.max(Math.hypot(hi[0] - lo[0], hi[1] - lo[1]), 1e-12);
}

/**
 * Every place the flattened drawing crosses itself, with the genericity checks
 * that decide whether this projection is usable at all.
 */
function findCrossings(flat, scale) {
  const segs = [];
  flat.forEach((f, ci) => {
    const m = f.xy.length;
    for (let i = 0; i < m; i++) {
      segs.push({ ci, i, a: f.xy[i], b: f.xy[(i + 1) % m], ha: f.h[i], hb: f.h[(i + 1) % m] });
    }
  });

  const found = [];
  for (let x = 0; x < segs.length; x++) {
    for (let y = x + 1; y < segs.length; y++) {
      const P = segs[x];
      const Q = segs[y];
      if (P.ci === Q.ci) {
        const m = flat[P.ci].xy.length;
        const gap = Math.min(Math.abs(P.i - Q.i), m - Math.abs(P.i - Q.i));
        if (gap <= NEIGHBOUR) continue;
      }
      const r = [P.b[0] - P.a[0], P.b[1] - P.a[1]];
      const s = [Q.b[0] - Q.a[0], Q.b[1] - Q.a[1]];
      const denom = r[0] * s[1] - r[1] * s[0];
      const lr = Math.hypot(...r);
      const ls = Math.hypot(...s);
      const sine = Math.abs(denom) / (lr * ls || 1);

      if (sine < TOL.angle) {
        // Parallel. Harmless unless they also lie on the same line and overlap,
        // which is what an edge-on circle looks like: a strand painted over
        // itself, with no crossings to read because there is no picture left.
        const off = Math.abs((Q.a[0] - P.a[0]) * r[1] - (Q.a[1] - P.a[1]) * r[0]) / (lr || 1);
        if (off < TOL.collinear * scale) {
          const t0 = ((Q.a[0] - P.a[0]) * r[0] + (Q.a[1] - P.a[1]) * r[1]) / (lr * lr);
          const t1 = ((Q.b[0] - P.a[0]) * r[0] + (Q.b[1] - P.a[1]) * r[1]) / (lr * lr);
          if (Math.max(t0, t1) > 0 && Math.min(t0, t1) < 1) {
            throw new DegenerateProjection(
              'strands lie along each other in this projection — nothing to read a crossing from',
            );
          }
        }
        continue;
      }

      const qp = [Q.a[0] - P.a[0], Q.a[1] - P.a[1]];
      const t = (qp[0] * s[1] - qp[1] * s[0]) / denom;
      const u = (qp[0] * r[1] - qp[1] * r[0]) / denom;
      if (t <= 0 || t >= 1 || u <= 0 || u >= 1) continue;
      if (Math.min(t, 1 - t, u, 1 - u) < TOL.endpoint) {
        throw new DegenerateProjection('a crossing lands exactly on a vertex');
      }

      const at = [P.a[0] + r[0] * t, P.a[1] + r[1] * t];
      const hP = P.ha + (P.hb - P.ha) * t;
      const hQ = Q.ha + (Q.hb - Q.ha) * u;
      if (Math.abs(hP - hQ) < TOL.height * scale) {
        throw new DegenerateProjection('the two strands at a crossing are at the same depth — they touch');
      }
      found.push({
        at,
        A: { ci: P.ci, i: P.i, t, dir: [r[0] / lr, r[1] / lr], h: hP },
        B: { ci: Q.ci, i: Q.i, t: u, dir: [s[0] / ls, s[1] / ls], h: hQ },
      });
    }
  }

  for (let i = 0; i < found.length; i++) {
    for (let j = i + 1; j < found.length; j++) {
      if (Math.hypot(found[i].at[0] - found[j].at[0], found[i].at[1] - found[j].at[1]) < TOL.coincide * scale) {
        throw new DegenerateProjection('two crossings land on the same point');
      }
    }
  }
  return found;
}

/**
 * Read a diagram off the curves, looking along `direction`.
 *
 * @param {{points: number[][], closed?: boolean}[]} curves — closed loops only;
 *   an open arc has no knot type, so there is nothing honest to return for one.
 * @returns {{diagram: Diagram, direction: number[], layout: object}}
 * @throws {DegenerateProjection} when this direction does not give a readable
 *   picture. That is a real answer, not a failure — pick another direction.
 */
export function project(curves, direction = [0, 0, 1]) {
  if (!Array.isArray(curves) || curves.length === 0) throw new Error('nothing to project');
  for (const c of curves) {
    if (!Array.isArray(c.points) || c.points.length < 3) throw new Error('a curve needs at least three points');
    if (c.closed === false) throw new Error('open arcs have no knot type — close the curve first');
  }

  const dir = norm3(direction);
  const flat = flatten(curves, dir);
  const scale = diameter(flat);
  const found = findCrossings(flat, scale);

  // Order the passes along each component, so the arcs between them are known.
  const events = curves.map(() => []);
  found.forEach((x, k) => {
    events[x.A.ci].push({ k, side: 'A', ...x.A });
    events[x.B.ci].push({ k, side: 'B', ...x.B });
  });
  for (const list of events) list.sort((p, q) => p.i - q.i || p.t - q.t);

  const n = found.length;
  const loops = events.filter((list) => list.length === 0).length;

  // Slots, counter-clockwise. At each crossing the four rays are ±dirA and
  // ±dirB; sorting them by angle puts each strand into opposite slots, which is
  // the invariant the whole dart representation rests on.
  const slotOf = found.map(() => ({}));
  const over = new Uint8Array(n);
  found.forEach((x, k) => {
    const rays = [
      { key: 'A-', ang: Math.atan2(-x.A.dir[1], -x.A.dir[0]) },
      { key: 'A+', ang: Math.atan2(x.A.dir[1], x.A.dir[0]) },
      { key: 'B-', ang: Math.atan2(-x.B.dir[1], -x.B.dir[0]) },
      { key: 'B+', ang: Math.atan2(x.B.dir[1], x.B.dir[0]) },
    ].sort((p, q) => p.ang - q.ang);
    rays.forEach((r, s) => {
      slotOf[k][r.key] = s;
    });
    for (const side of ['A', 'B']) {
      if (Math.abs(slotOf[k][`${side}+`] - slotOf[k][`${side}-`]) !== 2) {
        throw new DegenerateProjection('a strand does not run straight through its own crossing');
      }
    }
    const top = x.A.h > x.B.h ? 'A' : 'B';
    over[k] = slotOf[k][`${top}+`] & 1;
  });

  // Arcs: the outgoing ray of one pass meets the incoming ray of the next.
  const pair = new Int32Array(4 * n).fill(-1);
  const join = (d, e) => {
    pair[d] = e;
    pair[e] = d;
  };
  for (const list of events) {
    for (let i = 0; i < list.length; i++) {
      const here = list[i];
      const next = list[(i + 1) % list.length];
      join(DART(here.k, slotOf[here.k][`${here.side}+`]), DART(next.k, slotOf[next.k][`${next.side}-`]));
    }
  }
  for (let d = 0; d < 4 * n; d++) if (pair[d] < 0) throw new Error(`dart ${d} was never joined`);

  const diagram = new Diagram({ n, pair, over, loops });
  const layout = {
    scale,
    components: flat.map((f) => f.xy),
    crossings: found.map((x) => x.at),
  };
  return { diagram, direction: dir, layout };
}

/**
 * Directions spread evenly over the sphere, deterministically. A Fibonacci
 * spiral rather than a random sample, so a test that finds a 3-crossing trefoil
 * today finds one tomorrow.
 */
export function directions(count) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i) => {
    const z = 1 - (2 * i + 1) / count;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const a = golden * i;
    return [r * Math.cos(a), r * Math.sin(a), z];
  });
}

/**
 * Search for a good projection: the fewest crossings among the directions that
 * are generic. This is a search, not a formula — the honest claim is "the best
 * of what was tried", never "minimal", and `tried`/`usable` are returned so a
 * caller can say so.
 */
export function choose(curves, { samples = 64 } = {}) {
  let best = null;
  let usable = 0;
  const failures = new Map();
  for (const d of directions(samples)) {
    let got;
    try {
      got = project(curves, d);
    } catch (e) {
      if (!(e instanceof DegenerateProjection)) throw e;
      failures.set(e.message, (failures.get(e.message) ?? 0) + 1);
      continue;
    }
    usable++;
    if (!best || got.diagram.n < best.diagram.n) best = got;
  }
  if (!best) {
    throw new DegenerateProjection(
      `no generic direction among ${samples} tried: ${[...failures].map(([m, k]) => `${k}× ${m}`).join('; ')}`,
    );
  }
  return { ...best, tried: samples, usable };
}
