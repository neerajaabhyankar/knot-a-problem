// Draw a configuration as an SVG, from any viewing direction.
//
// The printed break convention, computed rather than faked. For every vertex of
// every curve we ask whether some *other* curve passes in front of it within
// half a stroke width on screen; the answer cuts each curve into maximal
// visible arcs, and each arc is drawn as one continuous polyline. No haloes, so
// nothing erases its own neighbours — the first attempt at this stroked a wide
// background pass under every short segment, and at 240 points per curve every
// segment was rubbed out by the two beside it.
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => { const m = Math.hypot(...a); return [a[0] / m, a[1] / m, a[2] / m]; };

export const PALETTE = ['#c1440e', '#1f6f8b', '#c9a227', '#4a7c3f'];

/** Distance from point p to segment ab, and the segment's depth there. */
function nearest(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  const s = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2)) : 0;
  const qx = a[0] + s * vx, qy = a[1] + s * vy;
  return { dist: Math.hypot(p[0] - qx, p[1] - qy), depth: a[2] + s * (b[2] - a[2]) };
}

export function svg(curves, {
  direction = [1, 1, 1], size = 760, pad = 46, width = 8, gap = 9,
  colors = PALETTE, background = '#ffffff', up = null, title = '',
} = {}) {
  const w = unit(direction);
  const seed = up ?? (Math.abs(w[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
  const u = unit(cross(seed, w));
  const v = cross(w, u);
  const flat = curves.map((c) => c.points.map((p) => [dot(p, u), dot(p, v), dot(p, w)]));

  const all = flat.flat();
  const lo = [Math.min(...all.map((p) => p[0])), Math.min(...all.map((p) => p[1]))];
  const hi = [Math.max(...all.map((p) => p[0])), Math.max(...all.map((p) => p[1]))];
  const k = (size - 2 * pad) / Math.max(hi[0] - lo[0], hi[1] - lo[1]);
  const ox = pad + (size - 2 * pad - (hi[0] - lo[0]) * k) / 2;
  const oy = pad + (size - 2 * pad - (hi[1] - lo[1]) * k) / 2;
  const X = (p) => (ox + (p[0] - lo[0]) * k).toFixed(2);
  const Y = (p) => (size - (oy + (p[1] - lo[1]) * k)).toFixed(2);

  // How close, in world units, another strand has to pass to break this one.
  const breakAt = (width / 2 + gap) / k;

  const paths = [];
  flat.forEach((pts, ci) => {
    const hidden = pts.map((p) => {
      for (let cj = 0; cj < flat.length; cj++) {
        if (cj === ci) continue;
        const other = flat[cj];
        for (let j = 0; j < other.length; j++) {
          const n = nearest(p, other[j], other[(j + 1) % other.length]);
          if (n.dist < breakAt && n.depth > p[2]) return true;
        }
      }
      return false;
    });
    // Maximal runs of visible vertices, walking the closed curve from a break.
    const m = pts.length;
    const start = hidden.indexOf(true);
    if (start < 0) {
      paths.push({ ci, d: `M${pts.map((p) => `${X(p)},${Y(p)}`).join('L')}Z` });
      return;
    }
    let run = [];
    for (let s = 1; s <= m; s++) {
      const i = (start + s) % m;
      if (hidden[i]) {
        if (run.length > 1) paths.push({ ci, d: `M${run.map((p) => `${X(p)},${Y(p)}`).join('L')}` });
        run = [];
      } else run.push(pts[i]);
    }
    if (run.length > 1) paths.push({ ci, d: `M${run.map((p) => `${X(p)},${Y(p)}`).join('L')}` });
  });

  const body = paths.map((p) =>
    `<path d="${p.d}" stroke="${colors[p.ci % colors.length]}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
  ).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">\n` +
    `<rect width="${size}" height="${size}" fill="${background}"/>\n${body}\n` +
    (title ? `<text x="${size / 2}" y="${size - 14}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="15" fill="#555">${title}</text>\n` : '') +
    `</svg>\n`;
}
