# Plan: a short paper on the tetrahedral four-ring link

## The claim

Four loops in space, arranged so that **any three of them form the Borromean
rings**, with the full rotational symmetry of a tetrahedron. Explicit
coordinates exist and are verified.

## Two conditions, not three

1. Every three of the four loops form the Borromean rings.
2. All twelve rotations of a tetrahedron leave the arrangement unchanged.

"No two loops are linked" need not be assumed — it follows from (1), since no
two Borromean rings are linked either. Both this and "the symmetry shuffles all
four loops" become small lemmas rather than hypotheses.

## The idea it rests on

One loop per **face** of a tetrahedron. Four faces, four corners, and the three
faces meeting at a corner are exactly the three avoiding the opposite face. So
choosing three loops is the same as naming a corner, and the condition becomes
"the loops weave in the Borromean pattern around each corner."

The symmetry carries any corner to any other, so the four conditions are one
condition. That is the whole reason the tetrahedron is the right shape.

Due to Kyle Miller, cited once where it is used.

## Status

| | |
|---|---|
| Existence, explicit coordinates | done |
| Symmetry exact, not approximate | done — built into the construction |
| No two loops linked | done |
| Symmetry compatible with the required linking | done |
| Flat, bulge-free loops impossible | done, clean proof |
| **Each triple really is the Borromean rings** | **the remaining gap** |

## The gap, and how it closes

The triples are currently identified by computing a polynomial invariant and
looking it up in a published table of small links. Strong evidence, not a proof.

**Plan: prove it by construction.** Build the link so that around each corner
the three loops *visibly* form the standard Borromean picture, and every stretch
of loop between corners demonstrably gets in nobody's way. By the symmetry,
proving it at one corner proves it at all four.

This likely means redesigning the loop — the current one was found by search and
smoothed, not built to make that argument work. **Coordinates, figures and
crossing counts stay provisional until this lands.**

Side effect: an argument using only "three faces meet at every corner" does not
care that the solid is a tetrahedron, so it should hand over the cube version
free.

Fallback if the redesign fails: print an explicit sequence of standard diagram
moves taking one triple to the standard Borromean picture. Certain, duller.

## Open problems

At most one or two reach the paper.

**1. Flat loops with dents allowed.** Proved impossible when loops are flat
*and* bulge-free. Nothing known once dents are allowed; probably possible.
Cheap to test.

**2. Cyclic symmetry.** One axis, the loops carried round it in a cycle. The
number of conditions to check is the number of orbits of triples: 1 for four
loops, 2 for five, 4 for six, 5 for seven. **Four loops is the cheapest open
question on this list** — a single condition, no obstruction found, and not
answered here, since the tetrahedral group contains no 4-fold rotation. Note
this asks for a *different* symmetry, not a stronger one: a 4-fold axis and the
tetrahedral rotations do not contain one another.

**3. Tetrahedral symmetry plus mirrors.** The full symmetry group of the
tetrahedron is the twelve rotations together with twelve reflections. This is a
genuine strengthening of the present result. A reflection reverses handedness,
so the arrangement would have to be carried onto itself by a mirror. Not
obviously impossible — the Borromean rings are equal to their own mirror image.
The current link almost certainly lacks it, since the search had no reason to
produce it. Problem 7 settles it.

**4. More loops, one per face.** Needs a solid with exactly three faces at every
corner whose symmetry treats all faces alike: tetrahedron (4 loops), cube (6),
dodecahedron (12). **Not available for 5** — the only 5-faced candidate is the
triangular prism, whose faces come in two kinds and whose rotation group has six
elements, so the loops cannot all be alike.

Worth stating plainly: **four is the only case where "any three loops" and "a
corner" mean the same thing.** The cube has 8 corners but 20 ways to pick three
of six faces, so the cube version proves the weaker claim that the 8
corner-triples are Borromean.

**5. The opposite condition.** Remove any one loop and the other three fall
*completely apart*, still tetrahedral. The usual such links are provably
impossible here; exotic ones are not ruled out. A clean contrast: same solid,
opposite answer.

**6. Fewest crossings.** Current diagram reduces to 28; a lower bound near 24
looks provable.

**7. The shape of the surrounding space.** Delete the link from space; the
region left over has a shape that is itself an invariant of the link, and for
links like this one that shape is **rigid** — there is exactly one, and a
computer can list all its symmetries. That count is the most symmetry any
drawing of this link could ever have. Twelve means the present result is best
possible and problem 3 closes both ways; more means a better drawing exists.
Half a day, and the most informative item here.

## Order of work

1. Redesign the loop for the constructive proof. Everything waits on this.
2. Re-express as a polygon with whole-number coordinates, so crossings are
   settled by exact arithmetic instead of floating point.
3. Run the surrounding-space computation (problem 7).
4. Definitions and problem statement; then proofs; then figures.

## Plain meanings

**Link** — several closed loops of string in space, not touching.

**Borromean rings** — three loops, no two linked, that still cannot be pulled
apart. Cut one and the other two fall free.

**Linking number** — how many times one loop passes through another. It is 0
for every pair of the Borromean rings, which is why something subtler is needed.

**Triple linking number** — the next measure up, detecting three-way linking no
pair-by-pair count can see: ±1 for the Borromean rings, 0 for three separate
loops. There is a ladder of these, each seeing what the ones below miss.

**Obstructed** — proved impossible: the symmetry forces one of these numbers to
be 0 while the arrangement sought needs it non-zero. An impossibility proof, not
a failed search. An obstruction on one rung says nothing about higher rungs.

**Bulge-free (convex)** — no dents, so a straight line crosses the loop at most
twice. Triangles and ellipses qualify; stars do not.
