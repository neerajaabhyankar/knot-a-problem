# A paper model of the 6-corner tetrahedral 4-Borromean link

Four rings, six straight arms each, woven so that no two rings are linked but
no three come apart. 24 tubes, **two patterns**, folded twelve times each.

```sh
node matched.mjs 3 4 6      # search ring shapes whose joints can close; writes matched.json
node design.mjs 3           # the chosen design, with every check
node instructions.mjs       # the hand-build numbers; writes measurements.json
node drawing.mjs            # labelled blanks; writes blank-long.svg, blank-short.svg
node geometry.mjs > geometry.json   # the 3D views for the build page
```

## The joint is the whole problem

Two tubes meet at a corner. Their ends are cut on the plane that bisects the
corner, and reflecting one arm in that plane lands it exactly on the other. So
the two cut ends have the same outline — a mitre joint, like a picture frame —
**if and only if** the next arm's cross-section is the previous one's
reflection in that plane.

That rule chains round the ring and has to come back to where it started.
Carrying the cross-section through two corners (the ring repeats every two, by
its three-fold symmetry) leaves it turned by an angle, and the design only
closes if the cross-section looks the same after turning by that much.

The first version of this model ignored that. It derived the largest
cross-section each arm could have from the support functions of its
neighbours, which gave the long and short arms *different* shapes; their
outlines then disagreed at every corner by up to 5 mm of paper standing proud.
`build.mjs` is that earlier derivation, kept for reference — its corners are
ragged by construction.

## What fixes it

The ring's shape has six free numbers (two corners; the rest follow from the
tetrahedral symmetry), and the twist moves with them. `matched.mjs` walks the
shape — in small steps, re-checking the link at each one, so the strands never
jump past each other — until the two-corner twist is exactly 360/k, then
hill-climbs for the largest regular k-gon that fits every arm at once.

| k | section | twist | arm face | centre-line gap |
|---|---|---|---|---|
| 3 | triangle | 120° | widest | 0.0970 |
| 4 | square | 180° | narrow | 0.0830 |
| 6 | hexagon | 60° | middling | 0.1189 |

**The triangle is what this model uses**: three faces, two creases, and it is
the fattest tube of the three. `design.mjs` holds it.

## The numbers

At 78.04 mm per model unit (one arm per 50 × 150 mm strip, three
strips per sheet, eight sheets), the model is **181.2 mm** across.

| | long arm | short arm |
|---|---|---|
| blank | 43.2 × 148 mm | 43.2 × 133.8 mm |
| axis | 117.8 mm | 90.9 mm |
| tube | 13.1 mm per face, 60° corners | same |
| tongue | 12.5 × 23.9 mm on face 1 | 12.5 × 33.5 mm on face 0 |
| joint after it | 91.8° | 29° |

Ring checks: corner-to-corner 135.7 / 151 / 58.3 mm (three of
each), corners 34.5 mm above and below the ring's mean
plane, 75 mm from table to highest paper.

## What is checked, every run

- tetrahedral symmetry exact; every pair of rings has linking number 0; each
  three-ring sublink identifies as the Borromean rings (knotlib, 8 crossings)
- the two cut ends at a corner differ by **1.72e-05 mm**
- all 276 pairs of arms as solids: none overlaps, 12 touch exactly
- rolling each flat pattern back up reproduces the solid to 5e-17
- each cut line on the blank and the matching edge of the tube agree to 7e-15 mm

## Files

`matched.mjs` the search · `design.mjs` the design and its checks ·
`skeleton.mjs` centre lines · `units.mjs` one unit, flat · `pattern.mjs`
unrolling · `instructions.mjs` hand-build numbers · `drawing.mjs` labelled
blanks · `geometry.mjs` 3D for the page · `cross-section.mjs`, `solids.mjs`,
`build.mjs` the earlier support-function derivation.
