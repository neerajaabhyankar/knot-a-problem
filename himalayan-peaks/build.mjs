// Build the two models and write scenes the editor can open.
//
//   node build.mjs
//
// Each model is a woven frame of regular polygons (see frames.mjs). The free
// parameters are the twist of one polygon about its axis and the offset of its
// plane from the centre; everything else is the symmetry group. So this sweeps
// those, keeps the configurations whose rings miss each other, and picks the
// one with the most room between strands — the weave that a paper model can
// actually be assembled into.
//
// Each shape is then checked rather than assumed: the orbit must have exactly
// the right number of rings, the symmetry must be exact, and `knotlib` must
// agree the thing is a genuine link rather than rings that fall apart.
import { writeFileSync } from 'node:fs';
import {
  TETRAHEDRAL, ICOSAHEDRAL, TETRA_AXES, ICOSA_AXES,
  polygon, orbit, clearance, linking, radius, len, mul, weave,
} from './frames.mjs';
import { choose, simplify, fingerprint, linking as diagramLinking } from '../knotlib/index.js';

// The editor's own strand colours (editor/src/style.css).
const PALETTE = ['#d2784b','#d2d24b','#78d24b','#4bd278','#4bd2d2','#4b78d2','#784bd2','#d24bd2','#d24b78'];
const r5 = (x) => Math.round(x * 1e5) / 1e5;

/** Rings -> the editor's scene format, scaled to a comfortable size. */
function scene(rings, { name, note, tube }) {
  const k = 2.2 / radius(rings);               // about 4.4 units across, like the library shapes
  return {
    format: 'knot-a-problem/scene', version: 1, saved: new Date().toISOString(),
    by: 'himalayan-peaks/build.mjs',
    curves: rings.map((ring, i) => ({
      name: `${name} — frame ${i + 1}`,
      color: PALETTE[i % PALETTE.length],
      radius: r5(tube * k),
      closed: true,
      // The whole point: these are polygons, not splines through points. The
      // editor keeps the corners sharp when a curve says so.
      straight: true,
      by: 'agent',
      points: ring.map((p) => mul(p, k).map(r5)),
    })),
    note,
  };
}

/** Every pairwise Gauss linking number, rounded — they come out near-integral. */
const linkMatrix = (rings) => {
  const out = [];
  for (let a = 0; a < rings.length; a++)
    for (let b = a + 1; b < rings.length; b++) out.push(Math.round(linking(rings[a], rings[b]) * 1e6) / 1e6);
  return out;
};

/**
 * What knotlib makes of it: crossings, whether it falls apart, and whether the
 * weave alternates.
 *
 * ALTERNATION IS THE TEST THAT MATTERS. "Woven" means each frame goes over,
 * under, over, under as you follow it round — that is what holds a paper model
 * together and what the photographs show. A symmetric tangle of rings that
 * crosses twice over and then twice under looks similar in outline and is not
 * the same object, so this walks each component's crossings in order and
 * checks they alternate, rather than trusting the symmetry to have produced
 * the right weave.
 */
function identify(rings) {
  const curves = rings.map((points) => ({ points, closed: true }));
  try {
    const got = choose(curves, { samples: 96 });
    const D0 = got.diagram;
    const alternating = D0.gauss().every((strand) => {
      const overs = strand.map((x) => x.over);
      return overs.every((v, i) => v !== overs[(i + 1) % overs.length]);
    });
    const out = simplify(D0);
    const D = out.diagram ?? out;
    return { ok: true, projected: D0.n, reduced: D.n, alternating,
             perFrame: D0.gauss().map((s) => s.length).join('/'),
             components: D.componentCount(), lk: diagramLinking(D).value };
  } catch (e) {
    return { ok: false, why: `${e.constructor.name}: ${e.message}` };
  }
}

// ------------------------------------------------------------- Gasherbrum
// Four triangles, one per 3-fold axis of the tetrahedron. Twist and offset are
// both free here: the stabiliser of a triangle is the 3-fold rotation about its
// own axis, which fixes its plane whatever the offset, so the orbit stays four.
//
// THE WEAVE HAS TO BE A CONSTRAINT, NOT A HOPE. Maximising clearance alone
// slides the triangles apart until they are four separate rings — the first
// run of this script returned a configuration with the largest gap of all,
// which knotlib reduced to zero crossings: the 4-component unlink. So every
// pair must be linked exactly once, and clearance only chooses among the
// configurations that already weave.
const wovenPairs = (rings) => {
  for (let a = 0; a < rings.length; a++)
    for (let b = a + 1; b < rings.length; b++)
      if (Math.abs(Math.round(linking(rings[a], rings[b]))) !== 1) return false;
  return true;
};

const alternates = (rings, perPartner) =>
  weave(rings).every((w) => w.alternates && w.contacts === perPartner * (rings.length - 1));

function gasherbrum() {
  let best = null;
  for (let ti = 0; ti <= 2400; ti++) {
    const theta = (ti / 2400) * (2 * Math.PI / 3);         // a third turn repeats the triangle
    for (let hi = 0; hi <= 8; hi++) {
      const h = (hi / 8) * 0.4;
      const ring = polygon(TETRA_AXES[0], { n: 3, r: 1, theta, h, ref: [1, 0, 0] });
      const rings = orbit(TETRAHEDRAL, ring);
      if (rings.length !== 4) continue;
      const gap = clearance(rings) / radius(rings);        // scale-free: the shape, not its size
      if (gap <= 1e-6 || (best && gap <= best.gap)) continue;
      if (!wovenPairs(rings)) continue;
      // Exactly 30 degrees is the roomiest twist and it is DEGENERATE: three
      // strands line up along one direction from the centre, so two crossings
      // land on top of each other. It is a fine object and an impossible
      // diagram — knotlib refuses a projection with coincident crossings — and
      // a twentieth of a degree either side is clean and looks identical.
      if (!alternates(rings, 2)) continue;
      best = { gap, theta, h, rings };
    }
  }
  return best;
}

// ----------------------------------------------------------------- Makalu
// Six pentagons, one per 5-fold axis of the icosahedron. Here the twist is NOT
// free: a pentagon is carried to itself by ten rotations only when its mirror
// lines fall on the group's 2-fold axes, and only then does the orbit have six
// members instead of twelve. That leaves two candidate twists, a tenth of a
// turn apart, and nothing else — the shape is forced.
function makalu() {
  const tried = [];
  for (const theta of [0, Math.PI / 5]) {
    const ring = polygon(ICOSA_AXES[0], { n: 5, r: 1, theta, h: 0, ref: [1, 0, 0] });
    const rings = orbit(ICOSAHEDRAL, ring);
    tried.push({ theta, count: rings.length, gap: clearance(rings) / radius(rings),
                 woven: alternates(rings, 2), rings });
  }
  return tried;
}

// -------------------------------------------------------------------- run
console.log('Gasherbrum — four intersecting triangles, tetrahedral');
const g = gasherbrum();
console.log(`  twist ${(g.theta * 180 / Math.PI).toFixed(3)}deg, offset ${g.h.toFixed(3)}, ` +
            `rings ${g.rings.length}, clearance/radius ${g.gap.toFixed(4)}`);
console.log(`  weave: ${weave(g.rings).map((w) => w.pattern).join(' ')}`);
console.log(`  linking numbers: ${linkMatrix(g.rings).join(', ')}`);
console.log(`  knotlib: ${JSON.stringify(identify(g.rings))}`);

console.log('\nMakalu — six intersecting pentagons, icosahedral');
const candidates = makalu();
for (const t of candidates)
  console.log(`  twist ${(t.theta * 180 / Math.PI).toFixed(2)}deg -> ${t.count} rings, ` +
              `clearance/radius ${t.gap.toFixed(4)}, weave alternates: ${t.woven}`);
// The two twists are mirror images and equally roomy, but only one of them is
// a clean weave: at zero the crossings coincide, the same degeneracy as
// Gasherbrum at exactly thirty degrees.
const m = candidates.filter((t) => t.count === 6 && t.woven).sort((a, b) => b.gap - a.gap)[0];
console.log(`  chosen: twist ${(m.theta * 180 / Math.PI).toFixed(2)}deg`);
console.log(`  weave: ${weave(m.rings).map((w) => w.pattern).join(' ')}`);
console.log(`  linking numbers: ${linkMatrix(m.rings).join(', ')}`);
console.log(`  knotlib: ${JSON.stringify(identify(m.rings))}`);

// A tube thin enough that the strands never touch: a third of the gap, which
// is also roughly how thick the paper units look against the model.
const tubeFor = (rings) => Math.min(0.075, clearance(rings) / 3);
writeFileSync(new URL('./gasherbrum.knot.json', import.meta.url),
  JSON.stringify(scene(g.rings, { name: 'Gasherbrum', tube: tubeFor(g.rings),
    note: 'Four intersecting triangles (Robert J. Lang, Himalayan Peaks). Planar frames, tetrahedral symmetry.' }), null, 1) + '\n');
writeFileSync(new URL('./makalu.knot.json', import.meta.url),
  JSON.stringify(scene(m.rings, { name: 'Makalu', tube: tubeFor(m.rings),
    note: 'Six intersecting pentagons (Robert J. Lang, Himalayan Peaks). Planar frames, icosahedral symmetry.' }), null, 1) + '\n');
console.log('\nwrote gasherbrum.knot.json and makalu.knot.json');
