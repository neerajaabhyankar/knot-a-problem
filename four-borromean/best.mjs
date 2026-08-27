// Take every candidate the searches turned up, re-check it at a resolution the
// search could not afford, refine the survivors for clearance, and keep the
// best. The search's n=48 sampling is coarse enough that some hits are aliasing
// artefacts rather than links — they do not survive this.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { verify } from './verify.mjs';
import { refine, score } from './refine.mjs';

const raw = readdirSync('.').filter((f) => f.startsWith('hits-') && f.endsWith('.txt'))
  .flatMap((f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.startsWith('HIT '))
    .map((l) => ({ from: `${f}:${l.split(' ')[1]}`, p: JSON.parse(l.slice(l.indexOf('{'))) })));

console.log(`${raw.length} candidates from the searches`);
const survivors = [];
for (const c of raw) {
  let v;
  try { v = verify(c.p, { n: 120, samples: 64, verbose: false }); }
  catch (e) { console.log(`  ${c.from.padEnd(24)} threw: ${e.message.slice(0, 50)}`); continue; }
  const tag = v.allBorromean ? 'survives' : 'aliasing artefact';
  console.log(`  ${c.from.padEnd(24)} ${tag.padEnd(18)} clearance ${v.clear.toFixed(4)}`);
  if (v.allBorromean) survivors.push({ ...c, clear: v.clear });
}

console.log(`\n${survivors.length} survive at n=120. Refining each for clearance...`);
const refined = [];
for (const s of survivors) {
  try {
    const out = refine(s.p, { rounds: 260 });
    refined.push({ from: s.from, p: out.best, score: out.score });
    console.log(`  ${s.from.padEnd(24)} score ${score(s.p).toFixed(5)} -> ${out.score.toFixed(5)}`);
  } catch (e) { console.log(`  ${s.from.padEnd(24)} refine failed: ${e.message.slice(0, 40)}`); }
}

refined.sort((a, b) => b.score - a.score);
writeFileSync('candidates.json', JSON.stringify(refined, null, 2) + '\n');
console.log(`\nbest: ${refined[0]?.score.toFixed(5)} from ${refined[0]?.from}`);
console.log(JSON.stringify(refined[0]?.p));
