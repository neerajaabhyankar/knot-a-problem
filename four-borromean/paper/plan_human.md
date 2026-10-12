# What the paper says — 2 minute version

## The result

There is a 4-component link where **every 3 of the 4 are the Borromean rings**,
and the whole thing has **tetrahedral symmetry**. We have it, with coordinates.

Pairwise-unlinked is free: it follows from triplewise-Borromean, since Borromean
rings are themselves pairwise unlinked. So the problem has two conditions, not
three. Worth saying once in the paper and then dropping.

## Why the tetrahedron is the right shape (and this is the one idea we borrow)

One ring per **face**. Choosing 3 of 4 faces = leaving one out = naming the
**vertex** where the other three meet. So "any 3 are Borromean" means "the rings
weave Borromean-style at each of the 4 corners", and the symmetry moves any
corner to any other — which is why the four conditions collapse to one.

That observation is Kyle Miller's, from a Stack Exchange thread. It is the part
we actually used and he gets the credit for it. Nothing else from that thread
goes in the paper.

## What we can prove right now

| | status |
|---|---|
| Existence, with explicit coordinates | **done** |
| Symmetry is exact (12 rotations) | **done** — built in, not measured |
| Pairwise linking numbers all 0 | **done** — rigorous, Gauss integral + combinatorial |
| Milnor triple invariants forced to ±1 in a fixed sign pattern | **done, needs write-up** |
| Convex planar rings are impossible | **done** — clean proof |
| **Each triple really is Borromean** | **THE GAP — computational evidence only** |

## The one thing blocking publication

We currently show each triple has the Borromean rings' Jones polynomial and zero
linking numbers, on a 6-crossing diagram. That identifies it **only if you grant
the published link tables**. A referee will want a self-contained certificate.

Two ways out, pick one:
- **(A) Combinatorial.** Print the diagram, give the explicit Reidemeister
  sequence to the standard 6-crossing Borromean diagram. Finite, checkable,
  boring to produce. Needs R3, which knotlib doesn't have.
- **(B) Constructive.** Build the link so each triple is *visibly* Borromean —
  design the weave at each vertex to be the standard one, prove the rest is
  unknotted. Proves it by construction, no computer. Harder, much nicer paper.

I'd aim for (B) and keep (A) as the fallback.

## Honest correction to earlier work

The "four flat triangles can't work" argument assumed the rings are **convex**,
not just flat. Triangles are convex so the conclusion stands for triangles, but
the general planar case is **open** — and I now think it's probably *possible*,
because a non-convex planar ring meets the key line in 4+ points and the
obstruction evaporates. That's a genuine adjacent question, not a hole.

## Adjacent problems — you choose, I'm not committing to any

1. **Non-convex planar rings** — can all four be flat? Obstruction fails. Open.
2. **Other polyhedra.** The construction needs exactly 3 faces per vertex. That
   means tetrahedron (4), cube (6), dodecahedron (12). Octahedron/icosahedron
   are out. Cube is the obvious next one.
3. **n = 3** is the classical Borromean rings; **n = 5** has no polyhedron.
4. **Brunnian version** — any 3 fall *apart*, 4 together linked, tetrahedral.
   We can already prove the standard ones are **obstructed** (a 3-fold symmetry
   forces all length-4 Milnor invariants to vanish). Nice contrast result.
5. **Full reflective symmetry** (24 elements, not 12) — achievable?
6. **Minimal crossing number** of our link. We see 28; we can prove ≥ 24-ish.
7. **Is the complement hyperbolic**, and is the symmetry group exactly 12?

## Scope I'd suggest

Paper = the result + the symmetry argument + the convex obstruction + one
adjacent remark. 4 pages. Everything else is a second paper.
