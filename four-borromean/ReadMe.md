# Four rings, tetrahedral symmetry, Borromean everywhere you look

> **Status: solved, with one honest gap.** There is a 4-component link with
> exact tetrahedral symmetry (|T| = 12) whose every 3-component sublink is the
> Borromean rings. It is built, verified against `knotlib`, and shipped here as
> `tetrahedral-4-borromean.knot.json`, five SVG views, and the scripts that
> produce and check it. The gap is named in §8 and it is a gap in the
> *certificate*, not in the construction.

## 1. The question

From [math.stackexchange.com/q/2981717](https://math.stackexchange.com/questions/2981717):
*is there a 4-component link such that removing any one of them leaves the
Borromean link?*

Kyle Miller's [answer](https://math.stackexchange.com/a/2992328) gives one, with
the observation that makes the whole problem click:

> You can sort of think of the Borromean rings as lying on three faces of a
> tetrahedron, with the centre triangle of the usual presentation at a vertex.

He then claims tetrahedral symmetry and, a comment later, retracts it. Darth
Geek's [redrawing](https://math.stackexchange.com/a/2996699) — four triangles,
which is the diagram you sent — is beautiful and has 3-fold symmetry, not
tetrahedral. This directory is about closing that gap.

**The combinatorics fit the tetrahedron exactly, and that is the reason to
want the symmetry.** Put one component on each of the four *faces*. The four
3-element subsets of the faces are precisely the four *vertices*, because the
three faces meeting at a vertex are exactly the three that miss the opposite
one. So "remove any one component and the rest are Borromean" reads as **"the
rings weave Borromean-style around each of the four vertices"**, and the
tetrahedral group permutes those four weaves transitively. One picture, four
Borromean rings, and the symmetry is what says they are all the same weave
rather than four coincidences.

## 2. First: is it even allowed?

Before building anything, the cheap thing to do is ask whether a known
invariant already forbids it — because if it does, all the searching in the
world is wasted.

The relevant invariants are Milnor's triple linking numbers μ(ijk). Every
pairwise linking number here is zero (Borromean rings are pairwise unlinked), so
the μ(ijk) are well-defined integers, and "this triple is Borromean" forces
μ(ijk) = ±1 for all four triples. μ is alternating in its three indices.

A symmetry g permuting the components by σ, with ε_i = ±1 recording whether it
preserves each component's orientation, gives μ(σi, σj, σk) = ε_i ε_j ε_k μ(ijk).
Writing A = μ(123), B = μ(124), C = μ(134), D = μ(234) and grinding the
constraints from the two 3-cycles that generate A₄:

- the 3-fold about v₁ (fixing component 4, cycling 1→2→3) forces **ε₄ = +1,
  D = B and C = −B**, leaving A free;
- the 3-fold about v₄ then forces **A = −B**.

So (A, B, C, D) = (−1, 1, −1, 1) up to overall sign, all four of magnitude 1.
**The constraints are consistent.** Tetrahedral symmetry is not obstructed at
this order, which is exactly the licence to go looking. This is a necessary
condition passing, not a construction — but it is the check that would have
saved the effort had it failed.

> **An aside that is not this problem, and is worth keeping straight.** The
> *other* reading of "generalise the Borromean rings to four" is a 4-component
> **Brunnian** link — remove any one and the rest fall *apart*. For that one the
> same style of argument gives an obstruction rather than a pass. A Brunnian
> 4-link's fourth longitude lives in the multilinear weight-3 part of the free
> Lie algebra on x₁,x₂,x₃, which is 2-dimensional with basis [[x₁,x₂],x₃] and
> [[x₁,x₃],x₂]. The 3-cycle acts on that plane with characteristic polynomial
> λ² + λ + 1, so it has no eigenvalue +1 **or** −1, and the fixed and anti-fixed
> subspaces are both zero. Any 4-component link with a symmetry cyclically
> permuting three components and fixing the fourth therefore has **all its
> length-4 Milnor invariants zero** — so the standard 4-component Brunnian links
> admit no such symmetry at all. Different question, opposite answer.

## 3. The construction, and why the symmetry is free

The symmetry is not hoped for and then checked. It is built in, and the trick is
to design **one component** and let the group make the rest.

Fix the tetrahedron with vertices v₁ = (1,1,1), v₂ = (1,−1,−1), v₃ = (−1,1,−1),
v₄ = (−1,−1,1). The stabiliser of face F₁ in the rotation group T is the 3-fold
rotation R about the v₁ axis, which in these coordinates is nothing more than
the coordinate cycle (x,y,z) ↦ (z,x,y). The three 2-fold rotations about the
coordinate axes are coset representatives, each carrying F₁ to one of the others.

So: **make one curve invariant under R, and generate the other three by those
three rotations.** The result is T-invariant for free, at every parameter value,
because there is nowhere for the symmetry to leak out of. `tetra.mjs` does this
and `checkSymmetry()` asserts it point-set-wise on all four generators — not as
a tolerance, as exact float equality of the sorted coordinates.

The seed is written as

```
P(φ) = t·v₁ + ρ(φ)·(cos φ E₁ + sin φ E₂) + z(φ)·n₁
```

with ρ and z any functions of period 2π/3, since R is rotation by exactly 2π/3 in
the (E₁, E₂) plane and fixes n₁. Ten parameters: an overall radius, an offset
along the axis, and 3-fold and 6-fold Fourier terms for the radial wobble and
the out-of-plane corrugation.

## 4. The flat-triangle family is provably dead

The tempting first family — Darth Geek's picture lifted into space, four flat
triangles, one in each face plane — cannot work, and it is worth knowing why
before spending a search on it.

**Claim.** Let C₁…C₄ be disjoint *convex planar* closed curves with Cᵢ in the
plane of face Fᵢ, the whole configuration invariant under T with components
permuted as the faces are. Then either some pair is Hopf-linked, or every
component bounds a disk missing the other three. No 3-sublink is Borromean.

*Proof.* The planes of Fᵢ and Fⱼ meet in the line ℓ containing their shared edge
v_k v_l. A convex curve meets a line in two points (generically), so Cᵢ and Cⱼ cut
out intervals Iᵢ, Iⱼ ⊂ ℓ, and two disjoint convex curves in distinct planes are
linked **exactly when those intervals interleave**.

Now the half-turn u ∈ T about the axis through the midpoints of edges v_k v_l and
vᵢ vⱼ is the double transposition (F_k F_l)(Fᵢ Fⱼ): it **swaps Cᵢ and Cⱼ**, and it
maps ℓ to itself as the point reflection in the midpoint m of edge v_k v_l. So
with m as the origin of a coordinate on ℓ, Iᵢ = [a,b] forces Iⱼ = [−b,−a].

Nesting is then impossible. [a,b] ⊆ [−b,−a] needs a+b ≥ 0 and a+b ≤ 0 at once,
so a+b = 0, so Iᵢ = Iⱼ and the two curves meet — excluded. The intervals are
therefore either **interleaved** (the pair is Hopf-linked, so lk = ±1 and no
triple containing it is Borromean) or **disjoint** — in which case Cⱼ meets the
plane of Fᵢ only at two points outside Iᵢ, so it misses the disk bounded by Cᵢ,
and Cᵢ splits off. T is transitive on the six edges, so it is all pairs or none. ∎

The Borromean rings from three flat rectangles work precisely because their
intervals are **nested**, cyclically. The symmetry here forbids nesting. That is
the whole obstruction, and it is why every attempt to draw this with flat
triangles on faces comes out either falling apart or clasped.

`scan.mjs` measures it: 132 configurations over radius and twist, and the answer
is **only ever** the 4-component unlink or a configuration with every pairwise
linking number ±1. Nothing in between, which is what the proof predicts.

```
 1.00     30   0.365      0  unlink            2
 1.20     80   0.199      8  other            16     lk = -1,-1,1
 1.60      0   0.208      8  other            ...    lk = -1,1,1
```

**So the components must leave their planes.** That is the whole content of the
retracted claim, restated as something you can act on.

## 5. Finding one

With corrugation allowed, `search.mjs` samples the ten parameters from a seeded
LCG (deterministic, so a hit can be quoted by index) and filters by cost:

| filter | what it rejects | of 24,000 draws |
|---|---|---|
| clearance | strands closer than 0.06 — no link to speak of | 2,743 |
| Gauss linking (`linking.mjs`) | any pair with lk ≠ 0 | 15,847 |
| crossing count | a sublink under 6 crossings, which cannot be Borromean | 61 |
| `knotlib` fingerprint | 3,815 unlinks and 1,503 unreadable projections | 5,318 |
| | **Borromean hits** | **31** |

The Gauss integral is the load-bearing filter and it costs no projection at all
— it is computed straight off the 3D curves and validated against `knotlib` on
the Hopf link (1), Solomon's seal (2) and the Borromean fixture (0,0,0).

Of the 31 hits, **25 survive** re-checking at 120 points per curve; the rest were
aliasing at the search's coarse 48. `refine.mjs` then hill-climbs each for
scale-free clearance and `pick.mjs` ranks the survivors by how far the whole
4-component diagram simplifies, because **legibility is crossing number**.

## 6. What came out

`tetrahedral-4-borromean.knot.json` — four curves, 180 points each, loadable
straight into the editor.

```
symmetry  : exact, |T| = 12, asserted on all four generators
clearance : 0.2543          linking: all six pairs 0 (slop 2e-13)
vertex v1 : projects to 14, simplifies to 6 crossings   BORROMEAN
vertex v2 : projects to 14, simplifies to 6 crossings   BORROMEAN
vertex v3 : projects to 14, simplifies to 6 crossings   BORROMEAN
vertex v4 : projects to 14, simplifies to 6 crossings   BORROMEAN
whole link: projects to 28 crossings
```

Every 3-sublink reduces under R1 and R2 alone to **6 crossings** — the minimal
crossing number of the Borromean rings — with all three linking numbers zero and
the Jones polynomial equal to the Borromean rings', and it does so from all four
vertices. The `borromean` fixture in `knotlib/test` cannot manage that: over
4,000 sampled directions its three mutually perpendicular ellipses never project
to fewer than 8.

Views: `view-3fold.svg` (down a 3-fold axis, where the symmetry is plainest),
`view-2fold.svg`, `view-generic.svg`, `sublink-borromean.svg` (one component
dropped), `pair-unlinked.svg`.

**The picture is busy, and mostly that is honest rather than sloppy.** Each of
the six pairs of components has to weave through two different Borromean triples,
which puts a floor of roughly 24 crossings on any diagram of this link; the one
here is 28. It is not a picture that becomes the Valknut with enough tidying.

## 7. Straight edges, and a model you can build

The rings can be replaced by closed **polygons** — straight edges, sharp corners
— without changing the link. That makes the weave quicker to read by eye, and it
makes a physical model possible.

This is not a rendering option. Thinning a ring to a few straight edges *moves
the strand*, and a strand that moves far enough cuts through its neighbour. So
every polygon below is its own link until checked, and is re-verified against
`knotlib` from scratch.

**The symmetry stays free, for the same reason as §3.** Ring A repeats every 60
of its 180 points under R, so a polygon is built by thinning that one third down
to `m` corners and regenerating: arc, R(arc), R²(arc) gives ring A, and the three
half-turns give B, C and D. *Any* subset of the arc therefore yields an exactly
T-symmetric link. Corner count is the only thing being searched.

**Six corners per ring is the minimum, and the minimum is achieved.** The count
must be a multiple of 3 or the ring cannot carry R at all, so the only smaller
option is 3 — and a 3-corner ring is a flat triangle, planar and convex, which
is the case §4 rules out. (§4 is written for rings lying *in* the face planes; a
3-corner ring sits in a plane parallel to one, and the argument carries over
unchanged, since the two planes still meet in a line and the half-turn still
reverses it.) A sweep of 20 offsets confirms it: no 3-corner arrangement works.

| corners/ring | distinct corners | closest approach | verified |
|---|---|---|---|
| smooth (180 pts) | — | 0.252 | yes |
| 6 | 2 | 0.109 | yes |
| 9 | 3 | 0.152 | yes |
| 24 | 8 | 0.203 | yes |

**Closest approach** is the smallest distance between any two strands, measured
edge-to-edge rather than vertex-to-vertex — with long straight edges those are
very different numbers, and only the first one means anything. The link is about
2.5 units across, so it is the margin a paper model has before two pieces
collide.

Thinning alone left the coarse ones too tight to build (0.038 at 6 corners), so
`optimise-polygon.mjs` widens the gap. **The step bound is the point.** If the
closest approach is currently `c` and no corner moves more than `c/2`, then no
point of any edge moves further either, so two strands that were `c` apart stay
more than 0 apart: nothing can pass through anything, and the link type is
preserved *by construction* rather than by re-checking and hoping. It is
re-checked anyway. That took 6 corners from 0.038 to 0.109 and 9 from 0.039 to
0.152. The one guard the bound does not give you is a spike — two adjacent edges
folding flat against each other, which is degenerate for `project()` without
ever being a crossing — so turn angle and minimum edge length are constrained
separately.

**The cutting list.** A closed polygon in space is fixed, up to rigid motion, by
three numbers per corner: the edge length leaving it, the turn angle through it,
and the torsion — how far the next edge rotates out of the plane of the previous
two. `recipe.mjs` emits them. Because each ring is 3-fold symmetric only `m/3`
rows are distinct, and all four rings are congruent, so the 6-corner model's
entire specification is two rows built twelve times:

| corner | edge | turn | torsion |
|---|---|---|---|
| 1 | 1.209 | 124.7° | +113.1° |
| 2 | 1.063 | 90.6° | −99.4° |

## 8. The gap

What is proved: the four sublinks are 3-component links with all linking numbers
zero, 6-crossing diagrams, and the Borromean rings' Jones polynomial. Since the
Borromean rings are the only Brunnian 3-component link with 6 crossings, that
settles it — **given the link table**, which this repo does not yet ship.

What is *not* in hand is a self-contained certificate: an explicit Reidemeister
sequence carrying each sublink onto the standard 6-crossing Borromean diagram,
checked with `canonical()`. Two things block it, both already named in the
project's own documents:

1. **There is no 6-crossing Borromean diagram in the repo to compare against.**
   The ellipse fixture bottoms out at 8, and `simplify()` cannot get it lower
   because the obstruction is an R3 away.
2. **`simplify()` is R1/R2 only** (`knotlib/diagram.md` §7 — R3 is detected but
   not applied), and all four reduced diagrams stall with eight available R3
   moves and nothing else.

So the fingerprint agreement is, in `knotlib`'s own words, a smoke detector
rather than a proof. It is a strong one — the Jones polynomials agree to the
last coefficient across four independent projections of four different sublinks
— but it is not the same thing.

## 9. What would close it, and what else this wants from the repo

Nothing here was blocked. Everything above runs on `knotlib` as shipped plus
about 400 lines in this directory. But four things would make it better, and
three of them are already on the roadmap:

- **R3 in `moves.js`** (plan step 1's leftover). Closes §8 outright: the reduced
  diagrams stall on R3 and nothing else.
- **`relax.js`** (plan step 3). `relaxsym.mjs` here is a stand-in and a weak one
  — it descends on length-over-clearance in the symmetric subspace and on the
  chosen configuration it moves nothing, having started at a local minimum. The
  symmetric case is *easier* than the general one, incidentally, and might be
  worth building first: the state is a single arc of 60 points, the symmetry is
  exact by construction, and no step can break it. That is a good test bed for
  the energy before it meets an arbitrary hand-drawn curve.
- **The link table + `identify`** (plan step 4). Turns "the fingerprint matches
  the Borromean fixture" into "this is L6a4", and lets the 28-crossing whole
  link be named instead of merely measured.
- **Milnor invariants** are not in `invariants.js` and this problem is the case
  for them: μ(ijk) is what "Borromean" actually *means* here, it is cheap for a
  link with vanishing linking numbers, and §2 shows it is the invariant that
  decides whether a symmetry is allowed before any search happens.

## 10. Two roughnesses found in `knotlib`

Both are worked around locally in `lib.mjs`; neither is fixed here, because
nothing in this directory should reach into `knotlib`.

1. **`choose()` dies on a direction that `project()` accepted.** `project()`
   runs five genericity checks, but a direction can pass all five and still
   build a diagram that fails the Euler check in the `Diagram` constructor —
   *"12 crossings in 1 piece(s) need 14 faces, traced 12"*. That arrives as a
   bare `Error`, `choose()` only catches `DegenerateProjection`, and the whole
   direction search dies on one bad sample. It hits roughly 1 in 300 of these
   corrugated curves. The reading is that there is a sixth failure mode which is
   not spelled as a sixth check; the fix is probably to catch it in `choose()`
   and count it as another unusable direction.
2. **`fingerprint()` should simplify first.** The Kauffman bracket refuses above
   16 crossings, and these curves routinely project to 16 or 17 — where R1 and
   R2 alone take them to 6. Running `simplify()` before `jones()` is free
   correctness, since neither move changes the link, and it turned four "cannot
   compute" answers here into four clean ones.

## 11. The files

| file | what |
|---|---|
| `tetra.mjs` | the tetrahedron, the group, the equivariant seed, `checkSymmetry` |
| `linking.mjs` | Gauss linking straight off the curves — the fast reject |
| `lib.mjs` | tolerant projection, fingerprints, the Borromean reference |
| `scan.mjs` | the flat-triangle sweep of §4 |
| `search.mjs` | the seeded random search of §5 |
| `refine.mjs`, `pick.mjs`, `best.mjs`, `polish.mjs` | hill-climb and rank |
| `relaxsym.mjs` | equivariant ropelength descent — the `relax.js` stand-in |
| `verify.mjs`, `reduce.mjs` | the checks of §6 and §8 |
| `render.mjs`, `final.mjs` | the SVGs and the scene file |
| `polygon.mjs` | thinning, and edge-to-edge clearance |
| `search-polygon.mjs` | the corner-count sweep of §7 |
| `optimise-polygon.mjs` | the bounded-step widening of §7 |
| `recipe.mjs` | edge length, turn angle and torsion — the cutting list |
| `artifact-data.mjs` | what the published page is built from |
| `test.mjs` | the whole claim, as one falsifiable run |

`node test.mjs` re-derives the verdict from the shipped curves in a few seconds.

---

**Interactive view:** <https://claude.ai/code/artifact/70e63ca5-f85c-4c48-a67e-93bb6957fd57>
— rotate the link, hide any one ring to see the Borromean rings underneath, and
snap to the 3-fold and 2-fold axes. The **Shape** control switches between the
smooth rings and the three verified polygons, with the cutting list beside it.
Built by `link-viewer.html` from `artifact-data.json`, which stores one third of
one ring per shape and regenerates the other eleven twelfths with the same two
group operations used here.
