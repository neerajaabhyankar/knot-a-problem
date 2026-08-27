# The diagram type

> Status: **built and tested**, with one gap named in §7. `npm test` in this
> directory runs four suites; every number quoted below is one of their
> measurements, not an estimate.

The editor owns space curves — lists of points in ℝ³. The literature owns names
like `3₁`. Almost everything level (b) and level (c) want to do passes through a
third representation that sits between them, and this file is about getting that
one right, because both of the others are already fixed and this is the piece we
get to choose.

---

## 1. Why not a PD code

The obvious move is to make the [PD code](glossary.md#pd-code) primary. It is
what the literature prints and what invariant algorithms eat. It is still the
wrong choice, for two reasons that are not close.

**A PD code cannot express a crossing-free circle.** No crossings means no arcs
means nothing to write down, so a 2-component and a 3-component unlink have the
same PD code: the empty one. A side channel would be needed anyway, and once
there is a side channel the PD code is no longer the truth, only most of it.

**A PD code does not give you [faces](glossary.md#face).** Every Reidemeister
move is a condition on a face — that is not an implementation detail, it is what
the moves *are*. If faces have to be recovered by looking at coordinates, then
move detection becomes geometry, and geometry near a crossing is exactly where
floating point is least trustworthy. Faces should be a graph query.

So the truth is a [combinatorial map](glossary.md#combinatorial-map), and PD,
Gauss and DT are derived serialisations — the same relationship the tube mesh
has to `points` in the editor.

## 2. The type

```js
Diagram = {
  n:     number,       // crossings
  pair:  Int32Array,   // 4n darts; pair[d] is the dart at the far end of d's edge
  over:  Uint8Array,   // per crossing: 0 → the strand through slots {0,2} is on top
  loops: number,       // components with no crossings at all
}
```

A [dart](glossary.md#dart) is a half-edge. Dart `d` belongs to crossing `d >> 2`
and sits in slot `d & 3`, and **slots 0,1,2,3 run counter-clockwise**. That
cyclic order *is* the planarity. Nothing here stores a coordinate and the
diagram is still planar, because a [rotation system](glossary.md#rotation-system)
determines an embedding in the sphere.

Two consequences worth stating out loud:

- The two darts of one strand at a crossing are `d` and `d ^ 2` — opposite
  slots. Every construction has to preserve that, and `project()` asserts it
  rather than assuming it.
- `over` is a single bit per crossing, not a pair of labels, because "which of
  the two strands is on top" is genuinely one bit. The mirror image is
  `over.map(v => 1 - v)` and costs nothing.

Everything else on the class — faces, components, arcs, PD, Gauss, writhe,
canonical form — is **derived and cached**. If a derived value and the truth
ever disagree, the truth wins and the cache is the bug.

`layout` is deliberately *not* on this type. Coordinates come back from
`project()` alongside the diagram, because they belong to the projection that
produced them, not to the combinatorics. When the 2D view is built it will need
them, and it will need them to change *locally* when a move fires — a full
re-layout makes the whole picture jump and the reader loses their place. That is
a rendering concern and it can stay one.

## 3. Faces, and why they are the whole point

Faces are orbits of `φ(d) = ROTINV(pair[d])`: cross the edge, then step *back*
one slot. The inverse rotation rather than the rotation is what makes a kink
come out as a face of degree 1 instead of degree 3 — worth knowing, because both
conventions trace valid faces and both give the same count, so Euler's formula
will not catch the wrong one.

Then the three moves are three sentences:

| move | the face | the catch |
|---|---|---|
| **R1** | degree 1 — a monogon | none; always removable |
| **R2** | degree 2 — a bigon | removable only if the *same* strand is on top at both corners; if they alternate it is a [clasp](glossary.md#clasp) |
| **R3** | degree 3 — a triangle | available only if one strand is entirely above the other two, i.e. the over-relation is not a cycle |

Those two catches are the argument for checking structurally. A clasp and a
removable bigon are the same picture apart from one bit. A cyclic and an acyclic
triangle are the same picture apart from one bit. Nothing you can see
distinguishes them.

Measured, on real projections:

- The standard trefoil has faces of degree `2,2,2,3,3` — three bigons and two
  triangles — and **not one of the five admits a simplifying move.** Every bigon
  is a clasp and both triangles are cyclic, which is what "alternating" means
  locally. A simplifier that reports "nothing to do" on a trefoil is correct.
- The Hopf link's four bigons are all clasps. Correct: it does not come apart.
- Three circles stacked at three heights give eight triangles and **all eight**
  admit R3, because the heights are a total order. Flip the one corner that
  closes the cycle and that same triangle is refused.

## 4. Orientation and crossing sign

Following a strand is `σ(d) = pair[d ^ 2]`. Its orbits come in pairs — one per
direction of travel — so **choosing an orientation is choosing one orbit from
each pair**, and we take the one containing the lowest-numbered dart so the
choice is deterministic rather than arbitrary.

Crossing sign then needs no coordinates at all. Slots run counter-clockwise, so
a strand arriving at slot `s` is travelling in the direction of slot `s + 2`; the
under-strand is 90° counter-clockwise of the over-strand exactly when its arrival
slot is one further round. That is the right-hand rule, written as
`(SLOT(under) - SLOT(over) + 4) % 4 === 1`.

Checked against fixtures whose answers are known in advance: the trefoil has
writhe ±3 with all three signs equal, the figure eight has writhe 0, the Hopf
link ±2, Solomon's seal linking number ±2, and the Borromean rings pairwise
linking number 0 — which is the whole point of the Borromean rings and the
reason they are in the test set.

## 5. Canonical form, and the two symmetries that are easy to confuse

`canonical()` returns a string that is equal for two diagrams exactly when they
are *the same diagram*: same up to renumbering the crossings, up to which slot
you call 0, and up to reading the page from the other side.

This is **diagram equality, not knot equality.** Two diagrams of the same knot
generally differ here, and that is what makes it useful — it is how a test says
"this move changed the picture" or "this move did not".

The subtlety is a single bit:

| operation | effect on the knot |
|---|---|
| reverse every rotation | **the mirror image** — a different knot |
| reverse every rotation **and** flip every crossing | **the same knot**, seen from behind the page |

So `canonical()` quotients by the second and must not quotient by the first.
Getting this backwards would make every chirality test pass vacuously. It is
tested both ways: `pageFlip().canonical() === canonical()`, and
`mirror().canonical() !== canonical()` for the trefoil.

The mechanism is a rooted depth-first relabelling, minimised over every root
dart and both page orientations. One detail is load-bearing: the crossing bit
must be emitted as `(over + anchor) & 1`, relative to the slot the traversal
arrived by, or a rotation of the slots would change the string. XOR-ing the flip
on top is what makes the flipped reading of a diagram agree with the unflipped
reading of its page-flip.

Split pieces are canonicalised independently and sorted, since pieces of a split
diagram have no relationship to preserve.

## 6. Three guarantees for the moves

The question "how do I know a move respected the invariants" has no single
answer, because each available mechanism is blind somewhere different. There are
three, and they check each other.

**Before — the precondition is structural.** §3. A move that cannot fire, does
not fire, and `survey()` reports the reason rather than an absence.

**After — Euler's formula.** A connected 4-valent plane graph with `n` crossings
has `V = n`, `E = 2n`, and therefore exactly `n + 2` faces. This runs in the
`Diagram` constructor, so **every** diagram in the system is checked whether the
code that built it wanted checking or not. It is cheap and it is unreasonably
effective: any mis-wired dart breaks it immediately. The test that proves it has
teeth takes a valid trefoil, re-pairs two of its edges into a crossed pattern —
still a perfectly good involution — and confirms the complaint arrives:

```
not a plane diagram: 3 crossings in 1 piece(s) need 5 faces, traced 3
```

**After — the ambient fingerprint.** Recompute the Jones polynomial and the
linking numbers and assert they are unchanged. **Be honest about what this is: a
smoke detector, not a proof.** Two genuinely different knots can share a
fingerprint, so agreement does not establish correctness. But a scrambled
rotation system changes Jones instantly, so in practice it catches essentially
every implementation bug, at a cost of a few milliseconds.

Measured end to end: a deliberately bad view of the trefoil draws it with 8
crossings; R1 and R2 alone walk it back `8 → 6 → 4 → 3` with the fingerprint
identical at **every** step, and the diagram it lands on is `canonical()`-equal
to the standard trefoil — not merely one with the same crossing count.

And one test in the other direction, because an invariant that never moves is
not being tested: **the writhe must change under R1.** It does, `−1 → 0`, and
it must not change under R2, and it doesn't.

## 7. What is not built

**R3 is detected but not applied.** R1 and R2 removal are both the same
operation underneath — delete the crossings, let each strand run straight
through where they used to be — and that one splice handles the kink (the walk
enters, goes round the loop edge, and leaves), the bigon, and the case where
what is left over is a bare circle. R3 deletes nothing. It re-attaches three
edges to different slots while every crossing survives, so it needs its own
construction and its own proof that the result is still planar. `apply()` throws
a message saying exactly this rather than pretending.

**The 3D cross-check is not written**, because the geometric half of it does not
exist yet. It is the strongest test available and it should be built alongside
`relax.js`:

> Project a curve → `D₁`. Apply a move combinatorially → `D₂`. *Separately*,
> apply the corresponding isotopy to the 3D curve and project the result →
> `D₃`. Assert `canonical(D₂) === canonical(D₃)`.

Two independent implementations of the same move must agree, which is a real
test rather than a tautology. And the 3D half carries the one guarantee the
diagram half cannot: an isotopy is only an isotopy if the strand never passes
through itself, and no invariant can check that — you would be assuming what you
are proving. What checks it is clearance ≥ 2R at every keyframe, the same bar
the editor's shipped shape library is held to.

## 8. Invariance classes

The classic error in this corner of the subject is not a wrong algorithm, it is
a right algorithm used at the wrong level:

| quantity | survives |
|---|---|
| crossing count of *this* diagram | nothing |
| **writhe** | R2, R3 — [regular isotopy](glossary.md#regular-isotopy) only |
| **Kauffman bracket** ⟨D⟩ | R2, R3 only |
| linking number | R1, R2, R3 |
| **Jones** = (−A³)^−w ⟨D⟩ | R1, R2, R3 |

Writhe and the bracket are the two everyone reaches for and neither survives R1
— which is precisely why Jones is the bracket *corrected by* the writhe. So
every quantity is returned tagged with its class and `fingerprint()` refuses
anything not tagged `ambient`:

```
writhe is invariant under regular isotopy only — it cannot go in a fingerprint
```

That one piece of bookkeeping turns a subtle mathematical mistake into an
ordinary error message.

## 9. Reading a diagram off a curve

`project()` is the bridge, and it is the step that has to be careful, because
**a crossing is a property of a projection, not of a curve.** There is nothing
to point at until a direction has been chosen, and not every direction works.

So `project()` refuses rather than guesses, on five distinct grounds: strands
lying along each other (the Hopf link viewed down the axis of one ring, which
projects that component to a line segment), a crossing landing exactly on a
sampled vertex, a tangency, two crossings at the same point, and two strands at
the same depth — that last one meaning the curves actually touch in 3D, which is
not a diagram problem at all.

`choose()` samples directions from a Fibonacci spiral — deterministic, not
random, so a test that finds a 3-crossing trefoil today finds one tomorrow — and
keeps the fewest crossings among the generic ones. It reports `tried` and
`usable` because **the honest claim is "the best of what was tried", never
"minimal"**, and a caller that wants to say so needs the numbers. Of 64
directions on the trefoil, 63 are usable and the best gives 3.

## 10. Known limits

- **The Kauffman bracket is exponential.** 2ⁿ states, and it refuses above 16
  crossings rather than hanging the process. A careless projection reaches 26 on
  a (4,5) torus knot, so this is not a hypothetical.
- **Jones is written in A, not t.** `V(t) = f(A)` with `t = A⁻⁴`. Keeping it in A
  avoids fourth-root bookkeeping; a link with an even number of components has
  half-integer powers of t and those are ordinary integer powers of A.
- **`simplify()` is greedy and therefore incomplete.** It only goes downhill, so
  it reaches a diagram with no removable face rather than a minimal one. Getting
  past that needs R3 and needs the ability to go *up* — the moves that add a kink
  or a bigon are available almost anywhere, which is why simplification is a
  search. It is a simplifier, not a solver, and it says so.
- **Open arcs are refused.** An arc has no knot type, so there is nothing honest
  to return for one.
- **Nothing here knows about the editor**, and that is deliberate. The dependency
  runs one way.
