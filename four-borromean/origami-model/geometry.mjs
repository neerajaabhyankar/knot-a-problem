// The folded model as 3D geometry, for the build page's rotatable views.
//
//     node geometry.mjs > geometry.json
//
// Every point here is a corner of a folded tube, placed by the same
// construction the fit test uses (solids.mjs: the cross-section swept along
// the edge, cut by the mitre plane at each end) and scaled by the same
// millimetres-per-unit the drawings use. Nothing is drawn by eye.
import { skeleton, recipe, edgesOf, frameOf, add, sub, mul, dot, cross, len, unit, deg } from './skeleton.mjs';
import { sectionFor, sides, cornerAngles } from './cross-section.mjs';
import { strut } from './solids.mjs';
import { unitFor, tongueFor } from './units.mjs';
import { patternFor, FLAP } from './pattern.mjs';
import { design } from './design.mjs';

const SHEET = 150, COLS = 3, ROWS = 1;
const K = Number(process.env.KGON) || 3;
const D = design(K);
const rings = D.rings;
const sections = D.sections;
const pats = [patternFor(rings, 0, sections), patternFor(rings, 1, sections)];

// The scale instructions.mjs settles on, recomputed rather than pasted in.
const blankW = SHEET / COLS, blankL = SHEET / ROWS;
const needL = (p) => (Math.max(...p.end.map((q) => q[1])) + p.tongue.depth) - Math.min(...p.start.map((q) => q[1]));
const SCALE = Math.min(...pats.map((p) => Math.min((blankW - 2) / (p.width + FLAP), (blankL - 2) / needL(p))));
const SHY = 0.15;             // mm of daylight at a joint, for the renderer only

const mm = (x) => +(x * SCALE).toFixed(2);
const pt = (p) => p.map((c) => +(c * SCALE).toFixed(3));
const r1 = (x) => +x.toFixed(1);
const r3 = (x) => +x.toFixed(3);

/**
 * A strut as triangles, wound so every normal points out of the solid.
 *
 * `shy` pulls both ends back along the axis by that many millimetres. Two arms
 * meeting at a corner end on the SAME plane, so their end faces are exactly
 * coplanar and a renderer cannot say which is in front. A tenth of the paper's
 * thickness of daylight settles it.
 */
function solidOf(ring, i, shy = 0) {
  const t = frameOf(edgesOf(ring)[i]).t;
  const back = (p, k) => (shy ? add(p, mul(t, k * shy / SCALE)) : p);
  const verts = strut(ring, i, sections[i]).map((p, k) => pt(back(p, k % 2 === 0 ? 1 : -1)));
  const m = verts.length / 2;                      // section corners
  const centre = verts.reduce((s, v) => add(s, mul(v, 1 / verts.length)), [0, 0, 0]);
  const tris = [];
  const push = (a, b, c) => {
    const n = cross(sub(verts[b], verts[a]), sub(verts[c], verts[a]));
    const mid = mul(add(add(verts[a], verts[b]), verts[c]), 1 / 3);
    tris.push(dot(n, sub(mid, centre)) < 0 ? [a, c, b] : [a, b, c]);
  };
  for (let k = 0; k < m; k++) {                    // the four walls
    const j = (k + 1) % m;
    push(2 * k, 2 * k + 1, 2 * j + 1);
    push(2 * k, 2 * j + 1, 2 * j);
  }
  for (let k = 1; k + 1 < m; k++) {                // the two mitred ends
    push(0, 2 * k, 2 * (k + 1));
    push(1, 2 * k + 1, 2 * (k + 1) + 1);
  }
  const wire = [];
  for (let k = 0; k < m; k++) {
    const j = (k + 1) % m;
    wire.push([2 * k, 2 * k + 1], [2 * k, 2 * j], [2 * k + 1, 2 * j + 1]);
  }
  // Even indices are the corners at the start of the edge, odd at the end.
  return { verts, tris, wire, ends: { start: verts.filter((_, k) => k % 2 === 0).map((_, k) => 2 * k),
                                      finish: verts.filter((_, k) => k % 2 === 1).map((_, k) => 2 * k + 1) } };
}

/**
 * The tongue of unit `i`, folded, in the world — a quad of paper reflected in
 * the mitre plane, which is what folding along that line does to it.
 *
 * Also checks, in three dimensions, that the folded tongue really is inside
 * the next arm: how far it clears that arm's walls, and how far short of its
 * far end it stops. Same test build.mjs runs.
 */
function tongueOf(ring, i) {
  const n = ring.length;
  const u = unitFor([ring], 0, i, sections);
  const tg = tongueFor([ring], u, sections);
  if (tg.face === null) return null;
  const m = u.section.length;
  const j = tg.face, k = (j + 1) % m;
  const p0 = add(u.lines[j], mul(u.frame.t, u.yOut[j]));
  const p1 = add(u.lines[k], mul(u.frame.t, u.yOut[k]));
  const along = (t) => add(p0, mul(sub(p1, p0), t));
  const refl = (v) => sub(v, mul(u.mOut, 2 * dot(sub(v, u.edge.b), u.mOut)));
  const quad = [along(tg.from), along(tg.to),
                refl(add(along(tg.to), mul(u.frame.t, tg.depth))),
                refl(add(along(tg.from), mul(u.frame.t, tg.depth)))];

  const next = unitFor([ring], 0, (i + 1) % n, sections);
  const sec = next.section;
  const centre = sec.reduce((s, q) => [s[0] + q[0] / sec.length, s[1] + q[1] / sec.length], [0, 0]);
  let wall = Infinity, stop = Infinity;
  for (const c of quad) {
    const d = sub(c, next.edge.a);
    const x = dot(d, next.frame.u), y = dot(d, next.frame.v), z = dot(d, next.frame.t);
    for (let e = 0; e < sec.length; e++) {
      const a = sec[e], b = sec[(e + 1) % sec.length];
      let nx = b[1] - a[1], ny = -(b[0] - a[0]);
      const L = Math.hypot(nx, ny); nx /= L; ny /= L;
      const sgn = ((centre[0] - a[0]) * nx + (centre[1] - a[1]) * ny) > 0 ? -1 : 1;
      wall = Math.min(wall, -sgn * ((x - a[0]) * nx + (y - a[1]) * ny));
    }
    stop = Math.min(stop, Math.min(...next.yOut) - z);
  }
  return {
    world: quad.map(pt),
    tris: [[0, 1, 2], [0, 2, 3]],
    wire: [[0, 1], [1, 2], [2, 3], [3, 0]],
    width: r1(tg.width * SCALE), depth: r1(tg.depth * SCALE), face: tg.face,
    clears: r1(wall * SCALE), short: r1(stop * SCALE),
  };
}

/** Closest approach between two segments: the two points and the distance. */
function approach(p0, p1, q0, q1) {
  const u = sub(p1, p0), v = sub(q1, q0), w = sub(p0, q0);
  const a = dot(u, u), b = dot(u, v), c = dot(v, v), d = dot(u, w), e = dot(v, w);
  const D = a * c - b * b;
  let s = D < 1e-12 ? 0 : (b * e - c * d) / D;
  s = Math.max(0, Math.min(1, s));
  let t = Math.max(0, Math.min(1, (b * s + e) / (c > 1e-12 ? c : 1)));
  s = Math.max(0, Math.min(1, (b * t - d) / (a > 1e-12 ? a : 1)));
  const pa = add(p0, mul(u, s)), pb = add(q0, mul(v, t));
  return { pa, pb, d: len(sub(pa, pb)) };
}

// --- scene 1: one tube of each kind ----------------------------------------
// Measured on the end WITHOUT the tongue, since that is the one a ruler can
// reach. Both ends are cut on a slant, so the opening is wider than the
// cross-section — these are the opening's own lengths.
const tubes = [0, 1].map((i) => {
  const s = solidOf(rings[0], i);
  const sec = sections[i];
  const m = sec.length;
  // Into the strut's own frame: axis along x, so one arm lies across a wide
  // view rather than up it.
  const f = frameOf(edgesOf(rings[0])[i]);
  const o = pt(edgesOf(rings[0])[i].a);
  const into = (p) => [r3(dot(sub(p, o), f.t)), r3(dot(sub(p, o), f.u)), r3(dot(sub(p, o), f.v))];
  const verts = s.verts.map(into);
  const open = Array.from({ length: m }, (_, k) => 2 * k);
  const labels = [];
  for (let a = 0; a < m; a++) for (let b = a + 2; b < m; b++) {
    if (a === 0 && b === m - 1) continue;          // that pair is a side, not a diagonal
    labels.push({ kind: 'diagonal', from: verts[open[a]], to: verts[open[b]],
                  text: `${r1(len(sub(verts[open[a]], verts[open[b]])))} mm`, note: `corner ${a}–${b}` });
  }
  for (let k = 0; k < m; k++) {
    const j = (k + 1) % m;
    labels.push({ kind: 'rim', from: verts[open[k]], to: verts[open[j]],
                  text: `${r1(len(sub(verts[open[k]], verts[open[j]])))} mm`, note: `rim ${k}` });
  }
  const tg = tongueOf(rings[0], i);
  return {
    name: i === 0 ? 'long' : 'short',
    verts, tris: s.tris, wire: s.wire, labels,
    corners: open.map((v, k) => ({ at: verts[v], name: String(k) })),
    tongue: tg && { verts: tg.world.map(into), tris: tg.tris, wire: tg.wire,
                    width: tg.width, depth: tg.depth, face: tg.face },
    axis: r1(len(sub(edgesOf(rings[0])[i].b, edgesOf(rings[0])[i].a)) * SCALE),
    sectionAngles: cornerAngles(sec).map(r1),
    faceWidths: sides(sec).map(mm),
  };
});

// --- scene 2: one ring of six, and the two joints in close-up --------------
const ringCorners = rings[0].map(pt);
const rec = recipe(rings[0]);
const ringArms = edgesOf(rings[0]).map((e) => ({
  kind: e.i % 2 === 0 ? 'long' : 'short',
  ...solidOf(rings[0], e.i, SHY),
  tongue: tongueOf(rings[0], e.i),
}));
const ringScene = {
  arms: ringArms,
  corners: ringCorners,
  joints: rec.map((r, i) => ({ at: ringCorners[i], angle: r1(180 - r.turn) })),
  // One close-up per distinct joint: arm `arrive` pushes its tongue into arm
  // `receive`, and they meet at corner `at`.
  closeups: [0, 1].map((i) => {
    const tg = ringArms[i].tongue;
    // Where to stand to see the joint: square on to the plane the two arms
    // share, so the angle between them is the angle on screen, looking in from
    // outside the ring. The viewer tilts a little off this of its own accord.
    const es = edgesOf(rings[0]);
    const tIn = unit(sub(es[i].b, es[i].a)), tOut = unit(sub(es[(i + 1) % 6].b, es[(i + 1) % 6].a));
    let n = unit(cross(tIn, tOut));
    const hub = rings[0].reduce((a, p) => add(a, mul(p, 1 / 6)), [0, 0, 0]);
    if (dot(n, sub(rings[0][(i + 1) % 6], hub)) < 0) n = mul(n, -1);
    return {
      arrive: i, receive: (i + 1) % 6, at: ringCorners[(i + 1) % 6],
      angle: r1(180 - rec[(i + 1) % 6].turn),
      name: `${i === 0 ? 'long' : 'short'} into ${i === 0 ? 'short' : 'long'}`,
      tongue: { width: tg.width, depth: tg.depth, clears: tg.clears, short: tg.short },
      view: { az: r3(Math.atan2(n[0], n[2])), el: r3(Math.asin(Math.max(-1, Math.min(1, n[1])))) },
    };
  }),
  diagonals: (() => {
    const out = [];
    for (let a = 0; a < 6; a++) for (let b = a + 2; b < 6; b++) {
      if (a === 0 && b === 5) continue;
      out.push({ between: [a, b], from: ringCorners[a], to: ringCorners[b],
                 mm: r1(len(sub(ringCorners[a], ringCorners[b]))) });
    }
    return out;
  })(),
};

// --- scene 3: the whole model ----------------------------------------------
let closest = null;
rings.forEach((A, ai) => rings.forEach((B, bi) => {
  if (bi <= ai) return;
  edgesOf(A).forEach((e) => edgesOf(B).forEach((g) => {
    const got = approach(pt(e.a), pt(e.b), pt(g.a), pt(g.b));
    if (!closest || got.d < closest.d) closest = { ...got, a: `${ai}/${e.i}`, b: `${bi}/${g.i}` };
  }));
}));
const model = {
  rings: rings.map((ring, ri) => ({
    ring: ri,
    arms: edgesOf(ring).map((e) => ({ kind: e.i % 2 === 0 ? 'long' : 'short', ...solidOf(ring, e.i, SHY) })),
    corners: ring.map(pt),
  })),
  sphere: r1(2 * Math.max(...rings.flat().map((p) => len(p))) * SCALE),
  closest: { from: closest.pa.map(r1), to: closest.pb.map(r1), mm: r1(closest.d), between: [closest.a, closest.b] },
  // The widest caliper reading: a real pair of paper corners, unlike the
  // circumscribed sphere, whose far end is in mid-air.
  widest: (() => {
    const pts = rings.flatMap((ring) => edgesOf(ring).flatMap((e) => strut(ring, e.i, sections[e.i]).map(pt)));
    let best = { mm: 0 };
    for (let a = 0; a < pts.length; a++)
      for (let b = a + 1; b < pts.length; b++) {
        const d = len(sub(pts[a], pts[b]));
        if (d > best.mm) best = { mm: d, from: pts[a], to: pts[b] };
      }
    return { from: best.from.map(r1), to: best.to.map(r1), mm: r1(best.mm) };
  })(),
};

process.stdout.write(JSON.stringify({ scale: +SCALE.toFixed(3), tubes, ring: ringScene, model }, null, 1));
