// The standard diagram of the Borromean rings: three circles in Venn position,
// each passing over one neighbour and under the other, cyclically.
//
// Drawn in the plane on purpose. By Freedman-Skora no three ROUND circles in
// space form the Borromean rings, so there is no spatial configuration of
// circles to project; a diagram, however, is a planar object, and this is the
// standard one. Over and under come from the cyclic rule rather than from a
// height, and the breaks are cut by the same renderer as every other figure.
import fs from 'node:fs';
globalThis.__fs = fs;
const { drawCut } = await import('./make-diagram.mjs');

const WIDTH = 6.4, LW = 1.7, GAP = 0.085;
const N = 300, R = 1.0, D = 0.60;
const SCALE = WIDTH / (2 * R + 2 * D * Math.cos(Math.PI / 6));

const COLS = ['ringB', 'ringC', 'ringD'];
const comps = [0, 1, 2].map((k) => {
  const a = (k * 2 * Math.PI) / 3 + Math.PI / 2;
  const cx = D * Math.cos(a), cy = D * Math.sin(a);
  return {
    col: COLS[k],
    pts: Array.from({ length: N }, (_, i) => {
      const t = (i / N) * 2 * Math.PI;
      return [(cx + R * Math.cos(t)) * SCALE, (cy + R * Math.sin(t)) * SCALE];
    }),
  };
});

/** Ring i passes OVER ring j exactly when j is the next one round. */
const isOver = (i, j) => (j - i + 3) % 3 === 1;

// arc length is uniform here, so the crossing positions can be found directly
const arc = (c) => {
  let a = 0; const off = [];
  c.pts.forEach((p, i) => { off.push(a); const q = c.pts[(i + 1) % c.pts.length]; a += Math.hypot(q[0]-p[0], q[1]-p[1]); });
  return off;
};
const offs = comps.map(arc);

const cuts = [];
for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
  const A = comps[i].pts, B = comps[j].pts;
  for (let x = 0; x < A.length; x++) for (let y = 0; y < B.length; y++) {
    const p = A[x], p2 = A[(x+1)%A.length], q = B[y], q2 = B[(y+1)%B.length];
    const r = [p2[0]-p[0], p2[1]-p[1]], s = [q2[0]-q[0], q2[1]-q[1]];
    const den = r[0]*s[1] - r[1]*s[0];
    if (Math.abs(den) < 1e-14) continue;
    const w = [q[0]-p[0], q[1]-p[1]];
    const t = (w[0]*s[1] - w[1]*s[0]) / den, u = (w[0]*r[1] - w[1]*r[0]) / den;
    if (t <= 0 || t >= 1 || u <= 0 || u >= 1) continue;
    const sinA = Math.abs(den) / (Math.hypot(...r) * Math.hypot(...s));
    const half = (LW/28.45/2 + GAP) / Math.max(sinA, 1e-6);
    if (isOver(i, j)) cuts.push({ ci: j, s: offs[j][y] + u*Math.hypot(...s), half });
    else              cuts.push({ ci: i, s: offs[i][x] + t*Math.hypot(...r), half });
  }
}
const pieces = drawCut(comps, cuts, { lw: LW, name: 'fig-borromean.tex' });
console.log(`fig-borromean.tex: ${cuts.length} breaks, ${pieces} arcs drawn`);
