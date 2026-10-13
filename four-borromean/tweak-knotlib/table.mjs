// The ReadMe's table, printed from `starts.js` rather than typed out, so the
// numbers in the prose cannot drift from the numbers in the tool.
import { readFileSync, writeFileSync } from 'node:fs';
const S = JSON.parse(readFileSync(new URL('./starts.js', import.meta.url), 'utf8')
  .replace(/^[\s\S]*?window\.STARTS\s*=\s*/, '').replace(/;\s*$/, ''));

const row = (s) => `${s.gap} | ${s.ratio} | ${s.crossings} | ${s.sublinkAfter}`;
const lines = [
  '| corners | clear: gap | gap/size | view crossings | sublink crossings after R1/R2 | roomy: gap | gap/size | view crossings | sublink crossings after R1/R2 |',
  '|---|---|---|---|---|---|---|---|---|',
  ...Object.keys(S).map(Number).sort((a,b) => a-b).map((k) =>
    `| ${k} | ${row(S[k].clear)} | ${S[k].roomy ? row(S[k].roomy) : '— | — | — | —'} |`),
];
const table = lines.join('\n');
console.log(table);

// `--write` splices it into ReadMe.md between the markers, so the prose and
// the tool can never disagree about a number.
if (process.argv.includes('--write')) {
  const url = new URL('./ReadMe.md', import.meta.url);
  const md = readFileSync(url, 'utf8');
  const next = md.replace(/<!-- TABLE -->[\s\S]*?(?=\n\nAn earlier version)/, `<!-- TABLE -->\n${table}`);
  writeFileSync(url, next);
  console.log('\nspliced into ReadMe.md');
}
