// 2D polyline utilities, used to turn a raw mouse sweep into a handful of
// control points. All coordinates here are screen pixels.

/** Drop points that are closer than `minDist` px to the previously kept point. */
export function dedupe(points, minDist = 3) {
  if (points.length === 0) return [];
  const out = [points[0]];
  const min2 = minDist * minDist;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const q = out[out.length - 1];
    const dx = p[0] - q[0];
    const dy = p[1] - q[1];
    if (dx * dx + dy * dy >= min2) out.push(p);
  }
  return out;
}

function perpDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  // Distance to the infinite line through a and b.
  return Math.abs(dy * (p[0] - a[0]) - dx * (p[1] - a[1])) / Math.sqrt(len2);
}

/** Ramer-Douglas-Peucker. Keeps the shape, drops the redundant points. */
export function rdp(points, epsilon) {
  if (points.length < 3) return points.slice();

  let worst = 0;
  let index = 0;
  const a = points[0];
  const b = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDistance(points[i], a, b);
    if (d > worst) {
      worst = d;
      index = i;
    }
  }

  if (worst <= epsilon) return [a, b];
  const left = rdp(points.slice(0, index + 1), epsilon);
  const right = rdp(points.slice(index), epsilon);
  return left.slice(0, -1).concat(right);
}

/**
 * RDP is scale-free, so on a closed loop it can leave too few points to spline
 * nicely. Simplify, then insist on at least `minPoints` by relaxing epsilon.
 */
export function simplifyStroke(points, epsilon = 6, minPoints = 8) {
  let eps = epsilon;
  let out = rdp(points, eps);
  while (out.length < minPoints && eps > 0.4 && points.length > out.length) {
    eps /= 2;
    out = rdp(points, eps);
  }
  return out;
}

/**
 * RDP again, but in 3D — used to bring an erased fragment back down from a
 * dense sample to a handful of control points.
 */
export function rdp3(points, epsilon) {
  if (points.length < 3) return points.slice();

  const a = points[0];
  const b = points[points.length - 1];
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const abLen = Math.hypot(...ab);

  let worst = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    let d;
    if (abLen < 1e-12) {
      d = Math.hypot(...ap);
    } else {
      // |ap x ab| / |ab|
      const cx = ap[1] * ab[2] - ap[2] * ab[1];
      const cy = ap[2] * ab[0] - ap[0] * ab[2];
      const cz = ap[0] * ab[1] - ap[1] * ab[0];
      d = Math.hypot(cx, cy, cz) / abLen;
    }
    if (d > worst) {
      worst = d;
      index = i;
    }
  }

  if (worst <= epsilon) return [a, b];
  return rdp3(points.slice(0, index + 1), epsilon)
    .slice(0, -1)
    .concat(rdp3(points.slice(index), epsilon));
}

/** Bounding-box diagonal, used to scale the loop-closing tolerance. */
export function extent(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return Math.hypot(maxX - minX, maxY - minY);
}

/**
 * A stroke is treated as a closed loop when its ends come back near each other,
 * relative to how big the stroke is. Deliberately generous: most things people
 * draw in a knot editor are loops.
 */
export function looksClosed(points) {
  if (points.length < 4) return false;
  const a = points[0];
  const b = points[points.length - 1];
  const gap = Math.hypot(a[0] - b[0], a[1] - b[1]);
  return gap < Math.max(40, 0.28 * extent(points));
}
