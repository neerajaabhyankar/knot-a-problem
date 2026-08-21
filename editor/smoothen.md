# Smoothing — design

> Select a strand, press **Smooth**, and the kinks go away. Its dial stays
> open: turn it up and the corners round off, keep going and you get a circle,
> turn it back to 0 and you have the strand exactly as you drew it.

The whole feature is one idea: **run the heat equation along the strand.**
Everything the user asked for falls out of that one idea at different doses, and
the knot survives because of one extra rule bolted on the side.

---

## 1. Why one operation covers all the cases

The user framed two seemingly different wishes:

| wish | what it means |
|---|---|
| kinky triangle → clean triangle | erase the hand jitter, keep the corners |
| clean triangle → rounded → circle | erase the corners too |

These look like two modes. They are not. They are **two doses of the same
thing**.

Smoothing a curve by repeatedly averaging each point with its neighbours is the
discrete heat equation. Its defining property is that it is a **low-pass filter
in arclength**: write the strand as a Fourier series around its own length, and
a mode that repeats `k` times per loop decays as

```
        exp(−4 k² a²)                    a = the dose, in units of "fraction of the loop"
```

The `k²` is the entire feature. Decay is *quadratic* in frequency, so scales
separate hard and fast:

| dose `a` | hand tremor (k≈40) | corner harmonics (k≈10) | triangle-ness (k=3) |
|---|---|---|---|
| 2 % | 1e-3 left | 84 % kept | 99 % kept |
| 6 % | 1e-10 left | 24 % kept | 87 % kept |
| 15 % | gone | 1 % kept | 51 % kept |
| 40 % | gone | 0 | 2 % kept — a circle |

So "denoise but keep corners" and "round the corners off" are the same button at
`a = 0.02` and `a = 0.15`. There is no mode switch to build, and no
corner-detection threshold to tune — which is the usual way this feature gets
complicated (bilateral filters, curvature thresholds, feature angles). We don't
need any of it.

**The dose is the only parameter.** It is expressed as a fraction of the
strand's own length, so it is scale-free: the same 6 % cleans a strand drawn
small and one drawn across the whole screen, and it means the same thing after
you zoom.

An open strand pinned at both ends is measured against **two** laps rather than
one, because mirroring it end to end is what makes its longest feature periodic.
Without that correction the same dose would be four times weaker on an arc than
on a loop, and "flatten this into a straight line" would be off the end of the
slider instead of sitting at 100 %. `test/smooth.test.mjs` measures an arc
relaxing to 34.3 of its original 100 units of bulge against a predicted 36.8, so
the two really are the same law.

Because diffusion times add, pressing the button twice at 6 % is the same as
pressing it once at ~8.5 % (`a` combines in quadrature). That is why a *second*
press is still meaningful when the dial is already at the top — but it is not
how you find the amount you want. See §6.

## 2. Why the knot doesn't come undone

Heat flow on a knotted space curve is a shrinking flow. Left alone it will
happily pull a strand straight **through** another one and hand back an unknot.
That would be catastrophic — an hour-old trefoil must still be a trefoil.

The fix is a hard geometric guard, not a heuristic:

> Before each round of diffusion, measure for every point `i` how far it is from
> the nearest bit of strand it is **not** continuous with — any other curve, or a
> stretch of its own more than `1.6 × minGap` away **along the strand**. Call
> that `d_i`. That point is then allowed to move at most
> `0.45 × (min(d_{i-1}, d_i, d_{i+1}) − minGap)` during the round.

Two strands approaching each other can therefore close at most `0.9` of the
slack between them, so the gap can never reach `minGap`. Nothing passes through
anything, ever, and this is a proof rather than a hope: the clamp is on
*cumulative* displacement from the round's starting position, so it holds
continuously through the round, not just at its end.

Two details earn their keep. **Continuity is measured in arclength, not in
point indices**, so the window means the same thing at any resolution: 1.6 ×
`minGap` is wide enough that an honest bend never trips the guard (a bend of
radius `minGap` still spans 1.36 × `minGap` across that much arclength) and
narrow enough to stay inside the shortest hairpin that could touch itself, which
needs about 2 ×. And **a point is limited by its neighbours' slack as well as
its own**, because moving a point moves the two segments either side of it —
without that, a point with room drags a frozen neighbour's segment inward and
spends clearance the guard thought it was holding. Both were measured: the
neighbour term alone is the difference between a trefoil's tightest crossing
holding at 0.189–0.191 across six presses and wandering down to 0.184.

A deformation of a curve that never lets it touch itself or another curve is an
ambient isotopy. **The knot and link type are preserved by construction.** Which
crossing is over and which is under is preserved too — so smoothing never needs
to re-run the crossing lift, and it doesn't. Consistent with the rest of the
editor: geometry, once drawn, is only ever moved by tiny safe amounts, never
re-derived from pixels.

The visible consequence is nice: **the knot smooths where it is loose and holds
where it is tight.** Rub a trefoil with a big dose and the three arcs go clean
and round while the crossings stay put, because that is the only shape it can
reach without untying. That is the correct answer and it looks like one.

### What `minGap` costs

The crossing hop itself is a short-wavelength feature — diffusion wants to erase
it like any other. The guard is what stops it, so `minGap` decides how much a
crossing is allowed to flatten. Strands are drawn `4 × radius` apart
(centre-to-centre); tubes touch at `2 × radius`. We use **`3 × radius`**: a full
half-radius of daylight left between the tube surfaces, so a smoothed crossing
still reads as a crossing, while leaving the flow enough room that it isn't
frozen solid the moment it meets a crossing.

## 3. Shrinkage

Pure heat flow collapses a closed curve to a point. Two standard fixes:

- **Taubin λ|μ** — alternate a positive and a slightly larger negative step.
  Non-shrinking and elegant, but it is *designed* to preserve low frequencies,
  so a triangle stays a triangle forever. It cannot reach the circle end of the
  slider, which is half of what was asked for. Rejected.
- **Renormalise** — flow freely, then rescale about the centroid to restore the
  size. Spans the whole range. **Chosen.**

"Size" is the RMS distance of the points from their centroid, restored after
every round. Perimeter would have been the other candidate, but a wobbly circle
has more perimeter than the clean circle inside it, so preserving perimeter
would visibly *inflate* things as they smooth. RMS radius barely moves under
denoising and is identical for a triangle and the circle it becomes, which is
what "same size" should mean here. The centroid needs no correction: diffusion
on a closed loop preserves it exactly.

**Open strands are not renormalised, and their two endpoints are pinned.** That
is the whole story for open curves — the ends are where you continue drawing
from, and the handles must not wander. Pinned ends also give a free, correct
answer to "make this a straight line": an open arc under heat flow with fixed
ends converges to the chord between them.

## 4. Resolution, and why the cost is constant

The working resolution is tied to the dose:

```
n = clamp(round(10 / a), 48, 240)     points, uniformly spaced in arclength
```

Ten samples across the smallest feature we intend to *keep*. Anything finer is
about to be destroyed anyway, so carrying it is waste.

The payoff is that the step count comes out flat. Stability needs `λ ≤ 0.5` per
step, we use `0.25`, and the number of steps to reach dose `a` is
`0.405 · a² · n²` — with `n = 10/a` that is **~41 steps regardless of the
dose**. Big doses run on a coarse strand, small doses on a fine one, and both
cost the same. (At the clamps it drifts: ~9 steps at the fine end, ~930 at the
coarse end, still nothing.)

**Those points are the output.** The obvious next move is to decimate them —
`rdp3` will happily take a smoothed circle down to sixteen control points — and
it was in here until it was measured. It has to go, because RDP chords across
the curve and at a crossing it shaves up to its tolerance off *each* of the two
passes. Worse, the guard can only check the control polygon, while what the user
sees is the Catmull-Rom spline through it, which bulges outside the polygon by
more the sparser the points get. So the check passes and the tubes still close
in. Six presses on a trefoil walked the tightest crossing from 0.189 down to
0.145 — past 0.150, where the tubes touch. Without decimation the same six
presses hold it at 0.189–0.191. Dense uniform points make the polygon and the
spline the same thing, which is the only reason the guard's promise reaches the
geometry anyone looks at. Cheaper control points are not worth clearance.

## 5. Module boundary

`src/smooth.js` is **pure polyline maths**. No three.js, no DOM, no viewer, no
model. In, an array of `[x, y, z]`; out, an array of `[x, y, z]`. Unit-testable
in node like `crossings.js`, and it imports nothing at all.

```js
smooth(points, {
  closed,      // does it loop
  amount,      // the dose, 0..1 — features below this fraction of the length go
  obstacles,   // other strands, as dense polylines: things not to touch
  minGap,      // closest two strand centre-lines may come; 0 turns the guard off
})  →  { points, blocked }
```

`blocked` counts points the guard held back — i.e. how much of the strand the
knot itself refused to let move. The status line uses it to say so out loud
instead of leaving the user wondering why one bit stayed crooked.

`main.js` owns the two impure halves, which is where they belong:

- **in** — turn each model curve into a dense world-space polyline with
  `sampleCurve()`, so smoothing starts from the *spline the user is actually
  looking at* rather than from its sparse control polygon. Without this a
  near-zero dose would still visibly tighten the shape.
- **out** — `record()`, write `points`, `refresh()`.

Curves are smoothed **one at a time**, each seeing the others in their current
state. Sequential is simpler than simultaneous and just as safe.

## 6. The control

Smooth acts on the selection, so it is a **command**, not a mode — it lives with
Delete, not with Select/Draw/Erase, and it is disabled when nothing is
selected. It carries one settings square, the same one Draw and Erase carry,
holding the one slider. Nothing new to learn: *button plus its own square* is
already the rail's vocabulary.

```
  ≈ Smooth   [◦]        M          amount 0…40 %, default 6 %
```

### It is a dial, not a ratchet

This is the part worth getting right, and the first version got it wrong. That
version made you set the amount *before* pressing, and every press stacked on
the one before. Both halves are bad. You cannot pick a number for a thing you
have not seen yet, and once presses accumulate there is no way back except
counting your undos.

So:

> **Pressing Smooth remembers how the selected strands looked**, applies the
> current amount, and leaves the square open. **Moving the slider recomputes
> from that memory** — never from the last result. Where the slider points is
> the entire answer; how it got there is not part of it.

Three properties follow, and `test/smoke.mjs` asserts all three on a hand-drawn
trefoil by comparing every control point exactly, not to a tolerance:

- **Idempotent.** Wander the dial through 1 %, 40 %, 12 %, 5 % and back to 30 %
  and you get the same 48 points as going straight to 30 %.
- **Reversible.** Slide to 0 and the strand is bit-for-bit the one you drew —
  the same 104 control points, not a smoothed approximation of them.
- **One undo.** The press and every adjustment after it are a single history
  step, because `record()` runs once, when the session opens.

A session ends when you touch anything else — pick a different strand, change
tool, undo, or make any other recorded edit. Pressing Smooth again then starts a
fresh session from where you left off, which is how you go past 40 % if you want
to.

The square is **not** disabled along with the button. It sets what the command
will do, the way the eraser's square does — not a property of the selection, so
there is no reason to make you select something before you can look at it.

Dragging fires continuously, so recomputation is coalesced to one per frame with
`requestAnimationFrame`, the same way the eraser coalesces tube rebuilds.

### Alternatives considered

- **A mode switch (Denoise / Round / Circle).** Three buttons for three points
  on one axis. §1 is the argument against.
- **No parameter at all, just repeat-to-taste.** A fixed dose is either too
  timid to round a polygon in a sane number of clicks or too brutal to denoise.
- **Preview geometry with a commit/cancel path.** The usual way to build a live
  adjustment, and unnecessary here: the model is small and wholly serializable,
  so re-deriving from a remembered baseline *is* the preview, and undo is the
  cancel.

### Why 6 %

That is where measurement puts the knee: on a hand-drawn triangle it removes
2.68 of the 2.80 units of tremor that were put in, while leaving cornerness at
0.205 against the ideal 0.224. `test/smooth.test.mjs` asserts both, so the claim
stays honest if the constants ever move. It matters less than it would have
under the first design — it is now only where the dial *starts*.

Getting that measurement right took two goes, and both failures are worth
remembering. The first metric was distance to the ideal triangle — but
smoothing rounds the corners *on purpose*, and that shows up in the same number,
so the test could not tell the feature from the bug. The second compared the
smoothed shaky curve to the smoothed clean one point-to-point, which floors at
the sample spacing: a half-sample phase shift read as 0.73 units of leftover
tremor that was not there. Point-to-*segment* against the same pair reads 0.12.
The fixture had a third problem — white noise carries as much energy at k=1 as
at k=61, and a low-pass filter is *supposed* to keep the k=1 part, so it was
testing the opposite of the claim. The tremor is now two clean tones.

## 6b. Shoving strands apart

Smoothing alone can never take a crossing out, and the reason is worth stating
plainly because it looks like a tuning problem and is not one:

> **The hop at a crossing is the only thing holding the two strands apart.** The
> guard exists to stop them meeting, so it stops the flow dead exactly there.

Measured on a flat triangle with two crossing hops, next to a strand it passes:

| | flatness |
|---|---|
| as drawn | 0.85 R |
| smoothed at 40 % | 0.70 R |
| smoothed at 100 % | 0.69 R — the dial does nothing |
| guard switched off | 0.00 R — the flow would flatten it completely |

So the fix is not a better filter. Something else has to take over the job the
hop is doing, and the only candidate is **distance**: two flat triangles can be
linked like two links of a chain, but only if they sit in different planes.
Nothing in a local smoothing flow can ever discover that motion.

Hence **contact repulsion**, ramped in with the dial (`spread`, `(a/max)²`, so
the bottom of the dial stays honestly local and cheap). It composes with what
was already there — the guard already measures every point's distance to the
nearest strand it isn't continuous with — and it only ever *increases* a
separation, so the knot stays safe.

Three things had to be got right, and each was found by measuring:

1. **The shove must not spend the guard's budget.** That budget rations how fast
   things may *approach*, and a strand sitting at `minGap` has none left — which
   is precisely the strand that needs shoving. Sharing the budget left the
   measured clearance at 3.02 R, unmoved. The shove now has its own allowance
   and is instead re-measured afterwards, rolling the whole round back if it
   walked a point into some third strand. Reverting lands on a state that was
   already safe, so the guarantee stays a proof.
2. **A raw pointwise push makes things worse.** At a crossing the direction to
   get clear *is* the direction of the hop, so pushing along it digs the hop
   deeper — flatness went from 0.73 R to 1.40 R. The push is therefore split:
   the part of it that is a **rigid motion of the whole strand**, a drift plus a
   tilt, is what actually gets one strand out from under another and it costs no
   shape at all, so it goes in at full strength; the residual only bends the
   strand, which is what a knot needs to open itself but is also what digs, so
   it is damped to 15 %. That one change took a press from 1.40 R to 0.77 R.
3. **Separate first, rigidly, before any smoothing.** A drift and a tilt buy the
   room a crossing needs without spending a scrap of the dose.

`main.js` also sweeps the selection up to three times per press when there is
shoving to do, because strands are relaxed one at a time and the first one moves
before the others know about it. Going round again lets it have a second go
against neighbours that have now moved too: 0.65 R after one sweep, 0.14 R after
two, 0.06 R after three. Note that the sweeps **compound** the dose — at the top
of the dial the effect is stronger than the number on it. That is deliberate;
the top of the dial is "settle this", not "erase exactly 40 %".

### What this does and does not deliver

It works: two triangles drawn nearly coplanar and linked only by their hops come
out as two clean, flat, still-linked rings, with the linking number holding at
1.00 and the strands 5.3 R apart.

**But you cannot have flat *and* still a triangle.** Getting the hop out needs
diffusion at the hop's own scale, and by the time there is enough of it the
corners have gone too. That is not a tuning failure — it was measured across the
whole dial, at one, three and twelve sweeps, and at every setting of the local
damping:

| dose | flatness | how much triangle is left |
|---|---|---|
| 8 % | 1.14 R | 69 % |
| 15 % | 0.66 R | 20 % |
| 40 % | 0.06 R | 3 % — a circle |

Cornerness always collapses before flatness arrives. `test/smooth.test.mjs`
asserts both halves of that, so the limitation cannot quietly be claimed away.

The mechanism that *would* separate them is **planarisation**: pull each strand
onto its own best-fit plane, guard-limited. That flattens without smoothing, so
a triangle stays exactly a triangle. It is not built, because it pulls the other
way for a self-crossing knot — a trefoil can never be planar, so planarisation
would squash it toward a flat diagram rather than letting it settle into the 3D
shape it was asked to settle into.

## 7. Known limits

- **A crossing flattens slightly**, down to `3 × radius`, because the hop is
  short-wavelength and the guard is what saves it. Visible only under a heavy
  dose. A strand drawn tighter than that already — the lift places control
  points `4 × radius` apart, but the spline through them passes closer — is
  simply frozen there and left as it is.
- **The guard is conservative near a tight crossing.** `0.45` of the slack per
  round, and there are only so many rounds, so a very tight knot smooths slowly.
  Press again.
- **A hairpin tighter than the self-exclusion window** isn't guarded. Safe in
  practice: diffusion opens hairpins, it never tightens them.
- **Smoothed strands carry more control points than drawn ones** — 48 to 240,
  against the 30-odd a hand stroke simplifies to. That is the price of the
  paragraph above, and it is only paid by strands you actually smooth.
- **Flat and still-a-triangle are not both available.** See §6b.
- **The top of the dial is slow.** A four-strand scene costs about 340 ms per
  slider change at full spread, against 20 ms with one strand — a round is two
  all-pairs distance sweeps, and there are up to sixteen of them per sweep of
  the selection. Obstacles are sampled at 120 points rather than 320 to keep
  that in hand; the guard measures point-to-*segment*, so the coarser polyline
  costs about 0.001 world units of accuracy against a 0.225 minimum gap.
- **Not undoable per-point** — a session is one undo step, all or nothing.
- **The dial only reaches 40 %.** Past that you press again, which starts a new
  session from the current shape and loses the way back to the original in one
  slide. Deliberate: 40 % is already most of the way to a circle, and a slider
  whose useful range is all in its first eighth is a worse slider.

## 8. Curve editing — TODO, not built

The counterpart to this feature: reshape a strand that already exists. Grab a
point on a smoothed circle and pull a corner back out of it — the PowerPoint
yellow diamond, but with real control — and fold a planar loop into a
non-planar one.

What it needs, and what each thing costs:

- **A handle anywhere on the curve, not just at a control point.** Cheap to pick
  (project the click onto the spline), but the edit has to be expressible in
  `points`, so it means inserting one.
- **A per-point sharpness.** Catmull-Rom has one tension for the whole curve, so
  a corner today can only be faked with coincident points. Either carry a
  per-point attribute and switch spline, or accept multiplicity as the encoding.
  Attributes are the bigger change: `points` is currently the entire model, and
  smoothing **rewrites it wholesale at a resolution of its own choosing**, so
  anything per-point has to survive a resample or be re-derived from geometry.
- **Sharpness fights the dial.** A corner you just placed is exactly what a dose
  erases. Needs pinning — sharp points excluded from the flow — which the guard
  can express (allowance 0) but the dose semantics currently cannot.
- **Folding out of plane** needs a depth affordance for the drag, and the guard
  running live during it. That machinery already exists as the shove; the new
  part is only running it inside a pointer-move loop.
- **Session model.** Edits must compose with Smooth's remembered baseline, or
  sliding the dial back would silently undo hand edits made after the press.
