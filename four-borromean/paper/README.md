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
| `fig-link-3fold.tex`, `fig-link-2fold.tex`, `fig-sublink.tex` | `make-figure.mjs` | `link.json` |
| `fig-borromean.tex` | `make-borromean-figure.mjs` | three golden rectangles, checked against `knotlib` before drawing |

Run them from this directory with `node`. They import `../polygon.mjs`,
`../tetra.mjs`, `../lib.mjs`, `../linking.mjs` and `../../knotlib`.

## The supporting computations

| script | what it settles |
|---|---|
| `integer-model.mjs` | the model of Theorem 7.1: integrality, symmetry, linking numbers, the four sublinks |
| `milnor-symmetry.mjs` | Proposition 5.2 — the invariant subspace is 1-dimensional, spanned by (−1,1,−1,1) |
| `vertex-weave.mjs` | Theorem 6.2 — the 12-crossing model clasps every pair, in both cyclic orientations |
| `rationalise.mjs` | the search that produced the integer coordinates |

`../test.mjs` is the standing check on the whole directory and covers the
smooth link as well as the polygonal ones.

## The one gap

The sublinks are identified as the Borromean rings by Proposition 7.2, which
compares Jones polynomials and appeals to the published tables. A synthetic
isotopy would be better and is not in hand; see §8 of the paper, and `plan.md`
§6 for how it would be built.
