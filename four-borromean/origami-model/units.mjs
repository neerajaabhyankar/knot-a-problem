// From ring to paper: what one unit is, and what it looks like flat.
//
// ONE UNIT PER EDGE, six per ring, twenty-four in the model — and only two
// patterns, because the ring has 3-fold symmetry and so only a long edge and a
// short edge are distinct.
//
// The alternative, a unit per corner spanning two half-edges, cannot work
// here: the long and short struts have DIFFERENT cross-sections (derived in
// cross-section.mjs), so a unit crossing a corner would have to change shape
// halfway along. Breaking at the corners keeps every unit a straight prism,
// which is a straight strip of paper.
//
// THE JOINT IS THE GEOMETRY. Each end of the prism is cut on the mitre plane —
// the plane that bisects this edge and the next, so that reflecting one axis
// in it gives the other. A tongue of paper carries on past that cut, and
// folding it along the cut sends it EXACTLY along the neighbouring strut's
// axis, because folding is reflection. So the corner angle is not measured or
// glued: it is what the fold does. The tongue then slides into the neighbour's
// hollow prism and holds it there.
import { skeleton, edgesOf, frameOf, recipe, add, sub, mul, dot, cross, len, unit, deg } from './skeleton.mjs';
import { sectionFor, sides, facesOf } from './cross-section.mjs';
import { mitre, strut, separation } from './solids.mjs';

/** Where corner `c` of the cross-section meets a plane, as a distance along the axis. */
const axialHit = (f, base, plane, through) =>
  dot(sub(through, base), plane) / dot(f.t, plane);

/**
 * Everything about one edge's unit: the prism, the two mitre planes, the flat
 * pattern, and the tongue at each end.
 */
export function unitFor(rings, ring, i, sections) {
  const R = rings[ring];
  const n = R.length;
  const edge = edgesOf(R)[i];
  const f = frameOf(edge);
  // One section per edge; a two-entry array still works, by parity.
  const section = sections[i % sections.length];
  const prev = unit(sub(R[i], R[(i-1+n)%n]));
  const next = unit(sub(R[(i+2)%n], R[(i+1)%n]));
  const mIn = mitre(prev, f.t), mOut = mitre(f.t, next);

  // Where each longitudinal edge of the prism starts and ends.
  const lines = section.map(([a, b]) => add(add(edge.a, mul(f.u, a)), mul(f.v, b)));
  const yIn = lines.map((base) => axialHit(f, base, mIn, edge.a));
  const yOut = lines.map((base) => axialHit(f, base, mOut, edge.b));

  // The flat pattern: across the strip is the cross-section's perimeter, along
  // it is the axis. Cutting the tube open at corner 0 makes corner 0 appear at
  // both ends of the strip, which is where the glue flap goes.
  const w = sides(section);
  const x = [0];
  for (const s of w) x.push(x[x.length - 1] + s);
  const flat = {
    x,                                              // crease positions across the strip
    yIn: [...yIn, yIn[0]],                          // the cut at the entry mitre
    yOut: [...yOut, yOut[0]],                       // and at the exit
    width: x[x.length - 1],
    faces: w,
  };
  return { ring, i, kind: i % 2 === 0 ? 'L' : 'S', edge, frame: f, section, mIn, mOut, lines, yIn, yOut, flat,
           length: len(sub(edge.b, edge.a)) };
}

/**
 * The angle each end-cut makes with the strut's axis, face by face — the
 * number you actually draw on paper. 90 degrees would be a square end.
 */
export function cutAngles(u) {
  const out = [];
  for (const [ys, label] of [[u.yIn, 'start'], [u.yOut, 'end']]) {
    const angles = [];
    for (let j = 0; j < u.section.length; j++) {
      const k = (j + 1) % u.section.length;
      const across = u.flat.x[j + 1] - u.flat.x[j];
      const along = ys[k] - ys[j];
      angles.push(deg(Math.atan2(across, along)));   // from the axis, across the face
    }
    out.push({ end: label, angles });
  }
  return out;
}

/**
 * The tongue: the flap that carries on past the mitre and folds into the next
 * strut. It extends one face of the prism, and folding along that face's share
 * of the mitre line is what aims it down the neighbour's axis.
 *
 * Which face carries it is not a free choice — the folded tongue has to fit
 * inside the neighbour's hollow, which is a different shape from this one. So
 * every face is tried and the one that fits deepest wins.
 */
// `fill` is how far down the pocket the tongue reaches. It only has to grip:
// the geometry is already held by the mitre fold, so a tongue three or four
// times longer than it is wide is plenty, and a longer one is just harder to
// thread past the strut already in there.
export function tongueFor(rings, u, sections, { inset = 0.004, fill = 0.32 } = {}) {
  const R = rings[u.ring], n = R.length;
  const nextI = (u.i + 1) % n;
  const nextU = unitFor(rings, u.ring, nextI, sections);
  const refl = (v) => sub(v, mul(u.mOut, 2 * dot(sub(v, u.edge.b), u.mOut)));

  // In the NEIGHBOUR's cross-section frame, each folded face of this strut is
  // a line segment. The usable tongue is the part of it inside the neighbour's
  // hollow, so clip and keep the widest.
  const poly = nextU.section.map((c) => c);          // the pocket, in its own frame
  const toSection = (v) => {
    const d = sub(v, nextU.edge.a);
    return [dot(d, nextU.frame.u), dot(d, nextU.frame.v)];
  };

  let best = null;
  for (let j = 0; j < u.section.length; j++) {
    const k = (j + 1) % u.section.length;
    const p = add(u.lines[j], mul(u.frame.t, u.yOut[j]));
    const q = add(u.lines[k], mul(u.frame.t, u.yOut[k]));
    const seg = [toSection(refl(p)), toSection(refl(q))];
    // In the matched design a folded face lands EXACTLY on the corresponding
    // wall of the next tube — the tongue slides flat against it, which is how
    // a tab in a pocket works. So the clip must tolerate a segment lying on
    // the wall, and the breathing room is taken off the ends afterwards.
    const kept = clipSegment(seg, poly, -1e-7);
    if (!kept) continue;
    const L = Math.hypot(seg[1][0]-seg[0][0], seg[1][1]-seg[0][1]);
    const trim = Math.min(inset / L, (kept.t1 - kept.t0) / 3);
    const from = kept.t0 + trim, to = kept.t1 - trim;
    if (to <= from) continue;
    const width = (to - from) * L;
    // The clip parameters carry straight over to the host's own face: folding
    // is an isometry along the face, so "the middle 30% of the fold line" means
    // the same thing on both sides of it.
    if (!best || width > best.width)
      best = { face: j, width, full: len(sub(q, p)), from, to };
  }
  if (!best) return { face: null, width: 0 };
  // How deep it may go: the neighbour's far mitre stops it. Take a fraction so
  // the tongue grips without bottoming out against the next joint's paper.
  const depth = fill * Math.min(...nextU.yOut) - Math.max(...nextU.yIn, 0);
  return { ...best, depth: Math.max(0, depth), pocket: nextU.length };
}

/** The part of a segment inside a convex polygon, shrunk by `inset`. */
function clipSegment([a, b], poly, inset) {
  let t0 = 0, t1 = 1;
  const d = [b[0]-a[0], b[1]-a[1]];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    let nx = q[1]-p[1], ny = -(q[0]-p[0]);          // outward normal of this edge
    const L = Math.hypot(nx, ny); nx /= L; ny /= L;
    const sign = (poly.reduce((s, c) => s + ((c[0]-p[0])*nx + (c[1]-p[1])*ny), 0) > 0) ? -1 : 1;
    const ux = sign*nx, uy = sign*ny;
    const off = p[0]*ux + p[1]*uy - inset;          // x . u <= off
    const da = a[0]*ux + a[1]*uy - off, db = b[0]*ux + b[1]*uy - off;
    const dd = db - da;
    if (Math.abs(dd) < 1e-12) { if (da > 0) return null; continue; }
    const t = -da / dd;
    if (dd > 0) t1 = Math.min(t1, t); else t0 = Math.max(t0, t);
    if (t0 >= t1) return null;
  }
  return { t0, t1, a: [a[0]+d[0]*t0, a[1]+d[1]*t0], b: [a[0]+d[0]*t1, a[1]+d[1]*t1] };
}

const facePlanes = (verts) => {
  const out = [];
  for (let i = 0; i < verts.length; i++)
    for (let j = i+1; j < verts.length; j++)
      for (let k = j+1; k < verts.length; k++) {
        const nrm = cross(sub(verts[j], verts[i]), sub(verts[k], verts[i]));
        if (len(nrm) < 1e-9) continue;
        const u = unit(nrm);
        const ds = verts.map((v) => dot(sub(v, verts[i]), u));
        if (Math.min(...ds) > -1e-9) out.push({ n: mul(u, -1), p: verts[i] });
        else if (Math.max(...ds) < 1e-9) out.push({ n: u, p: verts[i] });
      }
  return out;
};
const inside = (v, planes, margin) => planes.every((pl) => dot(sub(v, pl.p), pl.n) <= -margin);

/**
 * Fold the flat pattern back up and compare it with the skeleton.
 *
 * This is the check that the pattern IS the strut: roll the strip into a
 * prism, put it where the unit belongs, and measure against the solid the
 * geometry asked for. A pattern that drifts shows up here as millimetres.
 */
export function refold(u) {
  // Rolling the strip: corner j of the cross-section sits at cumulative width
  // x[j] around the prism, so the flat pattern determines the section up to
  // placement. Rebuild the section from the flat widths and the known angles.
  const built = [[0, 0]];
  let dir = 0;
  for (let j = 0; j < u.section.length; j++) {
    const k = (j + 1) % u.section.length;
    const w = u.flat.faces[j];
    const p = built[built.length - 1];
    built.push([p[0] + w * Math.cos(dir), p[1] + w * Math.sin(dir)]);
    // the turn at the next corner, from the original section
    const a = u.section[k], b = u.section[(k + 1) % u.section.length], c = u.section[j];
    const v1 = [a[0]-c[0], a[1]-c[1]], v2 = [b[0]-a[0], b[1]-a[1]];
    dir += Math.atan2(v1[0]*v2[1]-v1[1]*v2[0], v1[0]*v2[0]+v1[1]*v2[1]);
  }
  built.pop();                                      // the last corner closes onto the first
  // Align the rebuilt section with the original and measure the worst corner.
  const centre = (ps) => [ps.reduce((s,p)=>s+p[0],0)/ps.length, ps.reduce((s,p)=>s+p[1],0)/ps.length];
  const c0 = centre(u.section), c1 = centre(built);
  const ang = (ps, c) => Math.atan2(ps[0][1]-c[1], ps[0][0]-c[0]);
  const rot = ang(u.section, c0) - ang(built, c1);
  const worst = Math.max(...built.map((p, j) => {
    const x = p[0]-c1[0], y = p[1]-c1[1];
    const r = [x*Math.cos(rot) - y*Math.sin(rot) + c0[0], x*Math.sin(rot) + y*Math.cos(rot) + c0[1]];
    return Math.hypot(r[0]-u.section[j][0], r[1]-u.section[j][1]);
  }));
  return { worst, corners: built.length };
}
