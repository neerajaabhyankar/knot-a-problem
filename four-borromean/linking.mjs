// Gauss linking number straight off the 3D curves — no projection, no diagram.
//
// This exists as a fast reject. Every 3-sublink of the target has all three
// linking numbers zero, so anything with a nonzero one is out, and finding that
// out should not cost a projection search. knotlib's `linking()` remains the
// authority; this is validated against it on the Hopf link (1), Solomon's seal
// (2) and the Borromean fixture (0, 0, 0).
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => { const m = Math.hypot(...a); return m > 1e-14 ? [a[0] / m, a[1] / m, a[2] / m] : null; };
const clamp = (x) => (x > 1 ? 1 : x < -1 ? -1 : x);

/** Signed solid angle of one segment pair (Klenin & Langowski). */
function pairContribution(p1, p2, q1, q2) {
  const r1 = sub(q1, p1), r2 = sub(q2, p1), r3 = sub(q2, p2), r4 = sub(q1, p2);
  const n1 = unit(cross(r1, r2)), n2 = unit(cross(r2, r3));
  const n3 = unit(cross(r3, r4)), n4 = unit(cross(r4, r1));
  if (!n1 || !n2 || !n3 || !n4) return 0;
  const omega = Math.asin(clamp(dot(n1, n2))) + Math.asin(clamp(dot(n2, n3)))
              + Math.asin(clamp(dot(n3, n4))) + Math.asin(clamp(dot(n4, n1)));
  return omega * Math.sign(dot(cross(sub(p2, p1), sub(q2, q1)), r1));
}

export function gaussLinking(A, B) {
  const a = A.points, b = B.points;
  let total = 0;
  for (let i = 0; i < a.length; i++) {
    const p1 = a[i], p2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) total += pairContribution(p1, p2, b[j], b[(j + 1) % b.length]);
  }
  return total / (4 * Math.PI);
}

/** All pairwise linking numbers, rounded, plus the worst rounding error seen. */
export function allLinking(curves) {
  const lk = [];
  let slop = 0;
  for (let i = 0; i < curves.length; i++) {
    for (let j = i + 1; j < curves.length; j++) {
      const v = gaussLinking(curves[i], curves[j]);
      slop = Math.max(slop, Math.abs(v - Math.round(v)));
      lk.push({ i, j, value: Math.round(v) });
    }
  }
  return { lk, slop };
}
