# What the paper says — 2 minute version

## The result

A 4-component link where **every 3 of the 4 are the Borromean rings**, with
**tetrahedral symmetry**. We have it, with coordinates.

Pairwise-unlinked is free — it follows from triplewise-Borromean. And "the
symmetry acts faithfully" already forces it to shuffle all 4 components around.
So the problem has **two conditions, not three**, and one of your hypotheses is
really a lemma.

## The one idea we borrow

One ring per **face** of the tetrahedron. Choosing 3 of 4 faces = leaving one
out = naming the **vertex** where the other three meet. So "any 3 are Borromean"
= "the rings weave Borromean-style at each of the 4 corners", and the symmetry
moves any corner to any other — four conditions collapse to one.

That's Kyle Miller's observation. Credited once, where it's used. Nothing else
from that thread enters the paper.

## Status

| | |
|---|---|
| Existence, explicit coordinates | **done** |
| Symmetry exact (12 rotations) | **done** — built in, not measured |
| Pairwise linking numbers all 0 | **done** |
| Triple invariants consistent with the symmetry | **done** — was the risky bit, now settled |
| Convex planar rings impossible | **done**, clean proof |
| **Each triple really is Borromean** | **the gap** |

## The gap, and the plan for it — route (B), as you chose

Today we identify each triple by Jones polynomial + a table lookup. Not a
self-contained proof.

**Constructive route:** build the link so each triple is *visibly* Borromean —
standard Borromean weave inside a ball at each vertex, and every connecting arc
provably meets nothing. One triple proves all four, by the symmetry.

**This probably means redesigning the component.** The link we have was found by
search and relaxed; it isn't built to make that argument true. Expect the
redesign to produce a cleaner link, maybe with fewer crossings. **Everything
downstream is provisional until this lands.**

Bonus: a local proof doesn't care that it's a tetrahedron, only that every
vertex meets 3 faces — so it should hand us the cube for free.

## Your two questions

**"Reflective symmetry, 24 elements?"** Three groups, easy to confuse:
- **T**, order 12, rotations of the tetrahedron — *what we have*.
- **T_d**, order 24 = T + **mirrors**. Asks: can the link equal its own mirror image?
- **O**, order 24, **rotations of the cube**, no mirrors. Its 90° turns cycle the
  4 body diagonals — **this is exactly your C₄ question**.

So "can we have circular symmetry at n=4?" and "can we have 24?" are the same
question, if 24 means O.

**"Complement hyperbolic / symmetry group exactly 12?"** The *complement* is the
air around the strings — delete the link from space and look at what's left.
If it carries hyperbolic geometry (most do), that geometry is **unique**, so
every symmetry of the link is a symmetry of it, and SnapPy computes the full
list in seconds. Right now we only claim *this drawing* has 12 rotations. If the
answer is "exactly 12", then no redrawing gets more, Theorem A upgrades to
**"this is the most symmetric it can be"**, and both T_d and O are dead. If it
comes back bigger, even better — a more symmetric version exists, go find it.

One afternoon. Best information-per-hour on the list.

## Adjacent problems — your five

**I was wrong last turn and you were right: polyhedral symmetry is not available
at n=5.** The 5-faced 3-valent polyhedron is the triangular prism, but its faces
split into 2 orbits (2 triangles, 3 squares) and its rotation group is only
order 6 — no single generating component, no collapse of conditions. The
dodecahedral five-tetrahedra compound in your `vedoexecs/` is a *third* kind of
thing — a polyhedral group acting on objects that aren't faces — not an n=5
analogue. Parked as its own question.

**Keeping cyclic and polyhedral strictly apart from here on:**

1. **Non-convex planar rings.** Open, and I'd guess possible. Cheap experiment:
   restrict the existing search to 3-fold-symmetric star-shaped planar curves.
2. **Cyclic C_n.** Conditions = orbits of triples: n=4 → **1**, n=5 → 2,
   n=6 → 4, n=7 → 5. **n=4 is the cheapest open question we have** and is *not*
   answered by our theorem (A₄ has no order-4 element). No obstruction found.
   ⚠️ Your rosette figures are **round circles**, and Borromean rings provably
   can't be made of round circles — so they show the symmetry we want on an
   object without the linking we want. Components can never be circles here.
3. **Face-polyhedral.** Needs a face-transitive 3-valent polyhedron: only
   tetrahedron (4), cube (6), dodecahedron (12). **n=4 is the unique case where
   "every triple" = "every vertex"** (C(n,3) = 2n−4 only at n=4). At n=6 the
   cube gives "the 8 vertex-triples are Borromean" — weaker than "all 20".
4. **Brunnian.** = remove any one and the rest fall completely apart. We can
   *prove* the standard 4-component ones **cannot** have tetrahedral symmetry.
   Doesn't rule out exotic ones. Nice contrast result. See below for the words.
5. **Min crossing number.** We see 28; a ~24 lower bound looks provable.

## The vocabulary you asked about

**Linking number** — how many times one loop passes through another. Crude. For
Borromean rings it's **0** for all three pairs, which is the whole point: they're
inseparable and this number can't see it.

**Milnor's triple invariant** — the next rung up. An integer that sees *three-way*
linking. ±1 for Borromean, 0 for three unlinked loops. There's a whole ladder:
length-4 invariants see four-way linking, and so on.

**"Obstructed"** — we can *prove* it doesn't exist, because the symmetry forces
an invariant to be 0 while the thing we want needs it non-zero. For the Brunnian
case: a 3-fold rotation forces every length-4 invariant to vanish, and the
standard links need theirs to be ±1. An obstruction on one rung says nothing
about the rungs above it.
