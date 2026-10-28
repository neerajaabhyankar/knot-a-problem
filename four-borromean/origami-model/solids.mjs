// The struts as actual solids, and whether they fit.
//
// The cross-section was derived from support functions, which is a statement
// about infinite prisms and their common perpendiculars. That is a necessary
// condition for the real struts not to collide, not a sufficient one: the
// struts are finite, mitred at the corners, and two of them can be closest
// near an end rather than along the middle. So this builds the solids and
// checks them against each other directly.
//
// Separating axis theorem, on convex polyhedra: two convex bodies miss each
// other exactly when some axis separates them, and for polytopes it is enough
// to test the face normals of both plus every cross product of one edge
// direction with another. The largest gap over those axes IS the distance
// between them, so the same pass measures how snug the fit is.
import { skeleton, edgesOf, frameOf, add, sub, mul, dot, cross, len, unit } from './skeleton.mjs';
import { sectionFor } from './cross-section.mjs';

/** The plane where two struts meet at a corner: it bisects them. */
export function mitre(tIn, tOut) {
  const n = unit(sub(tIn, tOut));            // reflecting tIn in this plane gives tOut
  return n;
}

/**
 * One strut as a convex polyhedron: the cross-section swept along the edge and
 * cut by the mitre plane at each end.
 */
export function strut(ring, i, section) {
  const n = ring.length;
  const edge = edgesOf(ring)[i];
  const f = frameOf(edge);
  const prev = unit(sub(ring[i], ring[(i-1+n)%n]));
  const next = unit(sub(ring[(i+2)%n], ring[(i+1)%n]));
  const mIn = mitre(prev, f.t), mOut = mitre(f.t, next);

  const verts = [];
  for (const [a, b] of section) {
    const base = add(add(edge.a, mul(f.u, a)), mul(f.v, b));   // a line parallel to the axis
    for (const [plane, through] of [[mIn, edge.a], [mOut, edge.b]]) {
      // where that line crosses the mitre plane
      const t = dot(sub(through, base), plane) / dot(f.t, plane);
      verts.push(add(base, mul(f.t, t)));
    }
  }
  return verts;
}

const faceNormals = (verts) => {
  // Convex hull normals are expensive; the strut's planes are known instead:
  // the cross-section faces and the two mitre planes. Recovered here from the
  // vertex set so the test needs nothing but points.
  const out = [];
  for (let i = 0; i < verts.length; i++)
    for (let j = i+1; j < verts.length; j++)
      for (let k = j+1; k < verts.length; k++) {
        const nrm = cross(sub(verts[j], verts[i]), sub(verts[k], verts[i]));
        if (len(nrm) < 1e-9) continue;
        const u = unit(nrm);
        const ds = verts.map((v) => dot(sub(v, verts[i]), u));
        if (Math.min(...ds) > -1e-9 || Math.max(...ds) < 1e-9) out.push(u);   // a supporting plane
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

const span = (verts, axis) => {
  const ds = verts.map((v) => dot(v, axis));
  return [Math.min(...ds), Math.max(...ds)];
};

/**
 * Distance between two convex polyhedra: positive is a gap, negative is an
 * overlap (the depth). The axis set is faces of both plus edge-edge crosses.
 */
export function separation(A, B, axesA, axesB, edgesA, edgesB) {
  let best = -Infinity;
  const test = (axis) => {
    const [a0, a1] = span(A, axis), [b0, b1] = span(B, axis);
    const gap = Math.max(b0 - a1, a0 - b1);
    if (gap > best) best = gap;
  };
  for (const ax of axesA) test(ax);
  for (const ax of axesB) test(ax);
  for (const e1 of edgesA) for (const e2 of edgesB) {
    const c = cross(e1, e2);
    if (len(c) > 1e-7) test(unit(c));
  }
  return best;
}

/** Every strut of the model, with the data the pairwise test needs. */
export function allStruts(rings, sections) {
  const out = [];
  rings.forEach((ring, ri) => {
    edgesOf(ring).forEach((e) => {
      const verts = strut(ring, e.i, sections[e.i % 2]);
      out.push({ ring: ri, edge: e.i, verts, faces: faceNormals(verts), dirs: edgeDirs(verts) });
    });
  });
  return out;
}

/** The worst pair in the model: how much they overlap, or how little they miss by. */
export function checkFit(rings, sections) {
  const struts = allStruts(rings, sections);
  let worst = Infinity, touching = 0, overlaps = [];
  for (let i = 0; i < struts.length; i++)
    for (let j = i+1; j < struts.length; j++) {
      const A = struts[i], B = struts[j];
      if (A.ring === B.ring) {
        const n = rings[A.ring].length;
        const d = Math.min(Math.abs(A.edge - B.edge), n - Math.abs(A.edge - B.edge));
        if (d <= 1) continue;                 // share a corner: they are meant to meet
      }
      const s = separation(A.verts, B.verts, A.faces, B.faces, A.dirs, B.dirs);
      if (s < worst) worst = s;
      if (s < 1e-4) touching++;
      if (s < -1e-6) overlaps.push({ a: `${A.ring}/${A.edge}`, b: `${B.ring}/${B.edge}`, depth: s });
    }
  return { pairs: struts.length * (struts.length - 1) / 2, worst, touching, overlaps };
}
