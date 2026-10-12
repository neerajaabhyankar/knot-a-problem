import { readFileSync, writeFileSync } from 'node:fs';
import { choose, tikz } from './make-diagram.mjs';

const { rings } = JSON.parse(readFileSync('link.json','utf8'));
const C = ['ringA','ringB','ringC','ringD'];

const report = (tag, r) =>
  console.log(`${tag.padEnd(22)} ${String(r.crossings).padStart(3)} crossings   ` +
    `closest pair ${(r.minSep*100).toFixed(1)}% of width   ` +
    `shallowest angle ${(Math.asin(r.minAngle)*180/Math.PI).toFixed(0)}deg`);

// the whole link, two symmetry axes are too cluttered to read at 36 crossings,
// so the direction is chosen purely for legibility among the minimal ones
let b = choose(rings, { samples: 6000, tolerance: 0 });
report('whole link', tikz(b, { cols:C, scale:1.0, lw:1.4, gap:0.115, name:'fig-link.tex' }));

// one sublink: drop K1
const sub = [rings[1], rings[2], rings[3]];
b = choose(sub, { samples: 6000, tolerance: 2 });
report('sublink (drop K1)', tikz(b, { cols:['ringB','ringC','ringD'], scale:1.5, lw:1.7, gap:0.17, name:'fig-sublink.tex' }));
