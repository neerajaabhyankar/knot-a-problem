# Analyze — reading the scene, printing it, reading it back

> Status: **built.** `npm test` in this directory runs it; every number below is
> one of its measurements. The design of the mathematics is in
> `../knotlib/diagram.md`; this file is about the three things the editor adds
> on top.

Three pieces, and they are deliberately separable:

| | file | what it is |
|---|---|---|
| **the panel** | `src/analyze.js` | picks a projection, formats the answer, owns some DOM |
| **the printer** | `src/diagram2d.js` | a projection → an SVG in the usual notation. Pure |
| **the tracer** | `src/trace.js` | a picture → closed loops with under-marks. Pure |

Neither of the pure two knows the DOM exists, so both are tested in node like
`smooth.js` and `io.js`. `analyze.js` contains **no knot theory at all** — it
calls knotlib. If a number looks wrong the bug is one directory over, where it
can be found without a browser.

---

## 1. The view is a choice, and the panel makes you make it

A crossing is a property of a projection, not of a curve. So the first thing the
panel asks is which projection, and the default is **the one you are looking
at** — orbit and the numbers can change, which is the point rather than a flaw.
**Clearest view** searches instead and reports how many directions it tried.

### Three ways a view can be bad, and only one of them is about crossings

`choose()` used to minimise crossings and nothing else, and it produced pictures
nobody would draw. Fewest crossings is *not* the same as readable, and on its own
it actively prefers the squashed view — a component seen nearly edge-on has
hardly any crossings precisely because it has hardly any picture.

So knotlib now measures three things, and all three had to be there before the
printed diagrams looked like diagrams:

| | what it catches | measured on the shipped shapes |
|---|---|---|
| `roundness` | a component seen edge-on | Hopf link: 26 of 64 directions rejected |
| `sharpness` | a crossing so shallow no break can be drawn across it | shallowest kept: 0.60 (≈37°) |
| `clearance` | two strands *grazing* — no crossing at all, and no break can help | the figure eight's best-by-crossings view had 0.098, a third of a stroke width |

The last one is the one that is easy to miss, because it is not about crossings
at all. Two strands can run past each other close enough to merge into one blob
of ink without ever crossing. Nothing in the diagram notation fixes that; only a
different direction, or a thinner line, does.

Ordering is: fewest crossings first, then the most readable of those. The
Borromean rings go from an 8-crossing view with one ring edge-on to the
12-crossing symmetric one — more crossings, and the only view where all three
read as rings.

### Nudging

Looking exactly down a trefoil's own axis, its third crossing lands on a shared
*vertex* of the sampled polyline. The intersection test rejects it, the crossing
goes missing, and what comes back is a two-crossing diagram that is not planar.
Euler's formula catches that (see `../knotlib/diagram.md` §6) but the message is
then about face counts rather than about the view.

So `project()` refuses it by name — and the panel turns the camera **0.4°** and
tries again, saying so. Some ways of failing are about the view and some are
only about where the points happened to land:

- *accidental*, and nudged past: a crossing on a vertex, two crossings at one
  point, a strand not running straight through its own crossing
- *about the view*, and reported: strands lying along each other, two strands at
  the same depth (which means the curves genuinely touch in 3D)

## 2. Printing

The picture is the strands **exactly as they project** — not a re-laid-out
abstract diagram — with the strand that goes underneath broken at each crossing.
That break is the whole convention, and it is the same mark the editor's pen lift
makes, which is why an imported diagram and a drawn one arrive through the same
door.

Two things had to be got right beyond "put a gap there":

**The gap depends on the angle.** A strand passing over covers a stretch of
`½ width ÷ sin θ` measured *along* the strand underneath. At 30° that is already
the whole of a fixed 1.5-width break, so the two strands touch, the picture stops
saying anything, and a tracer reading it back finds a junction rather than a gap.
The break is `0.8 + 0.6/sin θ` stroke widths, capped at 4.

**The line thins when the drawing is crowded.** `clearance` is the closest two
strands come anywhere they are not crossing; the stroke has to fit inside that
with room either side. A book does the same thing and nobody notices. Measured:
the trefoil prints at 7.5px where the cinquefoil prints at 8.6px and the
figure-eight at 7.0px, for the same nominal strand thickness.

And one bug worth remembering, because it was invisible in every structural
check: a run of ink that crosses the polyline's **seam** — the arbitrary place
the point list starts — was being drawn from the seam onwards only, silently
dropping the rest. The Hopf link came out as a C and a stub. The test now
measures the drawn arclength against the full arclength: 91% for a one-break
component, 72% for a Borromean ring with four.

The test's real claim is the convention itself: **at every crossing the
under-strand's ink stops on both sides and the over-strand's runs through.**
Checked by counting loose ends rather than measuring distance to ink, because at
a self-crossing the over-pass lies right across the gap.

## 3. Tracing

The trick is that reading a diagram needs no knot theory. A printed diagram
already says which strand goes under: it is the broken one. So the job is only
"find the ink, find the loose ends, work out which end joins which", and what
comes out is a set of closed loops with some stretches marked *under* — **exactly
what a pen stroke with lifts in it produces.** It goes through `liftStroke`, the
same function a mouse gesture does. Rule 1 (a marked stretch dives) decides every
crossing, so rule 2 (the later stroke goes over) never has to guess.

Deliberately colour-blind about structure: a diagram may draw every component in
one colour. Colour is sampled at the end, for looks, and never used to decide
what joins what. Tested: the Hopf link drawn entirely in `#d2d24b` still comes
back as two loops.

The steps, and the one that was not obvious:

1. **Page colour** — the commonest colour round the border, quantised so
   antialiasing does not split one colour into ten. Tested on white, near-black
   and mid-grey pages.
2. **Ink** — anything far enough from the page in RGB. Transparent counts as page.
3. **Thinning** — Zhang–Suen, to a one-pixel skeleton.
4. **Connectivity** — and here is the non-obvious one. Thinning leaves right-angle
   triples: three pixels each touching the other two. Counted naively every one
   of them is a three-way junction and a clean skeleton looks like a hairball —
   **237 false junctions in a two-crossing Hopf link**, measured. A diagonal step
   only counts when neither orthogonal step that would go round it exists.
5. **Pruning** — thinning grows a short spur at every round cap.
6. **Grazes** — where two strands touch, the skeleton grows a little X. Rub the
   junction out and the four branches become loose ends, rejoined by direction.
7. **Pairing** — two ends belong together when they face each other: each one's
   outward heading points at the other, and the two headings oppose. Distance
   alone is not enough; in a busy diagram the nearest loose end is often a
   different strand running past. The heading is measured back along a
   *distance*, not a number of points — the arcs are simplified, so a fixed
   number of points is a few pixels on a wiggly stretch and half the strand on a
   straight one.

### A graze is not a crossing, and telling them apart is the safety property

Step 6 is where this could quietly go wrong. Two strands *grazing* and two
strands *crossing with no break drawn* both leave a four-way junction and look
identical locally — but they mean opposite things. Grazing strands do not cross,
so rejoining them straight through recovers the truth and guesses nothing.
Crossing strands with no break are a picture that does not say which one is on
top, and joining them through would **invent an answer**.

They are told apart by how the four branches sit round the junction. Two strands
that cross leave in alternating order — A, B, A′, B′ — so each branch faces the
one *two* along. Two that merely touch leave as A, B, B′, A′, and each branch
faces its neighbour. So: interleaved → refuse, adjacent → rejoin.

That single check is what makes the contract below true.

## 4. The contract, and what the tests actually claim

**Never silently wrong.** The tracer either gives back the knot that was printed,
or says it could not read the picture. A third outcome — a different knot,
returned confidently — is the only real failure, and it is what the tests hunt
for.

The round trip: print a shape, rasterise the SVG into ordinary pixels at the
stroke width the printer asked for, read it back, lift it through the drawing
pipeline, project it, and compare. The claim is not "the same knot" but **the
same diagram, crossing for crossing** — `canonical()` equality — which is
stronger and orientation-free.

Measured, over the shipped trefoil, figure eight, Hopf link, cinquefoil and
Solomon's seal:

- **4 of 5 read straight back**; the figure eight is refused, and says why.
- **3 of those 4 rebuild into the identical diagram** in 3D.
- Solomon's seal reads correctly and then fails to *lift*: see below.
- A picture that crosses without breaking is refused. Ink the same colour as the
  page is refused. A 2×2 image is refused.

And in the browser, end to end: load a trefoil, print it, paint the SVG into a
canvas, hand the PNG to the file-picker's own code path — one strand arrives,
three crossings, `A^4 +A^12 -A^16` both before and after.

## 5. Known limits

- **A printed diagram has no arrows.** Import a *link* and a component may come
  back running the other way — a different oriented link, with the sign of its
  linking number flipped, however faithful the trace was. That is a property of
  the notation and it is not in the picture to recover. Knots are unaffected.
- **The lift is not relaxation.** Where several crossings sit close together the
  alternating pushes cancel in the middle and two strands can end up at the same
  depth — a genuine self-intersection. Solomon's seal does exactly this. The
  trace was right and the depths were assigned badly; energy relaxation is what
  fixes it, and that is level (c) work.
- **The figure eight's own printed diagram is not readable back.** Its best
  projections have strands grazing closer than a stroke width, and thinning the
  line only goes so far. It is refused rather than guessed at.
- **Only the picture, so far.** The tracer reads a *diagram*: flat, clean,
  strands of even width, breaks at the under-crossings. A photograph of real
  string is a different problem wearing this one's clothes — see the tiers in the
  top-level `plan.md`.
