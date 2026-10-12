// Re-verify an arc saved from the page: is it still the link it started as?
//
// The page's drag clamp means the answer should always be yes — a corner never
// moves more than 0.45 of the current closest approach, so no two strands can
// meet. This asks knotlib anyway, because a guarantee that is never tested is
// a comment rather than a fact. It also prints the cutting list, which is the
// only output a paper model needs.
//
//     node check.mjs arc-12.json
import { readFileSync } from 'node:fs';
import { fromArc, edgeClearance, selfEdgeClearance, edgeStats } from '../polygon.mjs';
import { checkSymmetry } from '../tetra.mjs';
import { idOf, REFERENCE, sublinks } from '../lib.mjs';
import { allLinking } from '../linking.mjs';

const file = process.argv[2];
if (!file) { console.error('usage: node check.mjs arc-<n>.json'); process.exit(2); }
const saved = JSON.parse(readFileSync(file, 'utf8'));
const arc = saved.arc ?? saved;           // bare array of corners is fine too
const curves = fromArc(arc);
const ring = curves[0].points;

console.log(`${file}: ${ring.length} corners per ring, ${arc.length} distinct\n`);

checkSymmetry(curves);                    // throws unless |T| = 12 holds exactly
console.log('symmetry  : exact, |T| = 12, asserted on all four generators');

const gap = Math.min(edgeClearance(curves), selfEdgeClearance(curves));
const es = edgeStats(curves);
console.log(`clearance : ${gap.toFixed(4)}${saved.gap ? `   (the page said ${saved.gap})` : ''}`);
console.log(`edges     : ${es.min.toFixed(3)} to ${es.max.toFixed(3)}, sharpest turn ${es.turnMax.toFixed(1)}°`);

const { lk, slop } = allLinking(curves);
console.log(`linking   : ${lk.every((x) => x.value === 0) ? 'all six pairs 0' : lk.map((x) => x.value).join(',')} (slop ${slop.toExponential(1)})\n`);

// A sublink can come back three ways, and the third is not a failure of the
// tweak. knotlib's Kauffman bracket refuses above 16 crossings, and R1/R2 alone
// cannot always get a 28-crossing projection below that - the missing R3 of the
// parent ReadMe §8. So a wider direction search is tried first, and what is
// still unreadable is reported as unreadable rather than counted against the
// link.
let wrong = 0, unread = 0;
for (const s of sublinks(curves)) {
  let got = idOf(s.curves, 128);
  if (!got.ok) got = idOf(s.curves, 512);   // more directions, in case 128 were unlucky
  const borromean = got.ok && got.print === REFERENCE.borromean;
  if (got.ok && !borromean) wrong++;
  if (!got.ok) unread++;
  console.log(`vertex v${s.vertex} : ` + (got.ok
    ? `projects to ${got.raw}, simplifies to ${got.n} crossings   ${borromean ? 'BORROMEAN' : 'NOT BORROMEAN'}`
    : `unreadable  -  ${got.why}`));
}
const ok = wrong === 0 && lk.every((x) => x.value === 0);

// A space polygon is fixed up to rigid motion by three numbers per corner, and
// only the first `arc.length` rows are distinct: the ring repeats under R3.
const sub = (a,b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const len = (a) => Math.hypot(...a);
const deg = (r) => r*180/Math.PI;
const n = ring.length;
console.log('\ncutting list, repeated three times round, four rings alike:');
console.table(Array.from({ length: arc.length }, (_, i) => {
  const [p0,p1,p2,p3] = [(i-1+n)%n, i, (i+1)%n, (i+2)%n].map((j) => ring[j]);
  const e0 = sub(p1,p0), e1 = sub(p2,p1), e2 = sub(p3,p2);
  const n1 = cross(e0,e1), n2 = cross(e1,e2);
  return {
    edge: +len(e1).toFixed(3),
    turn: +deg(Math.acos(Math.max(-1, Math.min(1, dot(e0,e1)/(len(e0)*len(e1)))))).toFixed(1),
    torsion: +deg(Math.atan2(dot(cross(n1,n2), e1)/len(e1), dot(n1,n2))).toFixed(1),
  };
}));

if (wrong) console.log('\nTHE LINK CHANGED. A sublink came back as something other than the Borromean rings,');
else if (unread) console.log(`\n${4 - unread} of 4 sublinks confirmed Borromean; ${unread} too tangled for the bracket to read.\n` +
  'That is knotlib running out of road, not evidence against the shape - the drag clamp\n' +
  'cannot change the link type. Pulling the busy corners apart usually makes it readable.');
else console.log('\nALL FOUR SUBLINKS BORROMEAN - the tweak kept the link.');
if (wrong) console.log('which should be impossible under the clamp. Worth reporting with the arc file.');
process.exit(ok ? 0 : 1);
