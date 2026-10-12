# Corner tweaker — a scratch tool for making the diagram prettier

Temporary, and deliberately outside everything else: this directory reads
`../curves.json` and `../polygon.mjs` through `make-starts.mjs`, and writes
nothing but its own files. `knotlib` and `editor` are untouched.

```sh
open index.html          # that is the whole setup; no server, no build
```

`starts.js` is a plain script rather than JSON so the page runs from `file://`.

## What it does

Drag any corner of the 4-component tetrahedral link. **Its eleven twins move
with it** — two more on the same ring, three on each of the other three — so the
link stays exactly tetrahedral at every moment, and so that "make this corner
less cramped" is one gesture rather than twelve.

Corner counts 6, 9, 12, 15, 18, 21 and 24 per ring. Only multiples of three
exist: each ring repeats three times under its own 120° rotation, so a ring with
3k corners has k distinct ones, and that k is what you are editing.

- **drag a corner** — moves it across the screen; hold <kbd>shift</kbd> to push it away from you
- **drag the background** — turns the link
- **clearest** — searches 240 directions for the fewest crossings
- **save arc** — the k distinct corners, the only thing worth keeping
- **save .knot.json** — a scene file the main editor opens

Edits survive a reload (`localStorage`) and switching corner counts; **reset**
goes back to the verified start.

## Why you cannot break the link

The drag is capped, and that cap is the whole safety argument:

> Let `gap` be the current closest approach between any two strands. Every point
> of the link is an isometric image of the arc being edited, so moving one arc
> corner by `d` moves no point of the link further than `|d|`. Two strands can
> therefore approach each other by at most `2|d|` in one step, and the cap keeps
> `|d| ≤ 0.45·gap`, so `2|d| < gap`: **nothing can pass through anything.** The
> link type is preserved by construction, not by re-checking afterwards.

This is the same bound `../optimise-polygon.mjs` uses, applied to a pointer
instead of a random walk. The pointer is free to run ahead of the corner; the
corner follows at that speed limit, which is what "my movement may be
restricted" feels like in practice — tight spots move slowly.

Two further moves are refused outright rather than slowed, because neither is a
crossing and both ruin a diagram anyway: a **spike** (turn angle past 150°, which
is degenerate to project) and a **collapse** (an edge shorter than a tenth of the
ring). The canvas says so when it happens.

## Checking a tweak anyway

A guarantee that is never tested is a comment, not a fact:

```sh
node check.mjs arc-12.json
```

Rebuilds the link from the saved arc and asks `knotlib`: symmetry exact, all six
linking numbers zero, and each of the four 3-component sublinks Borromean, plus
the cutting list for a paper model. A 400-drag random stress test and a 60-drag
one both came back `ALL FOUR SUBLINKS BORROMEAN`.

One honest wrinkle, inherited rather than introduced: a sublink can come back
**unreadable** instead of confirmed. `knotlib`'s Kauffman bracket refuses above
16 crossings and `simplify()` is R1/R2 only, so a tangled projection sometimes
cannot be pushed under the limit — the gap named in `../ReadMe.md` §8. The
script retries with 512 directions first, and reports what is left as unreadable
rather than counting it against the shape. It is not evidence the link changed;
the clamp is.

## Where the starting shapes come from

`make-starts.mjs` sweeps the offsets of `thinArc`, verifies each with `knotlib`,
then widens the winner with the parent's bounded-step optimiser **in chunks,
re-verifying after each one and keeping the last shape that still checks out**.

Widening all the way and checking once does not work: at 12 corners it reaches a
gap of 0.26 with sublinks projecting to 36 crossings, where the bracket refuses
and most directions are degenerate. The link is almost certainly still right —
the step bound says so — but a starting shape nobody can check is not worth 0.1
of clearance.

| corners | distinct | gap thinned | gap shipped | sublinks reduce to |
|---|---|---|---|---|
| 6  | 2 | 0.0376 | 0.1180 | 8/8/12/8 |
| 9  | 3 | 0.0393 | 0.1537 | 6/10/12/12 |
| 12 | 4 | 0.0736 | 0.2084 | 6/6/6/6 |
| 15 | 5 | 0.1279 | 0.1279 | 6/6/6/6 |
| 18 | 6 | 0.1590 | 0.1590 | 8/10/8/10 |
| 21 | 7 | 0.1864 | 0.1864 | 6/10/10/10 |
| 24 | 8 | 0.2026 | 0.2026 | 6/6/6/6 |

The last four did not widen: the first chunk either won less than 2% or stopped
being checkable, so they ship as thinned. Re-run `node make-starts.mjs` to
regenerate `starts.js` (about 4 minutes).

## Files

| file | what |
|---|---|
| `index.html` | the tool. Canvas painter, group ops, the drag clamp |
| `starts.js` | generated: one verified arc per corner count |
| `make-starts.mjs` | generates it — sweep, verify, widen in chunks, verify again |
| `check.mjs` | re-verify a saved arc against `knotlib`; prints the cutting list |
| `starts.log` | what the last generation run printed |
