# Saving and loading — design

> Whatever you draw can be saved, opened again, and look exactly the same. The
> same door loads the shipped shapes — triangle, Hopf link, trefoil, figure-8 —
> because they are ordinary saved files.

**Built.** `src/io.js` is the pure half, `tools/library.mjs` generates the
shapes, `test/io.test.mjs` covers both, and `test/smoke.mjs` §8 drives the whole
thing through a browser.

---

## 1. What it has to do

1. **Round-trip a drawing exactly.** Geometry, colour, thickness, open/closed,
   and the crossings — which live in the geometry, so they come for free.
2. **Load the shipped library through the same code path** as a user's file. If
   the library needs a special loader, the format is wrong.
3. **Stay readable and diffable.** This is a maths tool; being able to open the
   file, see numbers, and hand-edit one is worth real money.
4. **Cost nothing at runtime.** No server, no CDN, no new dependency. The app
   currently depends on three.js and nothing else, and that is worth keeping.
5. **Leave a seam for level (b).** The top-level plan puts Rolfsen tables, DT/PD
   codes and braid words in level (b). This module must not pre-empt that, and
   must not make it awkward.

## 2. Every format considered

The question is really two questions — *what is the native save format* and
*what should we be able to hand to other software* — and they have different
answers, which is why several rows below are "export, not save".

| Option | What it actually is | Round-trips a drawing? | Verdict |
|---|---|---|---|
| **Scene JSON, our own** | the `Scene` model, version-stamped | **exactly** — it *is* the model | **native format** |
| **Geomview VECT** (`.vect`) | plain text: polyline vertex counts (negative = closed) then points then per-polyline RGBA | geometry, colour, open/closed — but no tube radius, no names, no camera | **export.** The lingua franca of knot-tightening tools (ridgerunner, octrope, KnotPlot), so it is the one format that buys real interoperability *in this field* |
| **Wavefront OBJ** (`l` elements) | `v` vertices plus `l` polyline elements — yes, OBJ does polylines, not just faces | geometry only | **export.** Opens in essentially everything |
| **PLY** | vertex/face lists; edges exist but are a second-class citizen | poorly | rejected — OBJ does the same job with better support |
| **STL** | unstructured triangle soup, no colour, no grouping | no — it would store the *tube*, and a tube cannot be turned back into a centre-line | rejected as a save format |
| **glTF / 3MF** | modern mesh transport; glTF does have a `LINE_STRIP` mode | could carry the curve | rejected — the entire cost of a mesh format (buffers, accessors, materials) to store three numbers a point |
| **three.js `Object3D.toJSON`** | the obvious "use the library you already have" answer | no — it serialises the *mesh*, and it is coupled to the three.js version, so a dependency bump could orphan your files | rejected, and worth naming because it looks tempting |
| **vedo / VTK PolyData** (`.vtp`) | vedo is a Python wrapper over VTK; VTK PolyData genuinely does store polylines | in principle | rejected — vedo is a *renderer*, not a format, and this is a browser app: nothing in JS reads VTK. Reconsider only if level (c) turns out to be Python and wants a shared on-disk format |
| **SVG** | 2D vector graphics | no — it throws away depth, which is the entire subject | rejected as a save format (fine later as a *picture* export) |
| **CSV** | rows of numbers | no way to express several curves each with attributes | rejected |
| **PD / DT / Gauss codes, braid words** | combinatorial descriptions of a *diagram* | **no geometry whatsoever** — they say which knot, never where it is | **level (b).** Turning one into coordinates needs an embedder, which is a project |
| **KnotPlot native** | KnotPlot's own on-disk format | niche and thinly documented | rejected |
| **SnapPy triangulations** | the knot *complement*, as a triangulated manifold | wrong abstraction — it is not a curve at all | rejected |

**The conclusion is unglamorous and correct: our own JSON.** The model is
already plain, serializable and version-stamped — that was a deliberate choice
back in `model.js` — so the native format is that object written to a file. Every
alternative either loses something we need or costs a dependency to store an
array of triples.

## 3. The file

`something.knot.json` — a double extension, so editors syntax-highlight it and
nobody has to guess what is inside.

```json
{
  "format": "knot-a-problem/scene",
  "version": 1,
  "saved": "2026-08-20T14:02:11Z",
  "camera": { "position": [x, y, z], "target": [x, y, z] },
  "curves": [
    {
      "name": "curve 1",
      "color": "#d2d24b",
      "radius": 0.075,
      "closed": true,
      "points": [[x, y, z], ...]
    }
  ]
}
```

Decisions worth stating:

- **`format` and `version` are the first two keys.** A dropped file that lacks
  them gets a clear refusal instead of a stack trace, and `version` is the hook
  for migrating when the model grows.
- **Ids are not saved.** They are session-local and would only cause collisions
  on insert. Loading mints fresh ids through `Scene.addCurve`, which keeps
  `nextId` monotone for free.
- **Coordinates round to 5 decimal places.** Measured on a smoothed 240-point
  curve: **14.1 KB at full double precision, 6.2 KB at 5 dp** (4 dp saves only a
  further 0.7 KB, so it is not worth the accuracy). Worst-case error is 5e-6
  world units against a minimum gap of 0.225 — **45,000× below anything that can
  matter**. The round-trip is therefore exact to 1e-5, *not* bit-exact — but it
  is **stable**, verified: save, load, save again and the two files are byte
  identical, because the second save rounds numbers that are already round.
- **Colours are stored as hex, not palette indices**, so a file survives us
  changing the palette. On load they are validated against `#rrggbb` and fall
  back to a palette colour if not — an unvalidated colour string reaching
  `THREE.Color` is exactly how every strand once rendered white.
- **`radius` is per-curve and always written.** It is part of "looks the same",
  and it is what the crossing clearance was computed against.

## 4. Loading: always insert, placed clear, then pan

Opening a file and loading a library shape do the same thing: **insert**. One
rule, and it is the one that lets you build a link out of pieces.

The problem with always-insert is that things land on top of each other, so:

- **Placement.** Take the bounding box of what is already in the scene and the
  bounding box of what is arriving, and offset the new shape along the
  **camera's right vector** until the two boxes clear each other, plus a gap of
  about a quarter of the incoming shape's size. Along the camera's right, not
  the world's, so it always lands *beside* what you are looking at rather than
  behind it.
- **The camera follows.** Ease the orbit target onto the new shape's centre over
  ~1.2 s, and ease the camera distance in the same move only if the new shape
  would not otherwise fit the viewport. Pure panning is what was asked for, but
  loading a big scene into a zoomed-in view would otherwise leave you staring at
  nothing.
- **One undo step**, and the newly inserted curves end up selected, so Smooth,
  Delete or a recolour act on what just arrived.

**Empty scene is the special case.** If nothing is on screen, there is nothing to
place clear of, so the file loads at its saved coordinates *and its saved camera
is restored exactly*. That is what makes "open a file and it looks exactly the
same" literally true in the case where you care most. Insert into a non-empty
scene ignores the stored camera, because we are panning instead.

**Known consequence, accepted:** opening your own file twice gives you two
copies. That is the cost of one rule instead of two. It is at least obvious —
the copy lands beside the original and the camera pans to it — and it is one ⌘Z
away.

## 5. Saving

An explicit **Save** writes a download. No autosave, no localStorage, no
share-links — deliberately, so there is exactly one place your work lives and it
is a file you own.

**It asks first**, from the button as well as the shortcut. ⌘S is easy to hit by
accident and the answer is a file on your disk, and one command should not mean
two different things depending on how you reached it. The dialogue says how many
curves and how big, so it reads as a receipt rather than a speed bump.

Worth writing down as the accepted cost: **a refresh loses everything.** For a
browser app with no server that is a real papercut, and localStorage is the
usual answer. It is not being built; if it starts to hurt, the fix is small and
this module is where it goes.

`⌘S` must `preventDefault` or the browser offers to save the page instead.

## 6. The library

Built shapes are **generated from parametric formulas at build time** into the
same `.knot.json` files a user would save. A script — `tools/library.mjs` —
writes `src/library/*.knot.json` plus an `index.json` of names and titles.

Shipping list, all of which have exact parametrisations:

| | |
|---|---|
| polygons | triangle, square, pentagon (an `n`-gon generator) |
| unknot | circle |
| knots | trefoil (2,3-torus), figure-8, cinquefoil 5₁ (2,5-torus), and torus knots generally |
| links | Hopf link, Solomon's seal (2,4-torus link), Borromean rings (three mutually perpendicular ellipses) |

Why generate rather than hand-draw them: exact, tiny, revisable, and a
parametric knot is genuinely embedded in 3-space rather than being a flat
diagram with hops — so it loads as a proper 3D knot with no crossing to resolve.

**The build script validates what it emits**, which is the real reason to do
this at build time rather than at runtime:

- no two non-adjacent stretches of any curve closer than `2 × radius`, or the
  tube self-intersects — the same test `smooth.test.mjs` already uses;
- every shape normalised to a comparable size, so a trefoil and a triangle
  arrive at the same scale;
- `closed` correct, point counts sane.

**Delivery is by dynamic `import()`**, so Vite code-splits each shape into its
own chunk and the bundle does not grow by 70 KB for shapes you never open. No
network configuration, no CDN, consistent with how the fonts are handled.

Anything without a nice parametrisation — an arbitrary Rolfsen entry like 8₁₉ —
is **level (b)'s** job: ship the DT/PD code and embed it with the relaxation
engine. `smooth.js` already has most of what an embedder needs. The seam is
clean because level (b) only has to produce `points` and hand them to the same
loader.

## 7. Export

One-way doors, for taking a knot to other software. Neither is a save format —
both lose the radius and the camera, and OBJ loses colour too.

- **OBJ** — `v` per point, one `l` element per curve with the first index
  repeated at the end for a closed loop, `o` to name each. ~25 lines.
- **VECT** — Geomview's, and what the knot-tightening tools actually eat. Header,
  per-polyline vertex counts with **negative meaning closed**, then all points,
  then per-polyline RGBA. ~30 lines.

Both are pure string-building with no dependency, which is the only reason they
are worth having in level (a) at all.

## 8. Module boundary

`src/io.js` is **pure serialisation**. No DOM, no three.js, no `Scene`. In and
out are plain objects and strings, so it is unit-testable in node like
`crossings.js` and `smooth.js`.

```js
serialize(curves, camera)   →  object          // ready for JSON.stringify
parse(text)                 →  { curves, camera }   // validated, or throws a readable error
placement(existing, incoming, right)  →  [dx, dy, dz]
toOBJ(curves)               →  string
toVECT(curves)              →  string
```

`main.js` keeps the impure half — the file picker, the download anchor, the
drag-and-drop listener, `record()` / `refresh()` — and `viewer.js` gains the
camera easing and supplies the right-vector. Same split as smoothing: the maths
is testable without a browser, the wiring is thin.

**Untrusted input is a real concern**, because a dropped file is arbitrary JSON
from anywhere. `parse` validates rather than trusts: the format tag, finite
numbers, array shapes, a point-count ceiling, and colour strings matched against
`#rrggbb` before they can reach `THREE.Color`. It never evaluates anything.

## 9. What got built

All of it, in this order:

1. `src/io.js` + `test/io.test.mjs` — 46 checks: round-trip, malformed input,
   placement, export. No browser.
2. Open / Save, drag-and-drop anywhere on the window, `⌘O` / `⌘S`.
3. Placement and the camera glide (`viewer.easeTo`).
4. `tools/library.mjs` — eleven shapes, generated and validated.
5. OBJ and VECT export, behind the square beside Save.
6. `test/smoke.mjs` §8 — draw, save, wipe, load back, compare every control
   point; then insert a Hopf link and check it lands clear and the view follows.

**Measured end to end**, in a browser, on a hand-drawn loop: worst control-point
drift after save → clear → load is **4.9e-6 world units**, colour, thickness and
closedness identical, and the saved view restored.

### Two things measurement changed

- **The library validator caught the triangle**, reporting its corners as a
  self-intersection at 0.133 against a 0.150 tube diameter. They aren't: a
  polygon's corner is a place where the strand genuinely doubles back, and an
  *index*-based exclusion window reads that as two passes meeting. Measuring the
  window in **arclength** instead — the same fix the smoothing guard needed, for
  the same reason — clears it at 2.7 R. Two points at arclength `s` either side
  of a 60° corner sit exactly `s` apart, so the window has to be ~2.5× the
  clearance being tested.
- **The Hopf link arrived edge-on.** Two circles in perpendicular planes have no
  axis-aligned view where both read as rings — one is always exactly a straight
  line. Shapes are now stored already turned a few degrees off-axis, and the
  Borromean rings are stored looking down the diagonal, which is the only view
  where all three read as rings.

## 10. Open questions — answered

- **Where do Open / Save / Library live in the rail?** → The library is a
  picker, which also gave export a home: a `⋯` square beside Save. The rail
  gained `overflow-y: auto` so a short window can never put a button out of
  reach.
- **Should a library shape adopt the current draw colour?** → No, it keeps the
  colour it was generated with, so a link's components stay distinguishable.
- **Provenance?** → In from the start: `"by": "human"` on a save,
  `"by": "library"` on a generated shape.

## 11. Known limits

- **A refresh loses everything.** No autosave, by choice. Save before you close
  the tab; the help panel says so.
- **Opening your own file twice gives you two copies**, since loading always
  inserts. The copy lands beside the original and the view pans to it, so it is
  at least obvious, and it is one ⌘Z away.
- **Export is one-way.** OBJ and VECT can be written but not read; both drop the
  tube radius, and OBJ drops colour too.
- **The library only covers shapes with a known parametrisation.** Anything
  else — an arbitrary Rolfsen entry — needs a code plus an embedder, which is
  level (b).
- **Borromean-ness is not fully verified** by the build. It checks pairwise
  linking numbers are 0 and no two rings touch, which is necessary but not
  sufficient; the construction is standard and the result was checked by eye.

- **Where do Open / Save / Library live in the rail?** It is getting long. A
  fourth group, or fold the library into a picker that also lists recent files?
  --> fold the library into a picker
- **Should a library shape adopt the current draw colour**, or keep the colour
  it was generated with? Keeping it makes a Hopf link's two components
  distinguishable, which argues for keeping. --> Keep the color generated with.
- **Does a saved file record provenance** — human or agent? The top-level plan
  raises it as an open question for level (b). Adding a field now is cheap;
  adding it later is a version bump. --> okay.
