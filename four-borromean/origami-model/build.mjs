// SUPERSEDED. This derives the largest cross-section each arm could have on
// its own, which gives the long and short arms different shapes — and then
// their cut ends disagree at every corner, by up to 5 mm of paper standing
// proud. See ReadMe.md; the model that gets built comes from matched.mjs and
// design.mjs. Kept because the support-function argument and its checks are
// worth having.
//
// The whole design, derived and checked in one run.
//
//     node build.mjs [mm-per-unit]
//
// Prints the numbers a folder needs and writes the two patterns as SVG. Every
// claim it prints is measured here, not asserted: the symmetry, the link type,
// that the solids miss each other, that the paper folds back to the shape it
// came from, and how badly the two different strut ends mismatch at a corner.
import { writeFileSync } from 'node:fs';
import { skeleton, recipe, edgesOf, frameOf, add, sub, mul, dot, cross, len, unit, deg } from './skeleton.mjs';
import { sectionFor, facesOf, sides, cornerAngles, area, constraintsFor } from './cross-section.mjs';
import { strut, checkFit, mitre } from './solids.mjs';
import { unitFor, cutAngles, tongueFor, refold } from './units.mjs';
import { patternFor, svgFor } from './pattern.mjs';
import { allLinking } from '../linking.mjs';

const MM = Number(process.argv[2]) || 60;      // millimetres per model unit
// Trim each strut at twice its own inradius. The untrimmed optimum grows a fin
// on the long strut, reaching 11.4 mm from its axis towards a strand 0.33
// away; the trim removes it and — measured below — costs no contact at all.
const CAP = Number(process.argv[3]) || 0.12;
const mm = (x) => (x * MM).toFixed(1);
const rings = skeleton();
const optimum = [sectionFor(rings, 0), sectionFor(rings, 1)];
const sections = [sectionFor(rings, 0, { cap: CAP }), sectionFor(rings, 1, { cap: CAP })];

console.log('THE LINK');
const lk = allLinking(rings.map((points) => ({ points })));
console.log(`  4 rings of 6 corners, tetrahedral symmetry asserted exactly`);
console.log(`  linking numbers: ${lk.lk.map((x) => x.value).join(', ')} (slop ${lk.slop.toExponential(1)})`);
const rec = recipe(rings[0]);
console.log(`  two distinct corners, repeated three times round each ring:`);
for (const r of rec.slice(0, 2))
  console.log(`    edge ${r.edge.toFixed(4)} (${mm(r.edge)} mm)   turn ${r.turn.toFixed(2)}deg   torsion ${r.torsion.toFixed(2)}deg`);
console.log(`  model across: ${mm(2 * Math.max(...rings.flat().map(len)))} mm at ${MM} mm per unit`);

console.log('\nCROSS-SECTION  (the largest convex shape the neighbours leave room for)');
const sum = (a) => a.reduce((x, y) => x + y, 0);
for (const [name, i] of [['long ', 0], ['short', 1]]) {
  console.log(`  ${name} untrimmed optimum: ${optimum[i].length} faces, perimeter ${mm(sum(sides(optimum[i])))} mm, ` +
              `area ${area(optimum[i]).toFixed(5)}, reaching ${mm(Math.max(...optimum[i].map((p) => Math.hypot(...p))))} mm from the axis`);
}
console.log(`  trimmed at ${mm(CAP)} mm from the axis — what the model is built from:`);
for (const [name, i] of [['long ', 0], ['short', 1]]) {
  const poly = sections[i];
  const f = facesOf(rings, i, poly);
  console.log(`  ${name} strut: ${poly.length} faces, perimeter ${sides(poly).reduce((a,b)=>a+b,0).toFixed(4)} (${mm(sides(poly).reduce((a,b)=>a+b,0))} mm)`);
  console.log(`    corner angles ${cornerAngles(poly).map((a) => a.toFixed(1)).join(', ')} deg`);
  console.log(`    face widths   ${sides(poly).map((s) => mm(s)).join(', ')} mm`);
  f.forEach((face) => console.log(`    face ${face.face}: ${mm(face.offset)} mm from the axis, facing ${face.normal.toFixed(1)}deg, against ${face.touches} at ${face.d.toFixed(4)}`));
}

console.log('\nDOES IT FIT');
const fit = checkFit(rings, sections);
console.log(`  ${fit.pairs} strut pairs tested as solids (separating-axis): ` +
            `${fit.overlaps.length} overlapping, ${fit.touching} touching, worst separation ${fit.worst.toExponential(2)}`);

console.log('\nUNITS  (one per edge: 3 long + 3 short per ring, 24 in the model)');
const patterns = [];
for (const [name, i] of [['long ', 0], ['short', 1]]) {
  const u = unitFor(rings, 0, i, sections);
  const t = tongueFor(rings, u, sections);
  const pat = patternFor(rings, i, sections);
  patterns.push({ name: name.trim(), pat, u, t });
  console.log(`  ${name}: strip ${mm(pat.width)} x ${mm(pat.length)} mm, plus ${mm(pat.flap)} mm glue flap`);
  console.log(`    lengthwise folds at ${pat.creases.map((c) => mm(c)).join(', ')} mm across the strip`);
  for (const c of cutAngles(u))
    console.log(`    ${c.end} cut, face by face: ${c.angles.map((a) => a.toFixed(1) + 'deg').join(', ')} to the strip's length`);
  console.log(`    tongue on face ${t.face}: ${mm(t.width)} mm wide, ${mm(t.depth)} mm long, folded along the end cut`);
  console.log(`    refold check: rebuilding the section from the flat widths is off by ${refold(u).worst.toExponential(1)}`);
}

// Does the folded tongue actually end up inside the next strut?
console.log('\nTHE TONGUE, IN THREE DIMENSIONS');
for (const i of [0, 1]) {
  const n = rings[0].length;
  const u = unitFor(rings, 0, i, sections);
  const t = tongueFor(rings, u, sections);
  const j = t.face, k = (j + 1) % u.section.length;
  const p0 = add(u.lines[j], mul(u.frame.t, u.yOut[j]));
  const p1 = add(u.lines[k], mul(u.frame.t, u.yOut[k]));
  const at = (s) => [p0[0] + (p1[0]-p0[0])*s, p0[1] + (p1[1]-p0[1])*s, p0[2] + (p1[2]-p0[2])*s];
  const refl = (v) => sub(v, mul(u.mOut, 2 * dot(sub(v, u.edge.b), u.mOut)));
  const corners = [at(t.from), at(t.to),
                   refl(add(at(t.from), mul(u.frame.t, t.depth))),
                   refl(add(at(t.to), mul(u.frame.t, t.depth)))];
  // Inside the neighbour means: within its cross-section, and short of its far
  // end. Measured as a distance, so "just inside" and "just outside" are
  // distinguishable.
  const nextU = unitFor(rings, 0, (i + 1) % n, sections);
  const sec = nextU.section;
  let worstIn = Infinity, worstEnd = Infinity;
  for (const c of corners) {
    const d = sub(c, nextU.edge.a);
    const x = dot(d, nextU.frame.u), y = dot(d, nextU.frame.v), z = dot(d, nextU.frame.t);
    for (let e = 0; e < sec.length; e++) {
      const a = sec[e], b = sec[(e + 1) % sec.length];
      let nx = b[1]-a[1], ny = -(b[0]-a[0]);
      const L = Math.hypot(nx, ny); nx /= L; ny /= L;
      const centre = sec.reduce((s, q) => [s[0]+q[0]/sec.length, s[1]+q[1]/sec.length], [0,0]);
      const sgn = ((centre[0]-a[0])*nx + (centre[1]-a[1])*ny) > 0 ? -1 : 1;
      worstIn = Math.min(worstIn, -sgn * ((x-a[0])*nx + (y-a[1])*ny));
    }
    worstEnd = Math.min(worstEnd, Math.min(...nextU.yOut) - z);
  }
  console.log(`  ${i % 2 === 0 ? 'long' : 'short'} unit's tongue: clears the pocket walls by ${mm(worstIn)} mm, ` +
              `and its tip stops ${mm(worstEnd)} mm short of the pocket's far end`);
}

// How well do two different strut ends meet at a corner?
console.log('\nTHE JOINT');
for (const i of [0, 1]) {
  const R = rings[0], n = R.length;
  const u = unitFor(rings, 0, i, sections), v = unitFor(rings, 0, (i + 1) % n, sections);
  const m = u.mOut;
  const b1 = unit(sub(u.frame.t, mul(m, dot(u.frame.t, m))));
  const b2 = cross(m, b1);
  const face = (uu, ys) => uu.lines.map((base, j) => {
    const p = add(base, mul(uu.frame.t, ys[j]));
    return [dot(sub(p, u.edge.b), b1), dot(sub(p, u.edge.b), b2)];
  });
  const A = face(u, u.yOut), B = face(v, v.yIn);
  const inter = clip(A, B);
  const aA = Math.abs(shoelace(A)), aB = Math.abs(shoelace(B)), aI = inter.length ? Math.abs(shoelace(inter)) : 0;
  console.log(`  ${i % 2 === 0 ? 'long into short' : 'short into long'}: the two mitred ends share the same plane, ` +
              `and their outlines overlap over ${(100 * aI / Math.max(aA, aB)).toFixed(0)}% of the larger one ` +
              `(${aA.toFixed(5)} vs ${aB.toFixed(5)} in area)`);
}

function shoelace(p) { return p.reduce((s, q, i) => { const r = p[(i+1)%p.length]; return s + q[0]*r[1] - r[0]*q[1]; }, 0) / 2; }
function clip(subject, window) {
  let out = subject;
  const n = window.length;
  const sign = shoelace(window) > 0 ? 1 : -1;
  for (let i = 0; i < n && out.length; i++) {
    const p = window[i], q = window[(i + 1) % n];
    const nx = sign * (q[1] - p[1]), ny = -sign * (q[0] - p[0]);
    const inside = (z) => (z[0]-p[0])*nx + (z[1]-p[1])*ny <= 1e-12;
    const next = [];
    for (let j = 0; j < out.length; j++) {
      const a = out[j], b = out[(j + 1) % out.length];
      const ia = inside(a), ib = inside(b);
      if (ia) next.push(a);
      if (ia !== ib) {
        const da = (a[0]-p[0])*nx + (a[1]-p[1])*ny, db = (b[0]-p[0])*nx + (b[1]-p[1])*ny;
        const t = da / (da - db);
        next.push([a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t]);
      }
    }
    out = next;
  }
  return out;
}

for (const { name, pat } of patterns) {
  const file = new URL(`./unit-${name}.svg`, import.meta.url);
  writeFileSync(file, svgFor(pat, { mmPerUnit: MM, label: `${name} strut — fold 12` }));
}
console.log(`\nwrote unit-long.svg and unit-short.svg at ${MM} mm per unit`);
console.log('cut 12 of each: 3 long + 3 short per ring, four rings.');
