// Numbers for building the model by hand from 15 x 15 cm origami paper.
//
//     node instructions.mjs [sheet-mm]
//
// Picks a scale that lets one sheet make one ring, then prints every length
// and angle needed to draw, fold, join and check a unit. Also prints the
// measurements used as checks at each stage, which are computed here rather
// than guessed: a check nobody derived is not a check.
import { writeFileSync } from 'node:fs';
import { skeleton, recipe, edgesOf, frameOf, add, sub, mul, dot, cross, len, unit, deg } from './skeleton.mjs';
import { sectionFor, sides, cornerAngles } from './cross-section.mjs';
import { strut } from './solids.mjs';
import { design, jointGap } from './design.mjs';
import { edgeClearance, selfEdgeClearance } from '../polygon.mjs';

const gapOf = (rs) => Math.min(edgeClearance(rs.map((points) => ({ points }))),
                               selfEdgeClearance(rs.map((points) => ({ points })))); 
import { unitFor, cutAngles, tongueFor } from './units.mjs';
import { patternFor, FLAP } from './pattern.mjs';

const SHEET = Number(process.argv[2]) || 150;
// How the sheet is cut up. Three strips the full height of the sheet gives the
// biggest units that still divide a sheet evenly: two sheets per ring, eight
// for the model. Cutting it into eight small blanks instead halves the scale
// and leaves tongues 3 mm wide, which is too small to thread.
const COLS = Number(process.argv[3]) || 3;
const ROWS = Number(process.argv[4]) || 1;
// The matched design: a regular triangular tube, and a ring shape whose
// two-corner twist is exactly 120 degrees, so every joint closes like a mitre.
const K = Number(process.env.KGON) || 3;
const D = design(K);
const rings = D.rings;
const sections = D.sections;
const pats = [patternFor(rings, 0, sections), patternFor(rings, 1, sections)];

// --- scale ------------------------------------------------------------------
// One sheet per ring: six units, cut as a 4 x 2 grid of blanks, so a blank is
// a quarter of the sheet wide and half of it long. The scale is whatever makes
// the biggest unit fit a blank.
const blankW = SHEET / COLS, blankL = SHEET / ROWS;
const needW = (p) => p.width + FLAP;                      // strip plus glue flap
const needL = (p) => (Math.max(...p.end.map((q) => q[1])) + p.tongue.depth) - Math.min(...p.start.map((q) => q[1]));
const scale = Math.min(
  ...pats.map((p) => Math.min((blankW - 2) / needW(p), (blankL - 2) / needL(p))),
);
const mm = (x) => +(x * scale).toFixed(1);

console.log(`sheet ${SHEET} mm, blank ${blankW} x ${blankL} mm, scale ${scale.toFixed(2)} mm per model unit`);
console.log(`finished model ${mm(2 * Math.max(...rings.flat().map(len)))} mm across\n`);

const out = { sheet: SHEET, blank: [blankW, blankL], scale, units: [], checks: {} };

for (const [name, i] of [['long', 0], ['short', 1]]) {
  const p = pats[i], u = unitFor(rings, 0, i, sections);
  const y0 = Math.min(...p.start.map((q) => q[1]));
  const pts = p.x = p.start.map((q, j) => ({
    across: mm(q[0]),
    start: mm(p.start[j][1] - y0),
    end: mm(p.end[j][1] - y0),
  }));
  // What a ruler can reach on a folded tube. Both ends are cut on a slant, so
  // the rim and the diagonals across an opening are LONGER than the
  // cross-section's — measuring the cross-section itself would mean cutting
  // the tube in half. The end quoted is the one without the tongue, since the
  // tongue is in the way at the other one.
  const m = u.section.length;
  const v = strut(rings[0], i, sections[i]);
  const open = u.section.map((_, k) => v[2 * k]);
  const rim = open.map((q, k) => ({ face: k, mm: mm(len(sub(open[(k + 1) % m], q))) }));
  const diag = [];
  for (let a = 0; a < m; a++)
    for (let b = a + 2; b < m; b++)
      if (!(a === 0 && b === m - 1))        // that pair is a side, not a diagonal
        diag.push({ between: [a, b], mm: mm(len(sub(open[a], open[b]))) });

  const rec = recipe(rings[0]);
  out.units.push({
    name,
    blank: [mm(p.width + FLAP), mm(needL(p))],
    stripWidth: mm(p.width),
    flap: mm(FLAP),
    axis: mm(p.length),
    faces: p.faces.map(mm),
    creases: p.creases.map(mm),
    points: pts,
    cuts: cutAngles(u),
    sectionAngles: cornerAngles(u.section).map((a) => +a.toFixed(1)),
    openEnd: { end: 'the end without the tongue', rim, diagonals: diag },
    tongue: {
      face: p.tongue.face, width: mm(p.tongue.width), depth: mm(p.tongue.depth),
      // Where to draw it: the two points where it meets the upper cut, and how
      // far past that line the paper carries on.
      base: p.tongue.fold.map((q) => ({ across: mm(q[0]), from: mm(q[1] - y0) })),
      tip: p.tongue.outline.slice(1, 3).map((q) => ({ across: mm(q[0]), from: mm(q[1] - y0) })),
    },
    turnAfter: +rec[(i + 1) % 6].turn.toFixed(1),       // the corner this unit's tongue makes
    angleAfter: +(180 - rec[(i + 1) % 6].turn).toFixed(1),   // what a protractor reads there
  });
  console.log(`${name.toUpperCase()} unit — blank ${mm(p.width + FLAP)} x ${mm(needL(p))} mm`);
  console.log(`  strip ${mm(p.width)} mm wide + ${mm(FLAP)} mm flap, axis ${mm(p.length)} mm`);
  console.log(`  fold lines across the blank at: ${p.creases.map(mm).join(', ')} mm`);
  console.log(`  mark points — both measured from the SAME (bottom) edge of the blank:`);
  pts.forEach((q, j) => console.log(`    ${j}: across ${q.across} mm  lower mark ${q.start} mm  upper mark ${q.end} mm`));
  console.log(`  folded tube corner angles: ${cornerAngles(u.section).map((a) => a.toFixed(1)).join(', ')} deg`);
  console.log(`  across the end WITHOUT the tongue — rim: ${rim.map((r) => `${r.mm}`).join(', ')} mm`);
  console.log(`  across the end WITHOUT the tongue — diagonals: ${diag.map((d) => `${d.between.join('-')} = ${d.mm} mm`).join(', ')}`);
  console.log(`  tongue on face ${p.tongue.face} (faces counted from the flap edge), ${mm(p.tongue.width)} x ${mm(p.tongue.depth)} mm`);
  console.log(`    its base runs from (across ${mm(p.tongue.fold[0][0])}, ${mm(p.tongue.fold[0][1]-y0)}) to (across ${mm(p.tongue.fold[1][0])}, ${mm(p.tongue.fold[1][1]-y0)})`);
  console.log(`    its tip  runs from (across ${mm(p.tongue.outline[1][0])}, ${mm(p.tongue.outline[1][1]-y0)}) to (across ${mm(p.tongue.outline[2][0])}, ${mm(p.tongue.outline[2][1]-y0)})\n`);
}

// --- checks on the ring -----------------------------------------------------
const R = rings[0];
// Measured from the RING's own centre, which is not the model's: the ring's
// centre sits off the middle of the model.
const hub = R.reduce((s, p) => add(s, mul(p, 1 / R.length)), [0, 0, 0]);
const corners = R.map((c, i) => ({ i, d: mm(len(sub(c, hub))) }));
// How far from flat the ring is. Its corners alternate either side of its own
// mean plane, so a closed ring stands on three of them — and the depth from
// the table to the highest paper is something a ruler can check.
const axis = mul(hub, 1 / len(hub));
const along = (p) => dot(sub(p, hub), axis);
const paper = edgesOf(R).flatMap((e) => strut(R, e.i, sections[e.i])).map(along);
const cornerSwing = R.map(along);
const diags = [];
for (let a = 0; a < 6; a++) for (let b = a + 2; b < 6; b++)
  if (!(a === 0 && b === 5)) diags.push({ between: [a, b], mm: mm(len(sub(R[a], R[b]))) });
const rec = recipe(R);
// The recipe's "turn" is how far the direction swings between one edge and the
// next, so a straight joint is 0. A protractor laid in the corner reads the
// angle BETWEEN the two arms, which is 180 minus that. Reporting the turn as
// something to measure would have had every joint built 180 degrees wrong.
out.checks.ring = {
  turns: rec.map((r) => +r.turn.toFixed(1)),
  measuredAngles: rec.map((r) => +(180 - r.turn).toFixed(1)),
  diagonals: diags,
  cornerRadii: corners.map((c) => c.d),
  swing: { above: mm(Math.max(...cornerSwing)), below: mm(Math.min(...cornerSwing)) },
  depth: mm(Math.max(...paper) - Math.min(...paper)),
  spanAcross: mm(2 * Math.max(...R.map(len))),
};
console.log('RING CHECKS');
console.log(`  direction swings by: ${rec.map((r) => r.turn.toFixed(1)).join(', ')} deg`);
console.log(`  protractor between the two arms reads: ${rec.map((r) => (180 - r.turn).toFixed(1)).join(', ')} deg`);
console.log(`  corner-to-corner distances: ${diags.map((d) => `${d.between.join('-')} = ${d.mm}`).join(', ')} mm`);
console.log(`  each corner sits ${corners.map((c) => c.d).join(', ')} mm from the ring's own centre`);
console.log(`  corners alternate ${out.checks.ring.swing.above} mm above and ${Math.abs(out.checks.ring.swing.below)} mm below the ring's mean plane`);
console.log(`  stood on a table, the ring is ${out.checks.ring.depth} mm from the table to its highest paper`);

// --- checks on the whole model ----------------------------------------------
const centres = rings.map((r) => r.reduce((s, p) => add(s, mul(p, 1 / r.length)), [0,0,0]));
// What a caliper reads, as opposed to how big a sphere the model needs.
// 2 * max|p| is the circumscribed sphere of the centre lines; nothing can be
// measured between those two points, because the far one is in mid-air. The
// widest reading over the PAPER is a real pair of corners, and so is the
// widest over the centre-line corners.
const allVerts = rings.flatMap((ring) => edgesOf(ring).flatMap((e) => strut(ring, e.i, sections[e.i])));
const widest = (pts) => {
  let best = 0;
  for (let a = 0; a < pts.length; a++)
    for (let b = a + 1; b < pts.length; b++) best = Math.max(best, len(sub(pts[a], pts[b])));
  return best;
};
out.checks.model = {
  sphere: mm(2 * Math.max(...rings.flat().map(len))),
  paperWidest: mm(widest(allVerts)),
  cornerWidest: mm(widest(rings.flat())),
  ringCentreOffset: mm(len(centres[0])),
  closest: mm(gapOf(rings)),
};
let worstJoint = 0;
for (let i = 0; i < 6; i++) worstJoint = Math.max(worstJoint, jointGap(rings, sections, i));
out.checks.ring.jointMismatch = +(worstJoint * scale).toExponential(2);
console.log(`  the two cut ends at a corner differ by ${(worstJoint * scale).toExponential(2)} mm — a true mitre`);

console.log('\nMODEL CHECKS');
console.log(`  widest caliper reading over the paper: ${out.checks.model.paperWidest} mm`);
console.log(`  widest between two centre-line corners: ${out.checks.model.cornerWidest} mm`);
console.log(`  centre lines fit a sphere ${out.checks.model.sphere} mm across`);
console.log(`  where two struts cross, their centre lines pass ${out.checks.model.closest} mm apart,`);
console.log(`  and each arm is ${mm(gapOf(rings) / 2)} mm from its centre line to a face — so the faces meet.`);

writeFileSync(new URL('./measurements.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log('\nwrote measurements.json');
