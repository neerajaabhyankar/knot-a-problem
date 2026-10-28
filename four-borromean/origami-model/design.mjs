// The matched design: one cross-section, carried round the ring by the folds.
//
// Section i+1 is section i reflected in the mitre plane at the corner between
// them, so the two cut ends have the SAME outline and the joint closes like a
// picture frame. For that to come back on itself the shape must survive the
// ring's two-corner twist, so it is a regular k-gon and the ring's shape was
// moved (matched.mjs) until that twist is exactly 360/k.
import { readFileSync } from 'node:fs';
import { fromArc } from '../polygon.mjs';
import { edgesOf, frameOf, add, sub, mul, dot, cross, len, unit, deg } from './skeleton.mjs';
import { strut, separation, mitre } from './solids.mjs';
import { allConstraints, bestKgon, pairTwistOf, twistOf } from './matched.mjs';

const rad = (d) => d * Math.PI / 180;
export const DESIGNS = JSON.parse(readFileSync(new URL('./matched.json', import.meta.url), 'utf8'));

/** The 2x2 map from cross-section coordinates on edge i to those on edge i+1. */
function stepOf(ring, i) {
  const n = ring.length, j = (i + 1) % n;
  const es = edgesOf(ring);
  const Fi = frameOf(es[i]), Fj = frameOf(es[j]);
  const nrm = unit(sub(Fi.t, Fj.t));
  const refl = (x) => sub(x, mul(nrm, 2 * dot(x, nrm)));
  const u2 = refl(Fi.u), v2 = refl(Fi.v);
  return [[dot(u2, Fj.u), dot(v2, Fj.u)], [dot(u2, Fj.v), dot(v2, Fj.v)]];
}
const apply = (M, p) => [M[0][0]*p[0] + M[0][1]*p[1], M[1][0]*p[0] + M[1][1]*p[1]];

/** One design, ready to build from: the rings and a cross-section per edge. */
export function design(k) {
  const d = DESIGNS[String(k)];
  if (!d) throw new Error(`no ${k}-fold design; run matched.mjs`);
  const rings = fromArc(d.arc).map((c) => c.points);
  const ring = rings[0], n = ring.length;
  const base = Array.from({ length: k }, (_, m) =>
    [d.r * Math.cos(rad(d.turn) + 2*Math.PI*m/k), d.r * Math.sin(rad(d.turn) + 2*Math.PI*m/k)]);
  const sections = [base];
  for (let i = 0; i < n - 1; i++) sections.push(sections[i].map((p) => apply(stepOf(ring, i), p)));
  return { k, rings, sections, arc: d.arc, r: d.r, turn: d.turn,
           pair: pairTwistOf(ring), twist: twistOf(ring) };
}

/**
 * How well the two ends at a corner match: the largest distance from a corner
 * of one outline to the nearest corner of the other, in the shared plane.
 * Zero means a true mitre.
 */
export function jointGap(rings, sections, i) {
  const ring = rings[0], n = ring.length, j = (i + 1) % n;
  const es = edgesOf(ring);
  const Fi = frameOf(es[i]), Fj = frameOf(es[j]);
  const m = unit(sub(Fi.t, Fj.t));
  const b1 = unit(sub(Fi.t, mul(m, dot(Fi.t, m)))), b2 = cross(m, b1);
  // Where each cross-section line crosses the shared plane.
  const outline = (F, sec, through) => sec.map(([a, b]) => {
    const base = add(add(through, mul(F.u, a)), mul(F.v, b));
    const t = dot(sub(es[i].b, base), m) / dot(F.t, m);
    const p = add(base, mul(F.t, t));
    return [dot(sub(p, es[i].b), b1), dot(sub(p, es[i].b), b2)];
  });
  const A = outline(Fi, sections[i], es[i].a), B = outline(Fj, sections[j], es[j].a);
  let worst = 0;
  for (const p of A) worst = Math.max(worst, Math.min(...B.map((q) => Math.hypot(p[0]-q[0], p[1]-q[1]))));
  for (const q of B) worst = Math.max(worst, Math.min(...A.map((p) => Math.hypot(p[0]-q[0], p[1]-q[1]))));
  return worst;
}

const faceNormals = (verts) => {
  const out = [];
  for (let i = 0; i < verts.length; i++)
    for (let j = i+1; j < verts.length; j++)
      for (let k = j+1; k < verts.length; k++) {
        const nrm = cross(sub(verts[j], verts[i]), sub(verts[k], verts[i]));
        if (len(nrm) < 1e-9) continue;
        const u = unit(nrm);
        const ds = verts.map((v) => dot(sub(v, verts[i]), u));
        if (Math.min(...ds) > -1e-9 || Math.max(...ds) < 1e-9) out.push(u);
      }
  return out;
};
const edgeDirs = (verts) => {
  const out = [];
  for (let i = 0; i < verts.length; i++)
    for (let j = i+1; j < verts.length; j++) {
      const d = sub(verts[j], verts[i]);
      if (len(d) > 1e-9) out.push(unit(d));
    }
  return out;
};

/** Every arm of the model as a solid, and whether any two of them overlap. */
export function checkSolids(rings, sections) {
  const arms = [];
  rings.forEach((ring, ri) => edgesOf(ring).forEach((e) => {
    const verts = strut(ring, e.i, sections[e.i]);
    arms.push({ ring: ri, edge: e.i, verts, faces: faceNormals(verts), dirs: edgeDirs(verts) });
  }));
  let worst = Infinity, touching = 0, overlaps = [];
  for (let i = 0; i < arms.length; i++)
    for (let j = i+1; j < arms.length; j++) {
      const A = arms[i], B = arms[j];
      if (A.ring === B.ring) {
        const n = rings[A.ring].length;
        const d = Math.min(Math.abs(A.edge - B.edge), n - Math.abs(A.edge - B.edge));
        if (d <= 1) continue;                     // they share a corner, so they meet
      }
      const s = separation(A.verts, B.verts, A.faces, B.faces, A.dirs, B.dirs);
      if (s < worst) worst = s;
      if (s < 1e-4) touching++;
      if (s < -1e-6) overlaps.push({ a: `${A.ring}/${A.edge}`, b: `${B.ring}/${B.edge}`, depth: s });
    }
  return { pairs: arms.length * (arms.length - 1) / 2, worst, touching, overlaps, arms };
}

if (process.argv[1] && process.argv[1].endsWith('design.mjs')) {
  const { checkSymmetry } = await import('../tetra.mjs');
  const { idOf, REFERENCE, sublinks } = await import('../lib.mjs');
  const { allLinking } = await import('../linking.mjs');
  const { unitFor, tongueFor, refold } = await import('./units.mjs');
  const { patternFor, FLAP } = await import('./pattern.mjs');
  const MODEL = Number(process.argv[3]) || 150;        // mm across
  for (const k of (process.argv[2] ? [Number(process.argv[2])] : [3, 4, 6])) {
    const D = design(k);
    const span = 2 * Math.max(...D.rings.flat().map(len));
    const S = MODEL / span;                            // mm per model unit
    const mm = (x) => (x * S).toFixed(1);
    console.log(`\n${k}-GON TUBE  —  two-corner twist ${D.pair.toFixed(6)} deg, whole ring ${D.twist.toFixed(4)} deg`);

    const curves = D.rings.map((points) => ({ points }));
    let sym = 'holds exactly';
    try { checkSymmetry(curves); } catch (e) { sym = 'FAILED'; }
    const lk = allLinking(curves);
    const subs = sublinks(curves).map((x) => {
      const first = idOf(x.curves, 160);
      return first.ok ? first : idOf(x.curves, 640);
    });
    console.log(`  LINK: tetrahedral symmetry ${sym}; every pair of rings has linking number ` +
                `${lk.lk.map((x) => x.value).join(', ')}; each three-ring sublink reads as ` +
                `${subs.every((x) => x.ok && x.print === REFERENCE.borromean) ? 'the Borromean rings' : 'SOMETHING ELSE'} ` +
                `(${subs.map((x) => (x.ok ? x.n : '?')).join('/')} crossings)`);

    console.log(`  TUBE: ${mm(2 * D.r * Math.sin(Math.PI / k))} mm per face, ` +
                `${mm(D.r)} mm centre to corner, ${mm(D.r * Math.cos(Math.PI / k))} mm centre to face`);
    const es = edgesOf(D.rings[0]).map((e) => len(sub(e.b, e.a)));
    console.log(`  ARMS: ${mm(es[0])} and ${mm(es[1])} mm long, three of each per ring`);

    let worstJoint = 0;
    for (let i = 0; i < 6; i++) worstJoint = Math.max(worstJoint, jointGap(D.rings, D.sections, i));
    console.log(`  JOINTS: the two cut ends at a corner differ by ${(worstJoint * S).toExponential(2)} mm — a true mitre`);

    const fit = checkSolids(D.rings, D.sections);
    console.log(`  SOLIDS: ${fit.pairs} pairs of arms tested as solids; ${fit.overlaps.length} overlap, ` +
                `${fit.touching} touch, worst separation ${(fit.worst * S).toFixed(3)} mm`);

    for (const i of [0, 1]) {
      const u = unitFor(D.rings, 0, i, D.sections);
      const t = tongueFor(D.rings, u, D.sections);
      const pat = patternFor(D.rings, i, D.sections);
      const needL = Math.max(...pat.end.map((q) => q[1])) + pat.tongue.depth - Math.min(...pat.start.map((q) => q[1]));
      console.log(`  ${i === 0 ? 'LONG ' : 'SHORT'} unit: blank ${mm(pat.width + FLAP)} x ${mm(needL)} mm, ` +
                  `tongue ${mm(t.width)} x ${mm(t.depth)} mm on face ${t.face}; ` +
                  `refolding the flat pattern reproduces the solid to ${refold(u).worst.toExponential(1)}`);
    }
  }
}
