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
     ├─ id, name, color, closed?
     ├─ controlPoints: Vec3[]     # the editable truth
     └─ (derived) polyline: Vec3[], tube mesh
```

Everything downstream — PD codes, invariants, AI import/export — is a function of
`controlPoints`. Keep it plain, serializable, and version-stamped from day one.

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
- **Invariants**: crossing number bounds, writhe, linking number, Alexander,
  Jones / Kauffman bracket, HOMFLY, knot group presentation.
- **Moves**: Reidemeister I/II/III as first-class operations, both on the diagram and
  as animated deformations of the 3D curve.
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

Candidate tool surface (each one usable by hand *and* by the agent):

- `scene.add_curve(points, {closed, color, name})` / `remove` / `list`
- `scene.transform(id, matrix)`, `scene.set_points(id, points)`
- `library.load(name)` — "trefoil", "8_19", "Whitehead link"
- `analyze.project(camera) -> PD code`
- `analyze.invariant(id, which)`
- `moves.reidemeister(kind, at)`
- `relax(id, steps)` — energy minimization

Open questions to revisit, not answer now:

- Where does the agent live — in-browser (WASM / API calls from the page) or a local
  Python service? Level (c) leans Python (SnapPy, numpy); level (a) is JS. Likely a
  thin local server bridging the two.
- Undo/redo semantics when an agent makes a 40-step edit: one undo entry or forty?
- Does the agent see the canvas (screenshots) or only the data? Probably both.
- Provenance: every curve should record whether a human or an agent last touched it.

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
