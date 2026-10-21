# Himalayan Peaks — two of Robert Lang's woven polyhedra, as editor scenes

```
gasherbrum.knot.json    four intersecting triangles, tetrahedral symmetry
makalu.knot.json        six intersecting pentagons, icosahedral symmetry
```

Open either in the editor. They are **polygons, not splines**: every curve
carries `"straight": true`, so the corners stay corners (see *Sharp corners*
below).

- Gasherbrum: <https://origami.kosmulski.org/instructions/gasherbrum-robert-lang>
- Makalu: <https://origami.kosmulski.org/instructions/makalu-robert-lang>

Both are from Lang's *polypolyhedra* — frames of congruent regular polygons
woven through one another, one frame per axis of a symmetry group. That is
exactly a link of polygonal rings, which is why they drop straight into a knot
editor.

## How they are built, and why there is nothing to tune

`node build.mjs` writes both files. The construction is the same trick the
`four-borromean` directory uses: **make one polygon and let the group make the
rest.** If the one you build is carried to itself by the rotations that fix its
own axis, the whole orbit is symmetric by construction, at every parameter
value, because there is nowhere for the symmetry to leak out.

What is left to choose is small, and in Makalu's case nothing at all:

| | Gasherbrum | Makalu |
|---|---|---|
| frames | 4 triangles | 6 pentagons |
| group | tetrahedral, 12 rotations | icosahedral, 60 rotations |
| units in the paper model | 12 | 30 |
| free parameters | twist | **none** |
| chosen | twist 90°, centred | twist 36°, centred |
| closest approach / model radius | 0.2390 | 0.1482 |
| pairwise linking | every pair ±1 | every pair ±1 |

**Makalu's shape is forced.** A pentagon is carried to itself by ten rotations
only when its mirror lines fall on the group's 2-fold axes; at any other twist
the orbit has twelve pentagons rather than six, and the model has six. That
leaves two twists, a tenth of a turn apart — they are mirror images, which is
the chirality the instructions mention, and only one of them is a clean weave
(below). The polygons are concentric, so scale is the only freedom left, and
scale is not shape.

**Gasherbrum's twist is free** and was chosen for the most room between
strands, subject to the weave being right.

## Three things that were checked rather than assumed

**It has to weave, not merely be symmetric.** The first run maximised clearance
alone and returned the configuration with the largest gap of all — which
knotlib then reduced to zero crossings: four separate rings, the 4-component
unlink. Pulling the frames apart is always the roomiest thing to do. So every
pair must be linked exactly once before clearance gets a say.

**"Woven" means alternating, and alternating is not a property of a picture.**
A diagram's over/under pattern depends on the direction you look from, and a
generic direction adds crossings that have nothing to do with the weave. These
are woven *balls*, so the canonical view is from the centre outwards: project
every frame radially onto a sphere and ask whether each frame goes over, under,
over, under as you walk it. Two edges cross in that view exactly when each
straddles the plane through the origin containing the other — an exact test
with no threshold to tune, which matters because the two threshold-based
attempts that came before it gave 3 contacts per triangle at one setting and 27
at another. The shipped models alternate on every frame:

```
Gasherbrum   UOUOUO       OUOUOU       OUOUOU       UOUOUO
Makalu       UOUOUOUOUO   (the same on all six frames, one of them reversed)
```

**Two configurations are degenerate and are not what ships.** Gasherbrum at
exactly 30° and Makalu at exactly 0° put several crossings on one line from the
centre, which shows up as an odd number of contacts on a frame. They are
perfectly good objects and impossible diagrams — knotlib refuses a projection
with coincident crossings — and a twentieth of a degree away, or at the mirror
twist, the weave is clean and looks identical. Gasherbrum ships at 90°, the
mirror of 30°; Makalu at 36°.

What knotlib makes of the shipped files, from the best of 96 sampled directions:

```
Gasherbrum   30 crossings, 4 components, every pair linked ±1, R1/R2 take it to 22
Makalu       60 crossings, 6 components, every pair linked ±1, R1/R2 take it to 50
```

Neither gets a Jones polynomial: the Kauffman bracket refuses above 16
crossings (`knotlib/diagram.md` §7), so the fingerprint is out of reach for
anything this size.

## Sharp corners

The editor draws a curve as a centripetal Catmull-Rom spline through its
points, which is right for a hand-drawn strand and wrong for a polygon — it
rounds every corner off. Curves in these files set `"straight": true`, and the
editor then builds the curve from line segments instead, so the points *are*
the shape. One place does it (`toSpline` in `editor/src/viewer.js`), so the
tube, the crossing finder and the projections all agree about what the shape
is.

## Files

| file | what |
|---|---|
| `frames.mjs` | the groups, the polygon, the orbit, clearance, Gauss linking, the weave test |
| `build.mjs` | searches what little there is to search, checks it, writes the scenes |
| `gasherbrum.knot.json`, `makalu.knot.json` | the models |
