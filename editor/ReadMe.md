# Knot Editor

Paint, but for knots in 3D space. See `plan.md` for the design.

```sh
cd editor && npm install && npm run dev   # then open http://localhost:5173
npm test                                  # unit tests + Firefox end-to-end run
```

## Analysing what you've drawn

Press **K**, or the **Analyze** button in the bottom right. The panel reads the
scene as a knot diagram: crossings, components, faces, writhe, linking numbers,
the Jones polynomial, whether the knot differs from its mirror, and which
Reidemeister moves are available — with the reason when one is not.

It reads it **from the view you are looking at**, because a crossing is a
property of a projection and not of a curve, so orbiting can change the numbers.
Some views have no diagram at all: a ring seen exactly edge-on is a straight
line. **Clearest view** searches for a good one instead.

- **Print 2D projection** saves that view as an SVG in the usual notation, with
  the strand that goes underneath **broken** at each crossing, on the editor's
  own page colour and in the strands' own colours.
- **Import a diagram…** reads such a picture back — any background colour, and
  components may share a colour. It refuses rather than guesses when the picture
  does not say which strand is under.

Design notes and the measured limits are in [`analyze.md`](analyze.md).

### From the command line

The same numbers, without opening the app:

```sh
npm run analyse -- ~/Downloads/knot-2026-08-27-1432.knot.json
npm run analyse -- trefoil                       # any shipped library shape
npm run analyse -- hopf-link --direction 0,1,0   # ask for one specific view
```

It prints the projection it chose, the diagram it read off, the faces, the
writhe, the linking numbers, the Jones polynomial, whether the knot differs from
its mirror, and which Reidemeister moves are available — with the reason when
one is not:

```
diagram     3 crossing(s), 1 component(s)
faces       2, 2, 2, 3, 3  (must be 3 + 2 per piece — checked on construction)
writhe      -3   [regular isotopy only — a kink changes it]
Jones       A^4 +A^12 -A^16       (in A; V(t) has t = A⁻⁴)
chirality   differs from its mirror — chiral
R2          3 face(s), 0 available — a clasp — the strands alternate over and under
R3          2 face(s), 0 available — no strand is entirely over the other two
```

`tools/analyse.mjs` lives here rather than in `knotlib/` deliberately:
`.knot.json` is this app's format, so parsing it is this app's business. The
dependency runs one way and knotlib stays ignorant that a drawing program
exists.

Two views of the same curve can disagree about the crossings and both be right —
that is what the `--direction` flag is for. Some views have no diagram at all
(a ring seen exactly edge-on), and those are refused rather than guessed at.

## Repo layout

```
editor/
├── src/          the app. analyze.js · diagram2d.js · trace.js are the new three
├── test/         node tests, plus smoke.mjs and browsers.mjs in a real browser
├── tools/        build scripts: library.mjs, analyse.mjs
├── plan.md       what is built and what is next
├── smoothen.md   the smoothing dial
├── io.md         saving, loading, the shape library
└── analyze.md    the panel, the printer and the tracer
```

`../knotlib` is a sibling, not a child: the editor imports it, and it does not
know a screen exists.
