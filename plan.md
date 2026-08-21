# knot-a-problem — overall plan

> Status: **pencil sketch.** This is an initial guess at structure, not a commitment.
> Only Level (a) is being built right now. See `editor/plan.md` for that.

## The three levels

| Level | Name | One-line goal |
|---|---|---|
| **(a)** | **Editor** | Paint, but for knots in 3D. Draw / edit / view curves in space, in a browser. |
| **(b)** | **Knowledge** | AI-assisted: import known knots, ask questions, classify, name things. |
| **(c)** | **Computation** | Real knot theory: invariants, simplification, proofs, open-ended problems. |

Levels are layered, not sequential silos — (b) and (c) both read and write the same
curve/diagram data structures that (a) owns. Getting that data model right in (a) is
the main thing that makes (b) and (c) cheap later.

---

## Level (a) — Editor

Browser app. Curves only (no surfaces yet). Draw closed loops and open arcs with the
mouse, view and rotate them in 3D, edit them, save/load.

Detail lives in **`editor/plan.md`**. Current milestone: draw two loops by hand that
form a Hopf link, and orbit around it.

The thing (a) must get right for everyone else: **the data model.**

```
Scene
 └─ Curve[]            # one strand
     ├─ id, name, color, radius, closed, by
     ├─ points: Vec3[]            # the editable truth
     └─ (derived) polyline: Vec3[], tube mesh
```

Everything downstream — PD codes, invariants, AI import/export — is a function of
`points`. Keep it plain, serializable, and version-stamped from day one.

> The field is **`points`**, not `controlPoints`. This document said the latter
> for a while and the code always said the former; the code wins, because the
> name is now public — it is in the `.knot.json` format, which is shipped, and in
> eleven library files. Renaming would cost a format version bump and a migration
> for no gain. `by` records who last touched the curve.

## Level (b) — Knowledge

Give the editor a memory and a mouth.

- **Import**: parse standard sources into `Curve[]` — Rolfsen / Thistlethwaite tables,
  KnotPlot / SnapPy formats, Gauss codes, DT codes, PD codes, braid words.
- **Recognize**: "what is this?" → compute a cheap invariant fingerprint, look it up
  in a local table, answer with a name and confidence.
- **Converse**: a chat pane beside the canvas. Natural language in, editor actions
  and answers out. "Make me a trefoil." "Is this the unknot?" "Color the components."
- **Vision (stretch)**: photo of a real knot → skeleton curve. Diagram → stylized image.

Rough shape: the LLM never guesses at math. It routes to tools (Level c), and
explains the results.

## Level (c) — Computation

The actual mathematics, as a library of deterministic tools.

- **Projection → diagram**: 3D curve → planar diagram with signed crossings (PD code).
  This is the bridge between (a) and everything combinatorial.

  > **A crossing is a property of a projection, not of a curve.** There is no
  > crossing to point at until a direction has been chosen, and not every
  > direction works: a Hopf link made of two perpendicular circles, viewed down
  > the axis of one, projects that component to a line segment — degenerate, no
  > crossings defined. So this step really has two parts: *pick a generic
  > projection direction*, then read off the diagram. Any UI that talks about
  > "the crossings" is quietly assuming the first part has already happened.
- **Invariants**: crossing number bounds, writhe, linking number, Alexander,
  Jones / Kauffman bracket, HOMFLY, knot group presentation.
- **Moves**: Reidemeister I/II/III as first-class operations, both on the diagram and
  as animated deformations of the 3D curve. Note that these are *isotopies* —
  they do not change the knot type. A **crossing change** is a different animal
  entirely: it is the unknotting operation, and it does change topology.
- **Simplification**: energy-based untangling (Möbius energy / ropelength gradient
  descent) so a messy hand-drawn loop relaxes into a clean form.
- **Questions**: unknot detection, chirality, splittability, component analysis.

Prefer existing engines where they exist (SnapPy, KnotJob, regina) over reimplementing;
wrap them behind a stable tool interface.

---

## Agentic harness (sketch)

The idea: the editor exposes a **tool surface**, and an agent drives it the same way a
user's mouse does. Nothing the agent can do is something the UI can't.

```
   ┌────────────┐    natural language     ┌───────────┐
   │   User     │ ──────────────────────▶ │   Agent   │
   └────────────┘                         └─────┬─────┘
         │ mouse                                │ tool calls
         ▼                                      ▼
   ┌──────────────────────────────────────────────────┐
   │  Editor core  (Scene, Curve[], history/undo)     │  ← single source of truth
   └───────┬──────────────────────────────────┬───────┘
           │ render                           │ compute
           ▼                                  ▼
      three.js view                    knot-theory tools (c)
```

**The level (a) half of this is built.** `globalThis.knot` is a deliberate,
namespaced surface rather than the grab-bag it started as, and the rule is
enforced by a test that walks the rail and checks every control has a call
behind it:

```
knot.scene    list get add update remove clear toJSON load
knot.select   get set add all none
knot.tool     get set settings          # draw colour/thickness, eraser size
knot.edit     smooth
knot.history  undo redo begin commit rollback canUndo canRedo
knot.view     frameAll get set moveTo
knot.library  list load
knot.file     save export
```

`knot.internals` holds `model` and `viewer`. Tests and the devtools console use
them; **level (b) reaching for them is a sign the surface above is missing
something**, and the fix is to add it there rather than to reach through.

Still to come, from levels (b) and (c):

- `analyze.project(camera) -> PD code` — needs a *choice of generic projection*
  first; see the note under Level (c)
- `analyze.invariant(id, which)`
- `moves.reidemeister(kind, at)`
- `library.load('8_19')` — the codes half, which needs an embedder

Open questions to revisit, not answer now:

- Where does the agent live — in-browser (WASM / API calls from the page) or a local
  Python service? Level (c) leans Python (SnapPy, numpy); level (a) is JS. Likely a
  thin local server bridging the two.
- ~~Undo/redo semantics when an agent makes a 40-step edit: one undo entry or
  forty?~~ **Answered: one, and the agent says so.** `knot.history.begin()` /
  `.commit()` group any number of edits into a single undo step, with
  `.rollback()` to abandon a half-finished batch. The UI uses the same
  primitive.
- Does the agent see the canvas (screenshots) or only the data? Probably both.
- ~~Provenance: every curve should record whether a human or an agent last
  touched it.~~ **Done:** `Curve.by` is `'human'`, `'agent'` or `'library'`, set
  on creation and updated on every edit, and it round-trips through the file.

## Repo layout (guess)

```
knot-a-problem/
├── ReadMe.md
├── plan.md              ← this file
├── editor/              ← level (a): the browser app
│   └── plan.md
├── knotlib/             ← level (c): computation, probably Python (later)
├── agent/               ← level (b): tool definitions + harness (later)
└── old-mnist-expts/     ← unrelated, archived
```
