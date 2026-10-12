import fs from 'node:fs';
globalThis.__fs = fs;
const { choose, tikz } = await import('./make-diagram.mjs');

const { rings } = JSON.parse(fs.readFileSync('link.json','utf8'));
const C = ['ringA','ringB','ringC','ringD'];
const rep = (t,r) => console.log(t.padEnd(14)+String(r.crossings).padStart(3)+' crossings   '+
  'near-miss '+(r.nearMiss*100).toFixed(2)+'% ('+(r.nearMiss*r.widthCm*28.45).toFixed(1)+'pt)   '+
  'cross-sep '+(r.crossSep*100).toFixed(2)+'%');

// A couple of extra crossings buys a great deal of separation; the minimal
// direction packs strands almost on top of one another.
let b = choose(rings, { samples: 9000, tolerance: 4 });
rep('whole link', tikz(b, { cols:C, width:12.2, lw:1.5, gap:0.075, minPiece:0.20, name:'fig-link.tex' }));

const sub = [rings[1], rings[2], rings[3]];
b = choose(sub, { samples: 9000, tolerance: 4 });
rep('sublink', tikz(b, { cols:['ringB','ringC','ringD'], width:8.0, lw:1.6, gap:0.085, minPiece:0.20, name:'fig-sublink.tex' }));
