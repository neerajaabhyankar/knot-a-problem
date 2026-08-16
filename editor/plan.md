# Level (a) — the Editor

Paint, but for knots in 3D space. Browser app, curves only.

See `ReadMe.md` for how to run it.

## Milestone 0 — **done**

> Launch a browser app, **draw** a Hopf link by hand, view it in 3D interactively.

Verified end-to-end in Firefox: two freehand strokes on perpendicular draw planes
give two linked tubes with Gauss linking number −1, and a pen-lifted trefoil comes
out as an embedded curve with all three crossings decided by the lifts. Screenshots
land in `test/out/`.

Since then: multi-stroke drawing with pen lifts, undo/redo, an eraser, endpoint
extension, and straight lines.

Still not done: presets, save/load, dragging control points, projections, surfaces,
mobile/touch.

## Files

```
index.html              toolbar, shortcut hints, help, confirm dialog
src/main.js             glue: the live strand, pointer handling, undo, render loop
src/viewer.js           three.js — camera, lights, draw plane, handles, tube meshes
src/model.js            Scene / Curve — the data model levels (b) and (c) will read
src/crossings.js        one stroke + what's on screen → depth (the lift)
src/eraser.js           rub-to-erase, splitting strands into surviving runs
src/simplify.js         screen-space polyline maths (dedupe, RDP, loop closing)
test/crossings.test.mjs unit tests for the lift — no browser needed
test/smoke.mjs          Playwright/Firefox end-to-end check
design-drawing.md       the drawing flow, written down
```

## Decisions made

| Question | Answer |
|---|---|
| Creation | **Draw-only, from scratch.** No preset library. You make the Hopf link yourself. |
| Stroke input | **Freehand drag**, then resample/simplify to ~20 control points, fit a spline. |
| Camera vs drawing | **Plotly-style turntable.** Left-drag orbits, right-drag pans, scroll zooms — always. Select is home; Draw takes the left button until the strand is finished. |
| Aesthetic | **Dark studio, solid.** Near-black background, matte tubes, soft shadows, muted palette. Glossy tubes read as cheap plastic, so metalness is 0 and the environment reflection is kept faint. |

## Stack

- **Vite** dev server + build. Zero config, instant reload.
- **three.js** for rendering. `TubeGeometry` over a `CatmullRomCurve3`.
- **Vanilla JS/TS + plain DOM toolbar.** No React yet — the app is one canvas and five
  buttons. Revisit if the UI grows a properties panel, layer list, chat pane.
- Tested in **Firefox and Safari**. Never Chrome.

## The central problem: 2D mouse → 3D curve

A mouse gives 2 degrees of freedom; a space curve needs 3. The rule:

> **A stroke is drawn on the plane parallel to the screen, passing through the
> orbit target.** Orbit the camera to change which plane you draw on.

Consequences:

- A stroke without self-crossings is **planar**. Depth comes from drawing on
  different planes, from self-crossings (below), or later from dragging points.
- The draw plane must be **visible** — a faint translucent quad / grid so you know
  where in space your ink is landing. Without this the app feels like guesswork.
- **How this actually makes a Hopf link:**
  1. Draw loop A — a circle in the screen plane, centered near the target.
  2. Orbit ~90°. The draw plane is now perpendicular to loop A; loop A appears
     edge-on as a line segment with two visible ends.
  3. Draw loop B as a small circle **off-center**, encircling *one* end of that
     segment (i.e. one of the two points where A pierces the new draw plane).
  4. That is a Hopf link. Orbit back to confirm the crossings.

  Loop B being off-center is essential. If both loops are centered on the target
  they intersect instead of linking. Edge-on, loop A reads as a line, so aiming
  at one side of it is enough — there is deliberately no marker for this.

## Lifting a flat drawing into a knot

Draw a self-crossing curve and it can't stay flat — flat, the strands genuinely
intersect, which is not a knot. So crossings are detected and the strands pushed
apart in depth.

**Which strand goes under? You decide, by lifting the pen.** Lift the pen across
a crossing and the gap is bridged by an arc that dips under. That's the
convention every hand-drawn knot diagram uses, so the tool never has to guess
what you meant. Draw is therefore *not* a one-shot tool: it stays armed across
pen lifts until a stroke ends near the strand's start, which closes it (or Enter
finishes it open). The closing gap is a break like any other, so a trefoil is
three breaks — three strokes, or one stroke with the pen lifted three times.

**How far apart?** A fixed clearance, `4 × tube radius` centre-to-centre — the
strands clear each other by one full strand thickness. Deliberately *not* scaled
to how big you drew: a knot diagram is flat apart from a small hop at each
crossing, and the hop should read the same at any size or zoom.

**Crossings you didn't break** (both passes drawn pen-down): the strand drawn
*later* goes over, the way ink drawn later sits on top of ink already on the
page. This rule always applies, so every crossing is always decided and the
tubes never intersect — there is no ambiguous case and nothing is guessed.

The consequence is worth writing down: resolving every crossing by traversal
order gives a *descending* diagram, and those are always the unknot however
tangled the picture looks. So a shape drawn without a single pen lift is a valid
curve but a trivial one. That is the honest answer — breaks are what make a
knot — and the status line says how many crossings fell through to the default.

**One stroke at a time.** A finished stroke's depth is never recomputed: each new
stroke is lifted against whatever is already on screen — this strand and every
other curve — and appended. Geometry is immutable, which is what lets you grab
a handle on an old strand and keep drawing from any camera angle. Guarded so
that two strands already a separation apart in depth are left alone, or drawing
near an existing link would break it rather than draw it.

Not yet done: **flipping an individual crossing after the fact**. Pen lifts cover
it while drawing; afterwards you erase back to it and redraw.

## Data model

The one thing that must not be sloppy, because levels (b) and (c) build on it.

```js
Curve = {
  id: string,
  name: string,
  color: string,
  closed: boolean,
  points: [x, y, z][],   // control points — the editable truth
}
Scene = { version: 1, curves: Curve[] }
```

Rendered geometry (spline samples, tube mesh) is **derived**, never stored.
`points` is the only state; everything redraws from it.

## Pipeline for one stroke

```
pointerdown/move/up in Draw mode
  → screen-space polyline  [(px, py), ...]
  → drop points closer than N px apart          (input denoise)
  → RDP-simplify each stroke to ~20 pts         (control points)
  → splice strokes together, marking pen-up gaps as bridges
  → close the loop if the last stroke ends at the start
  → decide over/under, insert points near crossings,
    assign depth                                 (the lift)
  → unproject each onto the draw plane           (2D → 3D)
  → new Curve pushed to Scene
  → CatmullRomCurve3 → TubeGeometry → mesh
```

Depth is added by sliding a point **along its own view ray**, not along the
camera axis, so the lifted curve still projects onto exactly the pixels you drew.

## Controls

Camera-first, like Plotly 3D or a map. You are never in a mode that stops you
looking around.

```
left-drag     orbit (turntable)      ← always, unless a stroke tool is armed
right-drag    pan                    ← always
⇧ left-drag   pan                    ← in Select; trackpads hate right-drag
scroll        zoom, toward cursor    ← always
click         select   (⇧ click extends the selection)
F             frame everything

D             draw — stays armed until the strand is finished
⇧ while drawing   straight line
Enter         finish the strand open
E             eraser · [ ] size · only touches the selection
A             select all
Del           delete selection — asks first if more than one
⌘Z / ⇧⌘Z     undo / redo
Esc           cancel / back to Select
```

Select is the resting state. Right-drag panning means the context menu must be
suppressed on the canvas.

**The draw-plane grid is anchored in the world, not to the screen centre.** The
plane still passes through the orbit target, but the visible grid lines are slid
by the pan offset so they stay put in space. Glued to the screen centre they
don't move when you pan, which makes panning look broken.

## Erasing

The eraser only touches strands you have **selected** — so you can rub inside a
tangle without shaving everything around it. Rubbing deletes the samples you
touched; the surviving runs each become a curve. A loop with a bite out of it is
an open arc; an arc rubbed in the middle splits in two.

The dense sample is snapshotted once when the drag starts and every update
re-derives from that snapshot, so repeated dabs don't slowly degrade the curve
through repeated simplification.

## Extending and joining

Select an open strand and its ends get grab handles. Dragging one continues the
same curve from that end; bringing it round to the other end ties the strand into
a loop. Grabbing a handle has to beat OrbitControls to the pointer event, which
is done with a capture-phase listener on the window.

## Undo

Snapshot-based, not a command stack: the model is small and wholly serializable,
so `record()` pushes a deep copy before every mutation. Ids are preserved on
restore, so selections survive.

## Look and feel

- Background: near-black, ground plane fogged out so there's no bright horizon.
- Tubes: `MeshStandardMaterial`, **metalness 0**, roughness 0.62, environment
  reflection at 0.16. Solid colour with a soft falloff. Higher metalness plus a
  strong env map gives a specular sweep that reads as cheap plastic.
- Palette: muted, slightly desaturated. Saturated neon on black is the other
  half of the plastic look.
- Lighting: broad neutral ambient + one key with soft shadows. Coloured rim
  lights tint the strands and fight the palette.
- Chrome: minimal. Vertical rail on the left, shortcut hints beneath it.

## Risks / things I expect to bite

- **Depth is genuinely hard to see** on a still frame. Mitigations: shadows on a ground
  plane, and the fact that orbiting resolves ambiguity instantly.
- **Depth accumulates across strokes.** Rule 2 puts each new stroke a separation
  above what it crosses, so a long descending spiral staircases toward the
  camera. Alternating diagrams bounce between two levels and don't drift.
- **No way to flip a crossing after drawing it.** Pen lifts are the only control,
  so fixing a mistake means redrawing the strand.
- **Extending a strand is a single stroke** — no pen lifts while extending, so a
  continuation can't be told to pass under.
- **Safari + WebGL2** quirks; check early, keep the render path boring.
- **Closing a loop** by proximity is a heuristic and will misfire. Give an explicit
  "close curve" affordance later.

## Next (do not start these yet)

- **Pen lifts across other strands**, not just self-crossings.
- **Click a crossing to flip it** after the fact.
- Save / load — the `Scene` JSON above, plus import of standard knot formats.
- Drag control points; points move in the screen plane, depth preserved.
- Insert / delete points on an existing curve.
- Projection views: snap camera to a nice minimal-crossing projection; 2D diagram mode.
- Coloring, naming, per-component visibility.
- Relaxation / energy minimization to clean up hand-drawn strands.
