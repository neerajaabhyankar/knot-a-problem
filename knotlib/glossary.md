# Glossary

Words used in `diagram.md`, in the code comments, and in the top-level plan.
Written for someone who knows what a trefoil is and does not necessarily know
what a rotation system is — which is roughly the right split, because the knot
theory here is standard and the graph theory is the part doing the unusual work.

Definitions are given **in this project's terms**, so they are narrower than a
textbook's. Where that matters it is said. Pointers at the end.

---

## Part A — words about the picture

These come from topological graph theory rather than knot theory, and they are
the ones most likely to be unfamiliar. They are also the ones the design rests
on.

### Plane graph

A graph *drawn* in the plane with no edges crossing. Not the same as a *planar*
graph, which is one that *could* be so drawn. A knot diagram is a plane graph
whose vertices happen to be the crossings — the "no edges crossing" is not
violated, because at a crossing we declare there to be a vertex rather than a
crossing of edges.

Every crossing has four edge-ends attached, so the graph is **4-valent**.

### Face

A region the drawing cuts the plane into, including the unbounded one outside
everything. Its **degree** is how many edge-sides bound it.

This is the word that turns out to matter most here, because **every Reidemeister
move is a condition on a face**:

- a face of degree 1 is a **monogon** — a kink, an R1
- a face of degree 2 is a **bigon** — two strands bounding a lens, an R2
- a face of degree 3 is a **triangle** — an R3

Faces are not extra data. They are computable from the combinatorics alone,
which is exactly why the combinatorics are the truth and the coordinates are not.

### Dart

A **half-edge**: one end of one edge, attached to one vertex. An edge is a pair
of darts. A 4-valent vertex has four darts.

Darts are the standard way to make a graph-with-an-embedding into plain arrays.
Here dart `d` belongs to crossing `d >> 2` and sits in slot `d & 3`, so
`pair[d]` — the dart at the other end of `d`'s edge — is the entire edge set.

### Rotation system

For each vertex, the **cyclic order** of its darts as you go counter-clockwise
around it. That is all.

The remarkable fact, and the reason this project stores nothing else, is that a
rotation system **determines an embedding of the graph in a surface**, up to
homeomorphism — for a knot diagram, in the sphere. So planarity is not something
you check by looking at coordinates; it is something the data structure either
has or hasn't.

### Combinatorial map

A graph plus a rotation system. Sometimes called a *ribbon graph* or a *fat
graph*. This is what a `Diagram` is, with an over/under bit added at each vertex.

### Orbit / involution / permutation

Bookkeeping words. A **permutation** is a bijection of a finite set to itself —
here, of the darts. An **orbit** is what you get by applying it repeatedly from
one starting point until you come back. An **involution** is a permutation that
undoes itself (`f(f(x)) = x`); `pair` is one.

Faces, link components and strands are all *orbits of some permutation of the
darts*, which is why they all come out of the same three-line loop.

### Euler characteristic

For a connected graph drawn on a sphere, `V − E + F = 2`. For a knot diagram
with `n` crossings that is `n − 2n + F = 2`, so **`F = n + 2`** exactly.

Cheap to check and startlingly good at catching mistakes: any mis-wired dart
changes the face count. It runs on every diagram this library constructs.

### Genericity / a generic projection

A projection direction is **generic** when the picture it gives is a proper
diagram: crossings are transverse (not tangencies), no two crossings land on the
same point, no strand is seen exactly end-on, no two strands are at the same
depth where they cross.

Non-generic directions are not rare. A Hopf link of two perpendicular circles,
viewed down the axis of one, projects that component to a **line segment** —
there is no diagram there at all. This is the concrete reason the project keeps
insisting that a crossing is a property of a projection and not of a curve.

---

## Part B — words about knots

### Knot, link, component

A **knot** is a closed loop embedded in ℝ³. A **link** is several such loops. A
**component** is one of them; a knot is a link with one component.

An open arc is *not* a knot: you can always untangle it by pulling the ends, so
it has no knot type. That is why `project()` refuses one.

### Knot type / ambient isotopy

Two knots are the same **type** if one can be deformed into the other by moving
it around in space continuously **without ever passing the strand through
itself**. That deformation is an **ambient isotopy**. "Same knot" always means
this.

### Reidemeister moves

The three local changes to a *diagram* that correspond exactly to ambient
isotopy of the knot. Two diagrams describe the same knot if and only if a finite
sequence of R1, R2 and R3 takes one to the other (Reidemeister's theorem, 1927).

- **R1** add or remove a kink
- **R2** slide one strand over another and back off, adding or removing two crossings
- **R3** slide a strand across a crossing of two others

They are **isotopies**: they change the picture, never the knot.

### Crossing change

Swapping which strand is on top at one crossing. **Not** a Reidemeister move,
and not an isotopy — it changes the knot. It is the *unknotting operation*: any
knot can be turned into the unknot by enough crossing changes, and the fewest
needed is the unknotting number.

The distinction matters because "flip a crossing" sounds like a small edit and is
in fact the one operation in this whole area that throws the topology away.

### Clasp

A bigon whose two crossings *alternate* — the strand that is on top at one is
underneath at the other. It looks exactly like a removable bigon and cannot be
removed; the two strands are hooked. Detecting this is one of two places where
the over/under bits, not the picture, decide whether a move exists.

### Alternating diagram

One where, walking along the strand, you go over, under, over, under. The
standard trefoil, figure eight and Hopf link diagrams are all alternating. A
consequence worth knowing: an alternating diagram offers **no** simplifying R1,
R2 or R3 at all — every bigon is a clasp and every triangle is cyclic.

### Mirror image / chiral / amphichiral

The **mirror** of a knot is its reflection, equivalently the same diagram with
every crossing flipped. A knot is **chiral** if it is genuinely different from
its mirror (the trefoil) and **amphichiral** if it is not (the figure eight,
which is the smallest such knot).

Chirality is a real test of a tool: a program that cannot tell a trefoil from
its mirror is not computing what it thinks it is.

### Split link / unlink

A link is **split** if its components can be pulled into separate regions of
space. The **unlink** of *k* components is *k* circles lying apart — the
simplest split link, and the thing a PD code cannot express.

### Unknot

The plain circle. Also, and less obviously, any loop that *can* be deformed into
one — a diagram with 30 crossings may still be the unknot, which is why unknot
detection is a real problem rather than a glance.

### Torus knot / link

The curve that winds `p` times one way and `q` times the other around a torus.
`(2,3)` is the trefoil, `(2,5)` the cinquefoil, `(2,2)` the Hopf link. When
`gcd(p,q) > 1` you get a link with `gcd(p,q)` components. Convenient fixtures,
because their answers are known before you compute them.

---

## Part C — words about invariants

### Invariant

Any quantity computed from a diagram that is the same for every diagram of the
same knot. The point of the whole exercise: if two diagrams give different
values, they are different knots. (The converse does not hold — equal values do
not prove equal knots.)

### Regular isotopy

Deformation using **R2 and R3 only** — no R1. A weaker equivalence than ambient
isotopy, and the reason some useful quantities are not knot invariants: they see
kinks.

`invariants.js` tags every quantity `diagram`, `regular` or `ambient` and refuses
to build a fingerprint from anything but the last.

### Writhe

The sum of the signs of the crossings, `+1` or `−1` each by the right-hand rule.
**Not a knot invariant** — R1 changes it by ±1. It is a regular-isotopy invariant.

### Linking number

Half the signed count of the crossings *between two different components*. A
genuine invariant, and an easy one, because a self-crossing never contributes so
R1 cannot touch it. The Hopf link has ±1, Solomon's seal ±2, and the Borromean
rings have 0 for every pair despite being inseparable — which is exactly why they
are the standard cautionary example.

### Kauffman bracket

A polynomial computed by resolving every crossing two ways and summing over all
2ⁿ resulting states. **Not a knot invariant**: it survives R2 and R3 but a kink
multiplies it by `−A^±3`.

### Jones polynomial

The Kauffman bracket corrected by the writhe: `V = (−A³)^(−w) ⟨D⟩`. The
correction exists precisely to cancel the R1 behaviour of both halves, which is
the cleanest illustration in the subject of why the invariance bookkeeping is
worth doing. It **is** a knot invariant, and it distinguishes the trefoil from
its mirror.

Written here in `A`; the usual variable is `t = A⁻⁴`.

### PD code

**Planar Diagram** code: one entry `X[a,b,c,d]` per crossing, listing the four
arcs meeting there counter-clockwise starting from the incoming under-arc. The
standard interchange format — the Knot Atlas and most software speak it.

Derived here rather than primary, for the reasons in `diagram.md` §1.

### Gauss code / DT code

Two other ways to write a diagram down as a sequence.

**Gauss**: walk the strand and write down each crossing as you meet it, marked
over or under and signed. Compact, but not every Gauss code is realisable in the
plane — planarity has to be checked separately, which is the drawback.

**Dowker–Thistlethwaite**: number the passes 1…2n along the strand, then pair
each odd number with the even one at the same crossing. Extremely compact and
what the classical tables are stored in.

### Braid word

A knot written as a plaited braid whose ends are joined up. Every knot arises
this way (Alexander's theorem). A fourth input format for the same picture.

### Ropelength / Möbius energy

Numbers you can attach to a *curve in space* rather than to a diagram, which
increase as the curve gets tangled. Sliding downhill on one of them relaxes a
messy hand-drawn loop into a tidy embedding without changing the knot. This is
what `relax.js` will do; the editor's smoothing already contains a small version
of the repulsion involved.

---

## Part D — words specific to this codebase

### Slot

Which of the four positions round a crossing a dart sits in, `0..3`,
counter-clockwise. `d & 3`. The two darts of one strand are always opposite
slots — `d` and `d ^ 2`.

### `over` bit

One bit per crossing: `0` means the strand through slots `{0,2}` is on top, `1`
means `{1,3}`. Flipping every bit is the mirror image.

### Page flip

Reversing every rotation **and** flipping every crossing: the same knot, viewed
from behind the page. Reversing the rotations *without* flipping the crossings is
the mirror instead. One bit apart, opposite meanings — `canonical()` quotients by
the first and not the second.

### Canonical form

A string that is equal for two diagrams exactly when they are the same *diagram*
— up to renumbering, up to slot rotation, up to the page flip. Diagram equality,
not knot equality.

### Fingerprint

Everything ambient about a diagram, as one comparable string: component count,
linking numbers, Jones polynomial. Used to assert that a move did not change the
knot. A **smoke detector, not a proof** — different knots can share one.

---

## Pointers

**If you want one book:** Colin Adams, *The Knot Book*. Undergraduate level,
does Reidemeister moves, invariants, chirality and the tables properly, and it
is the standard recommendation for a reason.

**For the bracket and the Jones polynomial from scratch:** Louis Kauffman,
*On Knots*, or his original 1987 paper *State models and the Jones polynomial* —
the state sum in `invariants.js` is a direct transcription.

**For a fuller reference:** Peter Cromwell, *Knots and Links*, or Rolfsen,
*Knots and Links* (the source of the classical tables and the `3₁`, `4₁`
numbering).

**For tables and PD codes:** the Knot Atlas, <https://katlas.org> — every knot
to 12 crossings with its codes and invariants, and the format most software
interchanges in.

**For the graph theory half**, which the knot books mostly skip: Mohar &
Thomassen, *Graphs on Surfaces*, for rotation systems and embeddings; or
Wikipedia's *Rotation system* and *Combinatorial map* articles, which are
unusually good and are enough for what is used here.

**For the tabulation picture** mentioned in the top-level plan:
<https://en.wikipedia.org/wiki/Knot_tabulation>
