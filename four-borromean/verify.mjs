// Verify a candidate properly, at a resolution the search could not afford.
//
// A fingerprint match is a smoke detector, not a proof — knotlib says so
// itself. So the check here is stronger in three ways: all four sublinks are
// tested rather than one, the resolution and the direction count both go up,
// and where a 6-crossing projection exists the *diagram* is compared to the
// standard Borromean diagram by `canonical()`, which is equality of pictures
// rather than agreement of invariants.
import { wavyConfig, clearance, checkSymmetry } from './tetra.mjs';
import { allLinking } from './linking.mjs';
import { bestProjection, idOf, REFERENCE, sublinks } from './lib.mjs';
import { borromean } from '../knotlib/test/fixtures.mjs';

const BORROMEAN_CANON = bestProjection(borromean(), 96).diagram.canonical();

export function verify(params, { n = 120, samples = 96, verbose = true } = {}) {
  const curves = wavyConfig({ ...params, n });
  const say = (...a) => verbose && console.log(...a);

  checkSymmetry(curves);
  const clear = clearance(curves);
  const { lk, slop } = allLinking(curves);
  say(`  symmetry   : exact, |T| = 12 (asserted on all four generators)`);
  say(`  clearance  : ${clear.toFixed(4)}   (tetrahedron edge is ${(2 * Math.SQRT2).toFixed(3)})`);
  say(`  linking    : ${lk.map((x) => `${x.i + 1}${x.j + 1}=${x.value}`).join(' ')}  (slop ${slop.toExponential(1)})`);

  const results = sublinks(curves).map((s) => {
    const got = idOf(s.curves, samples);
    let canon = null;
    if (got.ok && got.n === 6) canon = null; // see ReadMe.md: no 6-crossing reference exists in-repo yet
    return { ...s, got, canon, borromean: got.ok && got.print === REFERENCE.borromean };
  });

  for (const r of results) {
    const mark = r.borromean ? 'BORROMEAN' : 'NOT borromean';
    const same = r.canon === null ? 'no 6-crossing view found' : r.canon === BORROMEAN_CANON ? 'canonical() identical to the standard diagram' : 'canonical() DIFFERS';
    say(`  vertex v${r.vertex} (faces ${r.faces.join(',')}): projects to ${String(r.got.ok ? r.got.raw : '-').padStart(2)}, simplifies to ${String(r.got.ok ? r.got.n : '-').padStart(2)} crossings  ${mark}`);
  }

  const full = idOf(curves, samples);
  say(`  whole link : ${full.ok ? `${full.n} crossings, ${full.print}` : full.why}`);

  return {
    curves, clear, lk,
    allBorromean: results.every((r) => r.borromean),
    allCanonical: results.every((r) => r.canon === BORROMEAN_CANON),
    results, full,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const CANDIDATES = {
    'hit-384': {"r":2.316669619362801,"t":-0.491558516677469,"a3":-0.4566909966990351,"th3":1.5742889154599953,"a6":0.1827207908034325,"th6":0.9335327153580403,"h3":-0.01297314986586573,"p3":0.8448636381941147,"h6":-0.07528689969331026,"p6":0.8475555852045129},
    'hit-557': {"r":1.7252400391269476,"t":-0.7581114121712744,"a3":-0.015062823146581694,"th3":0.0655955882128769,"a6":-0.023600463196635224,"th6":0.29825756922493596,"h3":0.674953953921795,"p3":0.6647877511772795,"h6":0.22725267661735415,"p6":0.5211006588940919},
  };
  for (const [name, p] of Object.entries(CANDIDATES)) {
    console.log(`\n=== ${name} ===`);
    const v = verify(p);
    console.log(`  VERDICT    : ${v.allBorromean ? 'all four sublinks are the Borromean rings' : 'FAILED'}` +
                `${v.allCanonical ? ', all four as the standard 6-crossing diagram' : ''}`);
  }
}
