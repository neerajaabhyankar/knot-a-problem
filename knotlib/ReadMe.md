# knotlib

Knot theory as deterministic functions. Space curve → diagram → invariants.

Pure JS. No DOM, no three.js, no dependencies, no build step. **The editor may
import this; this may not know that a screen exists** — which is what keeps
every test runnable in plain node, and what has made the same discipline cheap
to trust in `editor/src/smooth.js` and `editor/src/io.js`.

Design: [`diagram.md`](diagram.md). Vocabulary: [`glossary.md`](glossary.md) —
start there if "face" or "rotation system" isn't a word you use.

## Trying it out

**Run the tests.** This is the honest way to see what it does, because every
check prints the measurement it made rather than a tick:

```sh
cd knotlib && npm test
```

106 checks across four suites. Some of the output worth looking at:

```
ok  the trefoil has three bigons and two triangles — 2,2,2,3,3
ok  a mis-wired pairing is caught by the face count, not by an invariant later
      — "not a plane diagram: 3 crossings in 1 piece(s) need 5 faces, traced 3"
ok  the trefoil and its mirror have different Jones polynomials — it is chiral,
      and the tool can see it — A^4 +A^12 -A^16  vs  -A^-16 +A^-12 +A^-4
ok  the figure eight matches its own mirror — amphichiral
ok  a Hopf link viewed down the axis of one ring is refused, not guessed at
ok  and R1 + R2 alone walk it back down to three — 8 → 3 via R2, R2, R1
ok  the fingerprint holds at every single step, not just at the ends — 8 → 6 → 4 → 3
ok  but the writhe changed, which is the whole reason it cannot be part of a
      fingerprint — -1 → 0
```

**Poke at it directly.** The test fixtures are parametric knots, so there is
always something to hand:

```sh
node --input-type=module -e "
import { choose, jones, survey, simplify, laurent } from './index.js';
import { torus, figureEight, hopf, borromean } from './test/fixtures.mjs';

const { diagram, usable, tried } = choose([torus(2, 3)]);
console.log(diagram.toString(), '— best of', tried, 'directions,', usable, 'usable');
console.log('Jones  ', laurent.toString(jones(diagram).value));
console.log('faces  ', diagram.faces().map(f => f.length).join(','));
console.log('moves  ', survey(diagram).map(m => m.kind + (m.available ? ' yes' : ' no: ' + m.reason)));
"
```

Or interactively, which is nicer for exploring:

```sh
node --experimental-repl-await
```
```js
const k = await import('./index.js');
const f = await import('./test/fixtures.mjs');
const d = k.choose([f.torus(2, 5)]).diagram;   // the cinquefoil
k.laurent.toString(k.jones(d).value);          // 'A^8 +A^16 -A^20 +A^24 -A^28'
d.mirror().canonical() === d.canonical();      // false — chiral
k.fingerprint(d);
```

**On something you drew.** knotlib does not read `.knot.json` — that is the
editor's format, so parsing it is the editor's job. The bridge lives there:

```sh
cd ../editor && npm run analyse -- ~/Downloads/knot-2026-08-27-1432.knot.json
```

## The pieces

| file | what |
|---|---|
| `diagram.js` | the `Diagram` type — darts, faces, components, signs, canonical form, PD/Gauss |
| `project.js` | space curve → diagram, with the genericity checks that make it refuse rather than guess |
| `invariants.js` | writhe, linking, Kauffman bracket, Jones — each tagged with what it survives |
| `moves.js` | Reidemeister I/II/III: detect, apply, simplify |
| `laurent.js` | Laurent polynomials over ℤ. Small enough to be obvious, which is the point |
| `index.js` | the barrel |

## Two things it does not do yet

**R3 is detected but not applied.** R1 and R2 removal are the same splice
underneath; R3 deletes nothing and re-attaches three edges, so it needs its own
construction. `apply()` throws a message saying exactly that.

**There is no knot table**, so nothing here can tell you a *name*. It can tell
you two knots are different (their invariants differ) and it can decline to tell
you they are the same, which is the honest limit of what invariants do.

## Conventions worth knowing before reading the code

- **Slots run counter-clockwise**, `0..3`. The two darts of one strand at a
  crossing are `d` and `d ^ 2` — always opposite.
- **Jones is written in A, not t.** `V(t) = f(A)` with `t = A⁻⁴`. That keeps
  every exponent an integer even for links with an even number of components.
- **"Best of what was tried", never "minimal".** `choose()` samples directions
  from a fixed Fibonacci spiral — deterministic, so the same curves always give
  the same diagram — and reports `tried` and `usable` so a caller can say so.
- **A crossing is a property of a projection, not of a curve.** Five kinds of
  degenerate view are refused by name rather than silently returning a picture
  that isn't there.
