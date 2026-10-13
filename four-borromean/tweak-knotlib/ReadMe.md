# Corner tweaker — a scratch tool for making the diagram prettier

A copy of `../tweak/` with the editor's palette, ring selection and a second
starting shape added. Temporary, and deliberately self-contained: it reads
`../curves.json` and `../polygon.mjs` through its generator scripts and writes
nothing but its own files. `knotlib` and `editor` are untouched; the palette is
copied from `editor/src/style.css` value for value rather than imported.

```sh
open index.html          # that is the whole setup; no server, no build
```

`starts.js` is a plain script rather than JSON so the page runs from `file://`.
Checked in WebKit and Firefox.

## What it does

Drag any corner of the 4-component tetrahedral link. **Its eleven twins move
with it** — two more on the same ring, three on each of the other three — so the
link stays exactly tetrahedral at every moment, and "make this corner less
cramped" is one gesture rather than twelve.

| | |
|---|---|
| **corners** | 6, 9, 12, 15, 18, 21, 24 per ring. Only multiples of three exist: each ring repeats three times under its own 120° rotation, so 3k corners means k distinct ones, and that k is what you edit |
| **start** | `clear` — fewest crossings in its best view. `roomy` — largest closest approach, where one is found that `clear` does not already beat |
| **rings** | click to select; shift-click to hide. `hide` / `solo` act on the selection |
| **colour** | the editor's nine strand colours and its hue strip, applied to **the selected ring only** |
| **view** | 3-fold, 2-fold, `clearest` (240 directions, fewest crossings), spin |
| **edit** | undo (geometry *and* colour), reset, save arc, save .knot.json |

**Selection.** Click a ring button or a strand; the others dim rather than
vanish, because the point of selecting a ring is usually to see where it goes
among the rest. <kbd>A</kbd>…<kbd>D</kbd> select by name, <kbd>S</kbd> solos,
<kbd>H</kbd> hides, <kbd>esc</kbd> clears.

**Rings cannot be deleted or duplicated,** and that is not an omission: all four
are generated from the one arc you are editing, and a fifth curve or a missing
one is simply not this link.

Edits, colours and the shape choice survive a reload (`localStorage`);
**reset** restores both the starting shape and the default colours, which is
also the way back from a recolour you no longer want after a reload.

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
crossing and both ruin a diagram anyway: a **spike** (turn angle past 132°) and
a **collapse** (an edge shorter than a tenth of the ring). The canvas says so.

The spike limit started at 150° and that was too loose. A shape abused to 147.8°
kept the link but became *unreadable* — `no usable direction among 512`, because
a strand that nearly doubles back makes every projection degenerate. At 132°,
300 random full-strength yanks still come back `ALL FOUR SUBLINKS BORROMEAN`.

## Checking a tweak anyway

A guarantee that is never tested is a comment, not a fact:

```sh
node check.mjs arc-12-clear.json
```

Rebuilds the link from the saved arc and asks `knotlib`: symmetry exact, all six
linking numbers zero, each of the four three-ring sublinks Borromean, plus the
cutting list for a paper model.

One honest wrinkle, inherited rather than introduced: a sublink can come back
**unreadable** instead of confirmed. `knotlib`'s Kauffman bracket refuses above
16 crossings and `simplify()` is R1/R2 only, so a tangled projection sometimes
cannot be pushed under the limit — the gap named in `../ReadMe.md` §8. The
script retries with 512 directions first and reports what is left as unreadable
rather than counting it against the shape. It is not evidence the link changed;
the clamp is.

## What a sublink is, and what the numbers mean

Throw one ring away and three remain. There are four ways to do it, one per ring
dropped, and **each of those three-ring links is the Borromean rings** — that is
the whole point of this object. On the tetrahedron, each ring lives on a face,
and the three faces meeting at a corner are exactly the three that miss the
opposite face, so the four sublinks correspond to the four corners.

Two different crossing numbers appear below, and they measure different things:

- **view crossings** — how many crossings the whole four-ring picture shows from
  the direction that shows fewest, out of 160 sampled. This is the legibility of
  the diagram you would print.
- **sublink crossings after R1/R2** — for each of the four three-ring sublinks,
  how many crossings its diagram still has after `knotlib` simplifies it with
  Reidemeister moves I and II. Six is the Borromean minimum. A larger number is
  a messier drawing of the same link, not a different link; the verdict is the
  separate Borromean check, which every shape here passes.

## The two starting shapes

Neither is best outright, and each is worse than the other at the other thing.

- **clear** (`fewest-crossings.mjs`) hill-climbs to minimise view crossings, with
  clearance held above 0.06 and ties broken by clearance.
- **roomy** (`best-gap.mjs`) hill-climbs to maximise clearance.

Both are best *found*, not proven optima: these are local climbs from a handful
of starting offsets. Clearance is compared **scale-free** (`gap / rms`), because
any gap can be inflated by scaling the whole link up.

<!-- TABLE -->
| corners | clear: gap | gap/size | view crossings | sublink crossings after R1/R2 | roomy: gap | gap/size | view crossings | sublink crossings after R1/R2 |
|---|---|---|---|---|---|---|---|---|
| 6 | 0.121 | 0.124 | 36 | 8/8/12/8 | — | — | — | — |
| 9 | 0.1629 | 0.1455 | 28 | 6/6/12/6 | 0.1749 | 0.1545 | 48 | 8/16/12/12 |
| 12 | 0.2958 | 0.2325 | 28 | 6/6/6/6 | 0.2508 | 0.2664 | 40 | 14/6/6/6 |
| 15 | 0.3833 | 0.2646 | 28 | 10/6/6/6 | 0.271 | 0.3223 | 65 | 16/16/16/16 |
| 18 | 0.3268 | 0.2717 | 28 | 14/10/10/10 | 0.3281 | 0.3444 | 54 | 16/14/14/11 |
| 21 | 0.355 | 0.3144 | 28 | 14/16/6/6 | 0.3107 | 0.3607 | 52 | 15/16/16/14 |
| 24 | 0.303 | 0.2887 | 28 | 6/8/6/6 | 0.3104 | 0.3681 | 64 | 14/16/16/14 |

Four things fall out of it.

**28 view crossings is a floor.** Every count from 9 upward reaches exactly 28
and none goes below, from any of the starting offsets or either search. That
agrees with the whole-link figure for the smooth rings in `../ReadMe.md` §6, and
with the argument there that each of the six pairs has to weave through two
Borromean triples, which puts a floor near 24 on any diagram of this link.

**Six corners per ring cannot reach it.** 36 is the best found there: two
distinct corners per ring is too few to route the weave any more cheaply, and it
is the one count where no roomier shape exists either.

**The two objectives disagree much more about legibility than about room.** The
roomy shapes show 40 to 65 crossings against a flat 28, while their clearance
advantage is a few hundredths. If you want a picture, `clear` is not a
compromise; if you want to cut one out of card, the margin is what matters.

**`clear` sometimes has the larger absolute gap** — at 12, 15 and 21 corners —
because clearance is its tie-break and its shapes come out physically bigger.
Scale-free, `roomy` still wins wherever it is offered, which is what the
`gap/size` column is for.

An earlier version of this directory shipped a third shape called `tidy`. It
optimised nothing — it widened the gap in chunks and stopped at the first chunk
that failed to pay off, so its low crossing counts were a side effect of not
moving far. Worse, its verification sampled only 96 directions, so at 15 corners
it threw away a shape that was twice as roomy and perfectly valid, because one
sublink happened to be unreadable from those 96. It is gone.

## Files

| file | what |
|---|---|
| `index.html` | the tool. Canvas painter, group ops, the drag clamp, palette and selection |
| `starts.js` | generated: the `clear` and `roomy` arcs per corner count |
| `fewest-crossings.mjs` | the `clear` search — coarse climb on 24 directions, re-measured on 160 |
| `best-gap.mjs` | the `roomy` search — clearance, every verified offset, four seeds |
| `bundle-starts.mjs` | merges both into `starts.js`. Run after either of the above |
| `table.mjs` | prints the table above from `starts.js`, so the prose cannot drift |
| `check.mjs` | re-verify a saved arc against `knotlib`; prints the cutting list |
| `fewest-crossings.json`, `best-gap.json` | what those two searches found |
| `*.log` | what they printed |
| `make-starts.mjs`, `starts-tidy.json` | the retired `tidy` generator, kept only as a seed source |
