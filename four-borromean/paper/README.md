# The paper

`main.tex` — the draft. `latexmk -pdf main.tex` builds it; nothing outside this
directory is needed to typeset.

## What is generated, and by what

Nothing in the figures is drawn by hand from memory. Each one is emitted from
the verified geometry, so a figure cannot disagree with the result it
illustrates.

| file | produced by | from |
|---|---|---|
| `link.json` | `integer-model.mjs` | the two generating corners |
| `fig-link.tex`, `fig-sublink.tex` | `build-figures.mjs`, via `make-diagram.mjs` | `link.json` |
| `fig-borromean.tex` | `make-borromean-figure.mjs` | three circles in Venn position, cyclic over/under |

`make-diagram.mjs` is the renderer. It enforces what makes a picture a knot
diagram rather than a projection:

- exactly two strands at a crossing, kept apart from other crossings and corners;
- **no near misses** — two strands that do not cross must not appear to touch,
  which is a property of the viewing direction and so is part of what the
  direction search optimises, not something a thinner pen can fix;
- a break in the under-strand long enough to read. How long depends on the
  **angle**: strands meeting shallowly need a much longer break, since the
  erased length runs along the under-strand while the gap the eye wants is
  measured across the over-strand. The erased half-length is `(w/2 + g)/sin t`.

Gaps are cut in **arc length along the component**, not along the one segment
containing the crossing. That distinction matters: on a curve approximated by
many short segments, a gap wider than one segment is the normal case, and a
per-segment implementation silently truncates every break to nothing. A visible
piece left shorter than `minPiece` is dropped, merging two breaks into one,
which is what a hand illustrator would do rather than leave a fleck of ink. The projection direction is searched
for, not assumed — among directions giving the fewest crossings it keeps the one
whose worst feature is least bad. **Over and under are carried by the break
alone**, so every figure reads in greyscale; colour only separates components.

Run them from this directory with `node`. They import `../polygon.mjs`,
`../tetra.mjs`, `../lib.mjs`, `../linking.mjs` and `../../knotlib`.

## The supporting computations

| script | what it settles |
|---|---|
| `integer-model.mjs` | the model of Theorem 7.1: integrality, symmetry, linking numbers, the four sublinks |
| `milnor-symmetry.mjs` | Proposition 5.2 — the invariant subspace is 1-dimensional, spanned by (−1,1,−1,1) |
| `vertex-weave.mjs` | Theorem 6.2 — the 12-crossing model clasps every pair, in both cyclic orientations |
| `rationalise.mjs` | the search that produced the integer coordinates |
| `search-integer.mjs` | a wider search for a simpler integer model; found none |

`../test.mjs` is the standing check on the whole directory and covers the
smooth link as well as the polygonal ones.

## Not part of the paper

`tabled-obstructions.tex` holds two complete impossibility proofs that were cut:
convex planar components cannot work, and neither can the minimal twelve-crossing
model. Neither is needed to prove the link exists, so both are adjacent to the
problem rather than part of it. They are listed in `plan.md` section 8 and the
supporting computation is `vertex-weave.mjs`.

## The one gap

The sublinks are identified as the Borromean rings by Proposition 7.2, which
compares Jones polynomials and appeals to the published tables. A synthetic
isotopy would be better and is not in hand; see §8 of the paper, and `plan.md`
§6 for how it would be built.
