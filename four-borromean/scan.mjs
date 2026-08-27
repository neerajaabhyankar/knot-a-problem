// Scan the two-parameter family of tetrahedrally symmetric triangle links.
//
// Every configuration in the family has exact tetrahedral symmetry (tetra.mjs
// builds it in), so the only question is which link type comes out. And because
// T acts transitively on the four vertices, the four 3-component sublinks are
// carried onto each other by the symmetry — they are all the same link. That is
// asserted here rather than assumed, because if it ever failed the construction
// would be wrong.
import { config, clearance, checkSymmetry } from './tetra.mjs';
import { idOf, REFERENCE, sublinks } from './lib.mjs';

const classify = (print) =>
  print === REFERENCE.borromean ? 'BORROMEAN' : print === REFERENCE.unlink3 ? 'unlink' : 'other';

const rs = process.env.RS ? process.env.RS.split(',').map(Number)
  : [0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.4, 2.8];
const thetas = process.env.TH ? process.env.TH.split(',').map(Number)
  : Array.from({ length: 12 }, (_, i) => (i * Math.PI) / 18); // 0..110 deg, step 10
const t = process.env.T ? Number(process.env.T) : -1 / 3;

console.log(`plane offset t = ${t.toFixed(4)}   (t = -1/3 is the face plane)`);
console.log('    r    theta   clear   sub-n  sublink      full-n');
for (const r of rs) {
  for (const theta of thetas) {
    const curves = config({ r, theta, t });
    checkSymmetry(curves);
    const clear = clearance(curves);
    if (clear < 0.02) {
      console.log(`${r.toFixed(2).padStart(5)} ${((theta * 180) / Math.PI).toFixed(0).padStart(6)}  ${clear.toFixed(3).padStart(6)}   -- too close, skipped`);
      continue;
    }
    const subs = sublinks(curves).map((s) => idOf(s.curves, 48));
    const kinds = subs.map((s) => (s.ok ? classify(s.print) : `fail(${s.why.slice(0, 24)})`));
    const same = new Set(kinds).size === 1;
    const full = idOf(curves, 48);
    console.log(
      `${r.toFixed(2).padStart(5)} ${((theta * 180) / Math.PI).toFixed(0).padStart(6)}  ${clear.toFixed(3).padStart(6)}` +
      `   ${String(subs[0].ok ? subs[0].n : '-').padStart(4)}  ${kinds[0].padEnd(12)}` +
      ` ${String(full.ok ? full.n : full.why.slice(0, 18)).padStart(6)}` +
      `${same ? '' : '   << sublinks DISAGREE: ' + kinds.join('/')}`,
    );
  }
}
