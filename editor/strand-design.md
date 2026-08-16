# Drawing flow

How a strand gets made, continued, and finished. One concept carries the whole
thing.

## The live strand

**At most one strand is live at a time.** Live means: the next stroke you draw
continues it. That is the only state the drawing flow has.

```
live = curveId | null          // that's the whole state
```

A strand always grows from its **last** point. Grabbing the other handle
reverses the strand rather than adding a second direction to reason about —
reversing is free, because the depths are already baked in and immutable.

Everything follows from this:

| You do | What happens |
|---|---|
| Draw a stroke with nothing live | A new strand is created and becomes live |
| Draw a stroke with a strand live | It continues the live strand from the live end |
| Grab a handle | That strand becomes live, growing from the end you grabbed |
| Enter / Escape / click empty space / switch tools | Nothing is live any more |
| End a stroke near the strand's *other* end | The loop closes; nothing is live |

There is no separate "extend" mechanic. Continuing a strand you drew an hour ago
and continuing the one under your pen are the same operation.

## Every stroke joins the live end

The gap between the live end and where you start the next stroke is **filled** —
a straight run of strand, drawn like any other. The strand is never
disconnected.

What the gap *means* is decided by its size, using the rule that already governs
crossings:

- **Gap smaller than half a strand separation** — you meant to continue from
  there. No fill, the strokes just join.
- **Anything bigger** — the fill is a pen-up bridge. It passes **under**
  anything it crosses, which is exactly the break convention in a knot diagram.

So `segment, lift, segment` gives an N: two strokes and the fill between them.
`arc, lift, arc, lift, arc` gives a trefoil: three strokes and three fills, each
diving under. Same rule, different drawing.

You never have to aim. Wherever you put the pen down, it continues from the live
end.

## Finishing

Four ways to stop, all of them meaning "this strand is done":

- **Enter** — done, leave it open.
- **Escape** — same. (The ink is already committed, so ⌘Z is how you throw it
  away, not Escape.)
- **Click empty space** — a click, not a drag, under `MIN_STROKE` of travel.
- **Switch tools** — picking Select or Erase releases the live strand.

Plus the one that finishes by construction: **end a stroke near the strand's
other end** and it closes into a loop.

**Finishing hands the tool back to Select.** Select is home. Draw takes the left
mouse button away from the camera, so staying in Draw after finishing would mean
you cannot orbit to look at what you just made — and looking at it is exactly
what you want to do next. Drawing another strand is one keypress.

## Undo

**One stroke, one undo step.** Draw a bad arc and ⌘Z takes back just that arc,
leaving the rest of the strand live so you can redraw it. This only works
because geometry is immutable — a stroke is a clean append, so removing it is a
clean truncation.

## What you see

A live strand is **drawn exactly like a selected one** — same glow. In-progress
and selected are the same visual idea: this is the thing you are working on.

Its two ends carry handles:

```
●  live end     bright, larger — the next stroke attaches here
○  other end    dim, smaller  — grab it to grow that way instead
◉  highlighted  under the pointer — something will happen here
```

A handle highlights when the pointer is within the snap radius of it, so you get
told *before* you commit that you are about to close the loop or continue
cleanly. Closed strands have no handles: there is no end to grow.

## Geometry is immutable

**Once a stroke is materialised, its points never change again.** A later stroke
can never move an earlier one.

This is what makes resuming work from any camera angle, and it is why panning or
orbiting between strokes is safe. It also means the strand you see is the strand
you have — nothing is provisional.

The consequence for crossings: a new stroke is lifted **against** the strand
already on screen, rather than the whole strand being re-lifted from scratch.
The two rules are unchanged and give the same answers, because both agree that a
fill goes under regardless of which pass was drawn first:

1. A fill (pen-up gap) goes **under**.
2. Otherwise the strand drawn **later** goes over.

At a crossing, the new stroke is placed one separation above or below *the depth
the other strand actually has there* — not above or below zero. That is what lets
you keep drawing on a strand that already has depth.

**Other curves count too.** Anything already on screen is an obstacle, not just
the strand you are drawing, so lifting the pen makes you pass under a different
loop as well. With one guard: if the two are **already** a separation apart in
depth, nothing happens. Two loops of a link cross on screen all the time while
being nowhere near each other in space, and shoving them apart would break the
link rather than draw it.

## Modes

- **Draw** — the only mode that makes strands. Left-drag draws.
- **Select** — picking, deleting, and choosing what the eraser may touch. Never
  draws. Grabbing a handle in Select switches you to Draw with that strand live.
- **Erase** — rubs out parts of the selection.

## Leave a real gap

A break has to be at least about **one strand-separation wide**. Not a rule the
code enforces — a consequence of the geometry, and the same thing you'd do on
paper.

A break is a gap you leave around the strand passing over. The fill dives under
across the whole width of that gap, but the two stroke ends *flanking* the gap
sit at drawing level. Leave the gap too tight and those ends end up within a
strand's thickness of the strand they're breaking around, and the tubes look
like they touch. Since finished geometry never moves, nothing can fix that
afterwards.

Anything under half a separation isn't treated as a break at all — the strokes
simply join.

## Deliberately not doing

- No multi-select of live strands. One at a time.
- No handle on a closed strand. Erase a bite out of it first — which is exactly
  how you reopen an old knot to keep working on it.
- No flipping a crossing after the fact. Immutability makes that permanent: the
  fix is to erase back to it and redraw.
