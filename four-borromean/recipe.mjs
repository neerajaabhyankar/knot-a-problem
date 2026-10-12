// A space polygon is fixed, up to rigid motion, by three numbers per corner:
// the EDGE LENGTH leaving it, the TURN ANGLE through it, and the TORSION
// (how far the next edge is rotated out of the previous plane). That triple is
// what a physical model actually has to be built from, so emit it.
//
// Each ring repeats every m corners under the 3-fold rotation, so only m rows
// are distinct; the strip is that row set, three times round.
import { readFileSync, writeFileSync } from 'node:fs';
import { fromArc } from './polygon.mjs';

const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const len=(a)=>Math.hypot(...a);
const deg=(r)=>r*180/Math.PI;

function recipe(points, m) {
  const n = points.length;
  const rows = [];
  for (let i = 0; i < m; i++) {
    const p0=points[(i-1+n)%n], p1=points[i], p2=points[(i+1)%n], p3=points[(i+2)%n];
    const e0=sub(p1,p0), e1=sub(p2,p1), e2=sub(p3,p2);
    const turn = deg(Math.acos(Math.max(-1,Math.min(1,dot(e0,e1)/(len(e0)*len(e1))))));
    const n1=cross(e0,e1), n2=cross(e1,e2);
    let tors = deg(Math.atan2(dot(cross(n1,n2), e1)/len(e1), dot(n1,n2)));
    rows.push({ edge: +len(e1).toFixed(3), turn: +turn.toFixed(1), torsion: +tors.toFixed(1) });
  }
  return rows;
}

const data = JSON.parse(readFileSync('artifact-data.json','utf8'));
for (const [key, v] of Object.entries(data)) {
  if (key === 'smooth') continue;
  const ring = fromArc(v.arc)[0].points;
  v.recipe = recipe(ring, v.arc.length);
  console.log(`${v.label}: ${v.arc.length} distinct corners, repeated 3x`);
  console.table(v.recipe);
}
writeFileSync('artifact-data.json', JSON.stringify(data));
console.log('total size', (JSON.stringify(data).length/1024).toFixed(1), 'KB');
