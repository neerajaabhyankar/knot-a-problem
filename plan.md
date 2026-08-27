# knot-a-problem — overall plan

> Status: **level (a) is built and shipped** (`editor/plan.md`). The first two
> steps of the plan below are built and tested: `knotlib/` (design in
> `knotlib/diagram.md`, vocabulary in `knotlib/glossary.md`) and the editor's
> **Analyze** panel, which prints a projection as a knot diagram and reads one
> back (`editor/analyze.md`). The rest of
> levels (b) and (c) below is a worked plan rather than a sketch — the data types,
> the tool calls, the build order and the definition of Done are all named. What
> is *not* committed is any of it being right; the parts most likely to move are
> flagged under Risks and Open questions.

## The three levels

| Level | Name | One-line goal |
|---|---|---|
| **(a)** | **Editor** | Paint, but for knots in 3D. Draw / edit / view curves in space, in a browser. |
| **(b)** | **Knowledge** | AI-assisted: import known knots, ask questions, classify, name things. |
| **(c)** | **Computation** | Real knot theory: invariants, simplification, proofs, open-ended problems. |

Levels are layered, not sequential silos, and the plan below proves it: importing
a diagram is level (b), but it produces an unpresentable pancake without the
energy descent that lives in level (c). So (c) starts in the middle of (b). What
they share is the data model, and getting that right is the main thing that
makes both of them cheap.

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

## Agentic harness

The editor exposes a **tool surface**, and an agent drives it the same way a
user's mouse does. Nothing the agent can do is something the UI can't, and
nothing the UI can do is something the agent can't.

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

What (b) and (c) add to it is tabulated under level (b) below. The shape of the
harness does not change — only the namespaces do.

## The missing middle

Today there are two representations and they sit very far apart: `Curve[]`, a
list of points in ℝ³, and a name like `3₁`. Almost everything levels (b) and (c)
want to do passes through a third — the **diagram**.

```js
Diagram = {
  n:     number,       // crossings
  pair:  Int32Array,   // 4n half-edges — the planar structure, and the truth
  over:  Uint8Array,   // one bit per crossing
  loops: number,       // components with no crossings at all
}
```

**Built — see `knotlib/diagram.md` for the design and `knotlib/glossary.md` for
any word above that isn't obvious.** Two things moved from the sketch that stood
here before. PD codes are *derived*, not primary, because they cannot express a
crossing-free circle and do not give you faces — and faces are where the
Reidemeister moves live. And the planar coordinates are not on the type at all;
they come back from `project()` alongside the diagram, because they belong to
the projection that produced them rather than to the combinatorics.

Four operations connect the three representations, and between them they are
most of (b) and (c):

| | from | to | who needs it | state |
|---|---|---|---|---|
| `project` | space curve | diagram | the 2D view; every invariant | **built** |
| `embed` | diagram | space curve | image import, table import, "make me 8₁₉" | **built** for a picture; needs `relax.js` to look right |
| `identify` | diagram | name + invariants | "what is this?" | invariants built, table not |
| `realize` | name | diagram | table lookup, the codes half of the library | not started |

**`embed` half exists already, by accident.** `src/crossings.js` takes a flat
polyline with pen-lift gaps and lifts it into a 3D curve — that *is*
diagram → space curve, for the case where the diagram was drawn with a mouse.
And the pen-lift gap it keys on is exactly the printed break convention. A knot
plate scanned out of a book is the same input arriving from a different device.
This is the largest piece of luck in the current design and it should be
protected: keep `crossings.js` free of anything mouse-specific.

`project` is the direction that needs care. **A crossing is a property of a
projection, not of a curve** — there is nothing to point at until a direction
has been chosen, and not every direction works: a Hopf link of two perpendicular
circles, viewed down the axis of one, projects that component to a line segment,
and no crossings are defined at all. So
`project` **chooses** a direction before it reads anything, checks the choice is
generic (no two crossings coincident, no tangency, no vertex seen end-on), and
jitters and retries if it is not. The direction it settled on is returned with
the diagram, because a diagram without its direction is not reproducible.

---

## Level (b) — Knowledge

Give the editor a memory and a mouth. Concretely: get knots *in* from
representations other than the mouse, answer questions about them, and let that
happen in English.

### The tool surface it adds

Same rule as level (a): **nothing the agent can do is something the UI can't,
and vice versa.** Every call below is listed with the affordance that has to
exist beside it — that pairing is the acceptance criterion, not a nicety.

| call | what it does | its UI half |
|---|---|---|
| ✅ `analyze.run()` | space curve → `Diagram` + every invariant | the **Analyze** panel |
| ✅ `analyze.print()` | the projection, as a printed diagram | **Print 2D projection** |
| ✅ `analyze.importImage(file)` | a picture of a diagram → curves | **Import a diagram…** |
| `analyze.codes(id)` | PD / Gauss / DT / braid word as text | a panel you can copy out of |
| `analyze.invariants(id, which?)` | writhe, linking number, Alexander, Jones | the same panel |
| `analyze.identify(id)` | `{ names[], confidence, ruled_out[] }` | **What is this?** button |
| `import.code(text)` | Gauss/DT/PD/braid → curves | paste box |
| `import.name('8_19')` | table → curves | the existing library picker, second tab |
| `moves.relax(id, opts)` | energy descent to a clean embedding | **Relax** button, dialled like Smoothen |
| `moves.reidemeister(kind, at)` | one isotopy, animated | click a crossing or a bigon |
| `agent.ask(text)` | routes to the above, explains the result | the chat pane |

`import.*` and `analyze.*` are level (b); `moves.*` is level (c) surfaced here
because (b) cannot produce a presentable 3D knot without it — see the note on
ordering below.

### The rule the chat pane lives under

**The model never does mathematics.** It selects, calls, and explains. If an
answer contains a claim about a knot, that claim came out of a tool, and the
answer says which one. This is testable and should be tested: assert that every
mathematical assertion in a reply matches the tool output it cites, and that the
system prompt contains no knot theory for the model to recall instead.

The corollary is that `identify` must be allowed to say **"not in the table"**
and **"these two, and no polynomial I have distinguishes them"**. A confident
wrong name is worse than no name in a tool that is meant to teach.

---

## Level (c) — Computation

The mathematics, as a library of deterministic functions. Same discipline as
`smooth.js` and `io.js`: **pure JS, no DOM, no three.js, tested in node.**

- **`project.js`** — generic-direction choice, crossing extraction, PD code.
- **`invariants.js`** — writhe, linking number, Alexander (a determinant),
  Kauffman bracket → Jones, HOMFLY if it earns its place.
- **`relax.js`** — ropelength / Möbius-energy descent. Not new work from zero:
  `smooth.js`'s `shove()` is already contact repulsion with a rigid/local split
  and wholesale rollback. Relaxation is that plus a shortening term, run to
  convergence instead of dosed by a dial.
- **`moves.js`** — Reidemeister I/II/III on the diagram, and as animated
  isotopies of the 3D curve. These do **not** change the knot type; a crossing
  change is the unknotting operation and is a different animal.
- **`table/`** — knots and links up to 12 crossings, with an invariant
  fingerprint each, **generated offline and committed as JSON**. Exactly the
  pattern `tools/library.mjs` already established for shapes, at a larger scale,
  validated the same way by a test that reloads what shipped.

### Where the compute runs

The editor is a static site on GitHub Pages. That constraint is load-bearing —
it is why there is no server today and why deployment is one push. So:

1. **Identification is a lookup, not a computation.** Anything a person draws by
   hand is under 12 crossings. Bake the table offline in Python (SnapPy, regina,
   whatever is best) and ship JSON. No runtime dependency on either.
2. **Cheap invariants run in JS, live.** Writhe and linking are sums. Alexander
   is a determinant. Kauffman bracket is 2ⁿ states — fine to 16-ish crossings,
   and it can say "too big" above that instead of hanging.
3. **A Python service is a development escape hatch, not a runtime dependency.**
   If something genuinely needs SnapPy at runtime, that is the moment to decide
   it is worth losing the static deploy for. Not before.
4. **The LLM key is the user's.** A static site cannot hold a secret. The chat
   pane asks for a key and keeps it in `localStorage`; a proxy is a later
   convenience, not a prerequisite.

---

## Done

Falsifiable, or it does not count. The project's habit is to measure rather than
eyeball, and these are written so a test can fail.

### The 2×2 the whole thing turns on

Both directions, for knots **and** links:

| | knot | link |
|---|---|---|
| **3D → 2D** | camera → generic direction → PD code → drawn diagram that matches what you saw | same, plus each component keeps its colour and the linking numbers agree with the 3D curve's |
| **2D → 3D** | traced/typed diagram → lift → relax → a knot you can orbit | same, plus components stay separate — no accidental joins, no accidental splits |

### The acceptance tests

1. **Table round trip, no human.** For every knot in the shipped table up to 9
   crossings: `import.name(k)` → curve → `analyze.project()` → `identify()`
   returns `k`. One test, and it exercises `realize`, `embed`, `relax`,
   `project` and `identify` at once. Done = all of them, or a written list of
   the ones that fail and why.
2. **Clearance survives the round trip.** Every curve produced by `embed` +
   `relax` keeps tubes ≥ 2R apart, the same bar the shipped library is held to.
   A knot that passes through itself is not a knot.
3. **The Wikipedia plate.** Feed
   `File:Knot_table.svg` to `import.image`. Every panel traces, lifts, relaxes
   and identifies to the knot it is labelled with. Score is reported as N/35,
   not as a vibe. Done = all of them, or a stated and understood failure list.
4. **Draw and ask.** Draw a trefoil freehand, press **What is this?**, get
   `3₁` — *and* the honest chirality answer, since the mirror is a different
   knot and Jones can tell them apart.
5. **Moves preserve type.** After any `moves.reidemeister` or any amount of
   `moves.relax`, the invariant fingerprint is unchanged. Asserted, every time,
   in the test.
6. **Messy in, clean out.** A deliberately tangled hand-drawn trefoil relaxes to
   a 3-crossing projection without changing knot type.
7. **The model did no maths.** Every mathematical claim in a chat reply traces
   to a tool call; the prompt contains no knot theory.
8. **Nothing reaches through.** No level (b) or (c) code touches
   `knot.internals`. Wanting to means the surface is missing something, and the
   fix goes there.
9. **Parity still holds.** The rail-walk test in `smoke.mjs` §10 covers every
   new control, and every new call has a control.
10. **Still one push to deploy.** Whatever gets added, `git push` still builds,
    tests and publishes a static site.

---

## Order of work

The levels are layered, not sequential, and the dependency that proves it is
this: **2D → 3D is not presentable without relaxation**, and relaxation is
level (c). So (c) starts early, in the middle of (b).

| step | what | why now | user-visible after |
|---|---|---|---|
| 1 | ✅ `knotlib/` — diagram type, projection, invariants, R-moves | the bridge everything crosses | the **Analyze** panel's numbers |
| 2 | ✅ the diagram, printed — plus **import** (tier 1, raster) arriving early because it was nearly free | a printed break and a pen lift mean the same thing, so the tracer reuses the drawing lift | **Print 2D projection**, **Import a diagram** |
| 3 | `relax.js` — **now the blocker** | an imported diagram lifts into a pancake, and where crossings crowd together the depths cancel and strands touch | **Relax** dial |
| 4 | table generation + `identify` | lookup, not computation | **What is this?** |
| 5 | codes in (`import.code`, `import.name`) | steps 3 and 4 make the output presentable | paste box; library gains 250 knots |
| 6 | ~~SVG trace~~ — done as raster tracing in step 2; the remaining tier is a *photograph* | | |
| 7 | chat pane over the tool schemas | last, because it is a thin layer over 1–6 | the mouth |

Tracing is deliberately tiered, because it is the flakiest thing on the list and
the tiers are wildly different problems:

- **Tier 0 — vector.** The Wikipedia knot table *is* an SVG, so its strands are
  already paths and there is no computer vision at all. **Unverified
  assumption, and the first thing to check before committing to this tier:**
  that the breaks at under-crossings are real gaps between subpaths rather than
  a white stroke painted over a continuous path. If it is the latter, tier 0
  becomes "read the paths, then work out the paint order", which is still far
  easier than tier 1 but is not free. This is the tier Done asks for.
- **Tier 1 — clean raster.** A scanned plate. Skeletonise, find endpoints,
  pair them across gaps. Real work, but bounded.
- **Tier 2 — a photograph of actual string.** The ReadMe's stretch goal.
  A different project wearing this project's clothes; do not let it in early.

---

## Risks

- **Tracing is the flakiest link**, which is why it is last and tiered.
- **Minimal-crossing projection is a search**, not a formula. Sample directions,
  keep the best; accept "good" rather than proving "minimal".
- **Kauffman bracket is exponential.** It must refuse loudly above its limit
  rather than hang the tab.
- **The table bounds identification.** Above 12 crossings the honest answer is
  "not in the table", and the UI has to be able to say that without looking broken.
- **Degenerate projections are the normal case, not the edge case** — a
  hand-drawn link is full of near-tangencies. The genericity check and retry is
  core machinery, not a guard clause.
- **A chat pane invites the model to answer from memory.** It will be right
  often enough to be dangerous. Test 7 exists for that reason.

---

## Repo layout

```
knot-a-problem/
├── ReadMe.md
├── plan.md              ← this file
├── editor/              ← level (a): the browser app
│   ├── plan.md
│   ├── src/             (owns Curve[], the tool surface, rendering)
│   └── tools/library.mjs
├── knotlib/             ← level (c): pure JS, no DOM, tested in node
│   ├── diagram.md  glossary.md      (the design, and the words)
│   ├── diagram.js  project.js  invariants.js  moves.js  laurent.js
│   ├── relax.js         (next)
│   ├── table/           (generated, committed — later)
│   └── tools/table.mjs  (the offline generator; Python allowed here)
├── agent/               ← level (b): tool schemas, tracing, the chat pane
│   ├── tools.json       (one schema per knot.* call)
│   └── trace/           (tier 0 first)
└── old-mnist-expts/     ← unrelated, archived
```

`knotlib` is a sibling of `editor`, not a child, and it imports nothing from it.
The dependency runs one way: `editor` may import `knotlib`; `knotlib` may not
know that a screen exists. That is what keeps its tests runnable in node, which
is what has made `smooth.js` and `io.js` cheap to trust.

---

## Open questions, still open

- **Does the diagram get to be editable?** Dragging an arc in the 2D view and
  having the 3D curve follow is the natural next thought after step 2, and it is
  the same unsolved problem as `smoothen.md` §8 — curve editing — wearing a
  different hat. Probably they should be solved together, or not at all.
- **Does the agent see the canvas?** Screenshots would help it discuss what the
  user is looking at, and cost nothing mathematically since it does no maths.
  Probably yes, but only after the tool half works blind.
- **What is a link's name?** Knots have Rolfsen numbers; link tables are messier
  and the notation is less settled. Decide before shipping `identify` for links,
  not after.
