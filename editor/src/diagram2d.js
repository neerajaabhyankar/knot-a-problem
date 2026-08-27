// Drawing a projection the way a book draws it.
//
// The picture is the strands exactly as they project — not a re-laid-out
// abstract diagram — with the strand that goes *underneath* broken at each
// crossing. That break is the whole convention: it is how paper says "under",
// and it is the same mark the editor's pen lift makes, which is why an imported
// diagram and a drawn one arrive through the same door. See trace.js.
//
// Pure: in are curves, a projection layout and a few colours; out is a string.
// No DOM, so it is unit-testable in node like io.js and smooth.js.

/**
 * Gap on each side of a crossing, in stroke widths — but only for a crossing at
 * right angles. A shallow crossing needs a longer break, because the strand
 * passing over covers a stretch of `½ width ÷ sin θ` measured *along* the strand
 * underneath. At 30° that is already the whole of a 1.5-width break, and the two
 * strands touch: the picture stops saying anything and a tracer reading it back
 * finds a junction rather than a gap.
 */
const GAP = 0.8;
const SHALLOW = 0.6;
/** Below this the crossing is so shallow the break would swallow the strand. */
const FLATTEST = 0.18;
/** And no break is ever longer than this many stroke widths. */
const WIDEST = 4;
/**
 * Daylight the ink must leave between two strands running past each other,
 * in stroke widths. Below this the picture stops being readable — by a person
 * or by trace.js — so a crowded projection gets a thinner line rather than a
 * smudge. A book does the same thing and nobody notices.
 */
const BREATHING = 3.2;
/** Blank margin round the drawing, as a fraction of its longer side. */
const MARGIN = 0.06;

const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** How square-on a crossing is: |sin| of the angle between the two strands. */
function sineAt(comps, x) {
  const heading = ({ component, segment }) => {
    const pts = comps[component];
    const a = pts[segment];
    const b = pts[(segment + 1) % pts.length];
    const m = dist(a, b) || 1;
    return [(b[0] - a[0]) / m, (b[1] - a[1]) / m];
  };
  const [o, u] = [heading(x.over), heading(x.under)];
  return Math.abs(o[0] * u[1] - o[1] * u[0]);
}

/** Cumulative arclength round a closed polyline, plus the total. */
function arclength(pts) {
  const cum = [0];
  for (let i = 0; i < pts.length; i++) cum.push(cum[i] + dist(pts[i], pts[(i + 1) % pts.length]));
  return { cum, total: cum[pts.length] };
}

/** The point at arclength `s`, wrapping. */
function at(pts, cum, total, s) {
  let x = ((s % total) + total) % total;
  let i = 0;
  while (i < pts.length - 1 && cum[i + 1] < x) i++;
  const seg = cum[i + 1] - cum[i] || 1;
  const f = (x - cum[i]) / seg;
  const a = pts[i];
  const b = pts[(i + 1) % pts.length];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

/**
 * Turn a set of "cut this stretch out" intervals into the stretches that
 * survive. Intervals wrap round the seam, which is the only fiddly part: a
 * crossing sitting on the polyline's first point cuts the end and the beginning
 * of the same list.
 */
function keep(breaks, total) {
  const cuts = [];
  for (let [a, b] of breaks) {
    if (b - a >= total) return [];
    a = ((a % total) + total) % total;
    b = ((b % total) + total) % total;
    if (a <= b) cuts.push([a, b]);
    else cuts.push([a, total], [0, b]);
  }
  if (!cuts.length) return null; // null means "no breaks at all" — draw it closed
  cuts.sort((p, q) => p[0] - q[0]);
  const merged = [cuts[0]];
  for (const c of cuts.slice(1)) {
    const last = merged[merged.length - 1];
    if (c[0] <= last[1]) last[1] = Math.max(last[1], c[1]);
    else merged.push(c);
  }
  const runs = [];
  for (let i = 0; i < merged.length; i++) {
    const from = merged[i][1];
    const to = merged[(i + 1) % merged.length][0] + (i === merged.length - 1 ? total : 0);
    if (to - from > 1e-9) runs.push([from, to]);
  }
  return runs;
}

const fmt = (v) => (Math.abs(v) < 1e-9 ? '0' : +v.toFixed(4));
/** A filename can contain anything, and it ends up inside a tag. */
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * One component as SVG path data. `runs === null` draws the whole closed loop;
 * otherwise each surviving stretch becomes its own open subpath, which is what
 * puts a break in the ink.
 */
function pathData(pts, runs, flipY) {
  const P = ([x, y]) => `${fmt(x)},${fmt(flipY ? -y : y)}`;
  if (runs === null) return `M${pts.map(P).join('L')}Z`;
  const n = pts.length;
  const { cum, total } = arclength(pts);
  return runs.map(([a, b]) => `M${run(pts, cum, total, n, a, b).map(P).join('L')}`).join('');
}

/**
 * The vertices of one surviving stretch, in order.
 *
 * A run can cross the seam — the polyline's first point is an arbitrary place
 * to start, and a break sitting anywhere else leaves exactly one run that wraps
 * past it. So the walk runs over `2n` indices with the second lap offset by the
 * total length, which keeps the points in travel order instead of restarting
 * them at the seam.
 */
function run(pts, cum, total, n, a, b) {
  const start = ((a % total) + total) % total;
  const end = start + (b - a);
  const out = [at(pts, cum, total, start)];
  for (let j = 0; j < 2 * n; j++) {
    const s = cum[j % n] + (j >= n ? total : 0);
    if (s <= start) continue;
    if (s >= end) break;
    out.push(pts[j % n]);
  }
  out.push(at(pts, cum, total, end));
  return out;
}

/**
 * A projection as a standard knot diagram.
 *
 * @param curves      the editor's curves, in the order they were projected —
 *                    only `color` and `radius` are read
 * @param layout      the `layout` half of a `project()` result
 * @param background  page colour; the editor's own by default
 * @param gap         break width either side of a crossing, in stroke widths
 * @param title       goes in <title>, which is what a screen reader reads
 */
export function toSVG(curves, layout, { background = '#0a0b0e', gap = GAP, title = 'Knot diagram' } = {}) {
  const comps = layout.components;
  if (!comps.length) throw new Error('nothing to draw');

  // Thin the line if the drawing is crowded. `clearance` is the closest two
  // strands come anywhere they are not crossing; the stroke has to fit inside
  // that with room either side.
  const room = (layout.clearance ?? 1) * (layout.scale ?? 1);
  const asked = Math.max(...curves.map((c) => 2 * (c.radius ?? 0.075)));
  const thin = Math.min(1, room / (BREATHING * asked));
  const strokeOf = (c) => thin * 2 * (c?.radius ?? 0.075);

  // Cut the under-strand at every crossing. The gap is measured in that
  // strand's own stroke width, so a thin strand gets a small break.
  const cuts = comps.map(() => []);
  for (const x of layout.crossings ?? []) {
    const ci = x.under.component;
    const pts = comps[ci];
    const { cum } = arclength(pts);
    const seg = dist(pts[x.under.segment], pts[(x.under.segment + 1) % pts.length]);
    const s = cum[x.under.segment] + x.under.t * seg;
    const width = strokeOf(curves[ci]);
    cuts[ci].push({ s, half: Math.min(WIDEST, gap + SHALLOW / Math.max(FLATTEST, sineAt(comps, x))) * width });
  }

  // Two crossings close together would otherwise merge into one long gap, and
  // the short piece of strand between them would vanish — which is not what the
  // picture says. Shrink neighbouring breaks instead until a sliver survives.
  const breaks = cuts.map((list, ci) => {
    const { total } = arclength(comps[ci]);
    const sliver = strokeOf(curves[ci]) * 0.6;
    list.sort((a, b) => a.s - b.s);
    for (let i = 0; i < list.length && list.length > 1; i++) {
      const a = list[i];
      const b = list[(i + 1) % list.length];
      const between = (b.s - a.s + total) % total;
      const room = between - sliver;
      if (a.half + b.half > room) {
        const k = Math.max(0, room) / (a.half + b.half);
        a.half *= k;
        b.half *= k;
      }
    }
    return list.map(({ s, half }) => [s - half, s + half]);
  });

  const all = comps.flat();
  const lo = [Math.min(...all.map((p) => p[0])), Math.min(...all.map((p) => p[1]))];
  const hi = [Math.max(...all.map((p) => p[0])), Math.max(...all.map((p) => p[1]))];
  const widest = Math.max(hi[0] - lo[0], hi[1] - lo[1], 1e-6);
  const pad = widest * MARGIN + asked;
  // y is negated on the way out — SVG counts downwards and the projection frame
  // counts upwards, and getting that wrong silently draws the mirror image.
  const box = [lo[0] - pad, -(hi[1] + pad), hi[0] - lo[0] + 2 * pad, hi[1] - lo[1] + 2 * pad];

  const paths = comps
    .map((pts, ci) => {
      const { total } = arclength(pts);
      const runs = breaks[ci].length ? keep(breaks[ci], total) : null;
      if (runs && !runs.length) return ''; // wholly swallowed by its own breaks
      const c = curves[ci] ?? {};
      return `  <path d="${pathData(pts, runs, true)}" stroke="${c.color ?? '#d2d24b'}" stroke-width="${fmt(strokeOf(c))}"/>`;
    })
    .filter(Boolean);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.map(fmt).join(' ')}" width="${Math.round(
    720,
  )}" height="${Math.round((720 * box[3]) / box[2])}">
  <title>${xml(title)}</title>
  <rect x="${fmt(box[0])}" y="${fmt(box[1])}" width="${fmt(box[2])}" height="${fmt(box[3])}" fill="${background}"/>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
${paths.join('\n')}
  </g>
</svg>
`;
}
