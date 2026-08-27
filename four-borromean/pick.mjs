// Legibility is crossing number, not just clearance. Rank every refined
// candidate by how simple the whole 4-component diagram gets after simplify(),
// with the scale-free clearance as the tie-break.
import { readFileSync, writeFileSync } from 'node:fs';
import { wavyConfig, clearance } from './tetra.mjs';
import { bestProjection, idOf, REFERENCE, sublinks } from './lib.mjs';
import { simplify } from '../knotlib/index.js';
import { score } from './refine.mjs';

const cands = JSON.parse(readFileSync('candidates.json', 'utf8'));
const rows = [];
for (const c of cands) {
  const curves = wavyConfig({ ...c.p, n: 160 });
  const subs = sublinks(curves).map((s) => idOf(s.curves, 64));
  if (!subs.every((s) => s.ok && s.print === REFERENCE.borromean)) {
    console.log(`  ${c.from.padEnd(24)} lost the link type at n=160`);
    continue;
  }
  let full = null;
  try {
    const { diagram } = bestProjection(curves, 64);
    const out = simplify(diagram);
    full = { raw: diagram.n, n: (out.diagram ?? out).n };
  } catch { /* leave null */ }
  const row = { from: c.from, p: c.p, score: c.score, clear: clearance(curves), full,
    subN: subs.map((s) => s.n) };
  rows.push(row);
  console.log(`  ${c.from.padEnd(24)} 4-link ${String(full?.raw ?? '-').padStart(3)} -> ${String(full?.n ?? '-').padStart(3)}   sublinks ${row.subN.join('/')}   clearance/diam ${c.score.toFixed(4)}`);
}
rows.sort((a, b) => (a.full?.n ?? 999) - (b.full?.n ?? 999) || b.score - a.score);
writeFileSync('ranked.json', JSON.stringify(rows, null, 2) + '\n');
console.log(`\nsimplest: ${rows[0].from}  4-link simplifies to ${rows[0].full?.n} crossings, clearance/diam ${rows[0].score.toFixed(4)}`);
