// The flat pattern, as something you can print and fold.
//
// Unrolling a prism is exact: the surface is developable, so the strip's width
// is the cross-section's perimeter, its length is the axis, and the mitred
// ends become polylines through the points where each longitudinal edge meets
// the mitre plane. Nothing is approximated here — the only choice is where to
// cut the tube open, and that is the glue seam.
import { unitFor, cutAngles, tongueFor } from './units.mjs';
import { sectionFor } from './cross-section.mjs';
import { skeleton, sub, add, mul, dot, len, unit, deg } from './skeleton.mjs';

export const FLAP = 0.05;          // glue flap, in model units
export const BLEED = 0.012;        // paper past the mitre, so the cut edge is not the fold

/**
 * One unit's pattern, in model units, y along the strut and x across the strip.
 * Returns outline, fold lines and the tongue, ready to be scaled to mm.
 */
export function patternFor(rings, i, sections) {
  const u = unitFor(rings, 0, i, sections);
  const t = tongueFor(rings, u, sections);
  const k = u.section.length;
  const x = u.flat.x;

  const start = x.map((xi, j) => [xi, u.flat.yIn[j]]);
  const end = x.map((xi, j) => [xi, u.flat.yOut[j]]);

  // The tongue sits on face `t.face`, between the clip parameters, and runs
  // past the end cut by `depth`. Folding along the end cut is what aims it.
  const j = t.face, w = u.flat.faces[j];
  const base = [[x[j] + w * t.from, lerpY(end, j, t.from)],
                [x[j] + w * t.to,   lerpY(end, j, t.to)]];
  const dirAlong = [0, 1];
  const tongue = {
    fold: base,
    outline: [
      base[0],
      [base[0][0], base[0][1] + t.depth],
      [base[1][0], base[1][1] + t.depth],
      base[1],
    ],
    width: t.width, depth: t.depth, face: j,
  };

  return {
    kind: u.kind, length: u.length, width: u.flat.width, faces: u.flat.faces,
    creases: x.slice(1, -1),                 // lengthwise folds, mountain
    start, end, tongue, flap: FLAP,
    cuts: cutAngles(u),
    section: u.section,
  };
}

const lerpY = (poly, j, s) => poly[j][1] + (poly[j + 1][1] - poly[j][1]) * s;

/** Scale to millimetres and lay the pattern out as SVG. */
export function svgFor(pattern, { mmPerUnit, label }) {
  const S = mmPerUnit;
  const pad = 6;
  const toXY = ([x, y]) => [pad + x * S, pad + (y - minY(pattern)) * S];
  const path = (pts, close = false) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${toXY(p).map((v) => v.toFixed(2)).join(' ')}`).join(' ') + (close ? ' Z' : '');

  const outline = [
    ...pattern.start,
    ...pattern.end.slice().reverse(),
  ];
  const w = pad * 2 + (pattern.width + pattern.flap) * S;
  const h = pad * 2 + (maxY(pattern) - minY(pattern)) * S;

  const creaseLines = pattern.creases.map((cx) => {
    const j = pattern.creases.indexOf(cx) + 1;
    return `<path d="${path([[cx, pattern.start[j][1]], [cx, pattern.end[j][1]]])}" class="fold"/>`;
  }).join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}mm" height="${h.toFixed(1)}mm" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}">
<style>
  .cut{fill:none;stroke:#111;stroke-width:0.4}
  .fold{fill:none;stroke:#c00;stroke-width:0.3;stroke-dasharray:3 2}
  .flap{fill:none;stroke:#888;stroke-width:0.3;stroke-dasharray:1 2}
  text{font:3.2px sans-serif;fill:#444}
</style>
  <path d="${path(outline, true)}" class="cut"/>
  ${creaseLines}
  <path d="${path(pattern.tongue.outline)}" class="cut"/>
  <path d="${path(pattern.tongue.fold)}" class="fold"/>
  <path d="${path([[pattern.width, pattern.start[pattern.start.length-1][1]], [pattern.width + pattern.flap, pattern.start[pattern.start.length-1][1]], [pattern.width + pattern.flap, pattern.end[pattern.end.length-1][1]], [pattern.width, pattern.end[pattern.end.length-1][1]]])}" class="flap"/>
  <text x="${pad}" y="${(h - 2).toFixed(1)}">${label} — red dashed = fold, solid = cut, grey = glue flap, ${S.toFixed(1)} mm per unit</text>
</svg>
`;
}

const minY = (p) => Math.min(...p.start.map((q) => q[1]));
const maxY = (p) => Math.max(...p.end.map((q) => q[1]), ...p.tongue.outline.map((q) => q[1]));
