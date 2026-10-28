// Labelled drawings of the two blanks, for the build page.
//
//     node drawing.mjs > /dev/null      (writes blank-long.svg, blank-short.svg)
//
// Drawn to scale, with every point named so the tables can give its position
// in millimetres instead of cluttering the picture.
import { readFileSync, writeFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('./measurements.json', import.meta.url), 'utf8'));
const PX = 2.6;                                   // screen pixels per millimetre

function draw(u) {
  const pad = 34;
  const W = u.blank[0], L = u.blank[1];
  const x = (mmx) => pad + mmx * PX;
  const y = (mmy) => pad + (L - mmy) * PX;        // bottom edge of the blank at the bottom
  const w = Math.max(W * PX + pad * 2, 290), h = L * PX + pad * 2 + 14;   // room for a staggered tick label    // the title is wider than a narrow blank

  const low = u.points.map((p) => [x(p.across), y(p.start)]);
  const high = u.points.map((p) => [x(p.across), y(p.end)]);
  const poly = [...low, ...high.slice().reverse()].map((p) => p.join(',')).join(' ');

  const folds = u.creases.map((c) => {
    const j = u.creases.indexOf(c) + 1;
    return `<line x1="${x(c)}" y1="${y(u.points[j].start)}" x2="${x(c)}" y2="${y(u.points[j].end)}" class="fold"/>`;
  }).join('');

  const flapX = x(u.stripWidth);
  const tongue = `<polygon points="${[u.tongue.base[0], u.tongue.tip[0], u.tongue.tip[1], u.tongue.base[1]]
    .map((p) => `${x(p.across)},${y(p.from)}`).join(' ')}" class="tongue"/>
    <line x1="${x(u.tongue.base[0].across)}" y1="${y(u.tongue.base[0].from)}" x2="${x(u.tongue.base[1].across)}" y2="${y(u.tongue.base[1].from)}" class="fold"/>`;

  const labels = u.points.map((p, j) => `
    <circle cx="${x(p.across)}" cy="${y(p.start)}" r="2.4" class="dot"/>
    <text x="${x(p.across)}" y="${y(p.start) + 14}" class="pt">P${j}</text>
    <circle cx="${x(p.across)}" cy="${y(p.end)}" r="2.4" class="dot"/>
    <text x="${x(p.across)}" y="${y(p.end) - 7}" class="pt">Q${j}</text>`).join('');

  const tickXs = [...u.points.map((p) => ({ at: x(p.across), text: String(p.across) })),
                  { at: x(u.blank[0]), text: String(u.blank[0]) }];
  const acrossTicks = tickXs.map((t, j) => {
    const crowded = j > 0 && t.at - tickXs[j - 1].at < 26;      // two marks too close to label in a row
    return `<text x="${t.at}" y="${h - (crowded ? -2 : 10)}" class="dim">${t.text}</text>
     <line x1="${t.at}" y1="${h - 26}" x2="${t.at}" y2="${h - 20}" class="tick"/>`;
  }).join('');

  return `<svg viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" xmlns="http://www.w3.org/2000/svg" class="blank">
  <rect x="${pad}" y="${pad}" width="${W * PX}" height="${L * PX}" class="paper"/>
  <polygon points="${poly}" class="cut"/>
  ${tongue}
  ${folds}
  <line x1="${flapX}" y1="${y(u.points[u.points.length-1].start)}" x2="${flapX}" y2="${y(u.points[u.points.length-1].end)}" class="fold"/>
  ${labels}
  ${acrossTicks}
  <text x="${pad}" y="${pad - 14}" class="title">${u.name} arm — blank ${u.blank[0]} x ${u.blank[1]} mm (cut 12)</text>
  <text x="${flapX + 6}" y="${pad + L * PX / 2}" class="dim rot" transform="rotate(90 ${flapX + 6} ${pad + L * PX / 2})">glue flap ${u.flap}</text>
</svg>`;
}

const STYLE = `<style>
  .paper{fill:#fbfaf7;stroke:#ddd}
  .cut{fill:#ffffff;stroke:#111;stroke-width:1.6}
  .fold{stroke:#c0392b;stroke-width:1.2;stroke-dasharray:6 4;fill:none}
  .tongue{fill:#eef5fb;stroke:#111;stroke-width:1.6}
  .dot{fill:#111}
  .pt{font:11px sans-serif;fill:#111;text-anchor:middle}
  .dim{font:10px sans-serif;fill:#666;text-anchor:middle}
  .tick{stroke:#666}
  .title{font:12px sans-serif;fill:#111}
</style>`;

export function svgFor(u, { standalone = false } = {}) {
  const body = draw(u).replace('<svg ', `<svg width="${Math.max(u.blank[0]*PX+68, 290).toFixed(0)}" height="${(u.blank[1]*PX+68).toFixed(0)}" `);
  // The style has to be INSIDE the element: appended after </svg> it is not
  // style at all, just text after the end of the document, and every shape
  // renders with default fill (black).
  return body.replace('>', '>\n' + STYLE);
}

for (const u of data.units) {
  writeFileSync(new URL(`./blank-${u.name}.svg`, import.meta.url), svgFor(u) + '\n');
  console.log(`wrote blank-${u.name}.svg`);
}
