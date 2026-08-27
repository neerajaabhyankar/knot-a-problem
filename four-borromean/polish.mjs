// A longer, multi-restart refinement of the single best candidate.
import { refine, score } from './refine.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

let best = JSON.parse(readFileSync('candidates.json', 'utf8'))[0].p;
let bestScore = score(best);
console.log('starting from', bestScore.toFixed(5));
for (let seed = 1; seed <= 6; seed++) {
  const out = refine(best, { rounds: 400, step: 0.09, seed: seed * 101 });
  if (out.score > bestScore) { best = out.best; bestScore = out.score; }
  console.log(`  restart ${seed}: ${out.score.toFixed(5)}   best so far ${bestScore.toFixed(5)}`);
}
writeFileSync('winner.json', JSON.stringify(best, null, 2) + '\n');
console.log('\nfinal', bestScore.toFixed(5));
console.log(JSON.stringify(best));
