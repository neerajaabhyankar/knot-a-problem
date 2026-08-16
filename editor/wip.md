TODO (neeraja): verify the following and continue fixes along these lines...

  1. Pan. I think I found the actual bug: the draw-plane grid was anchored to the orbit target, which is always at screen centre — so when you panned, the grid sat perfectly still while
  everything else slid, and panning looked broken. The grid lines are now anchored in the world and slide past as you pan. Also added ⇧-drag to pan (right-drag is awkward on a trackpad) and F
  to frame everything, since zoomToCursor can drift the target away from your work.

  2. Pink dots are gone except while the pen is armed. Selecting an open strand now shows white balls at its ends instead.

  3. Those balls are grab handles — drag one to keep drawing from that end. Bring it round to the strand's other end and it ties into a loop. Grabbing has to beat OrbitControls to the event,
  so it's intercepted in the capture phase on the way down.

  4. Undo/redo — ⌘Z / ⇧⌘Z, plus toolbar buttons. Snapshot-based rather than a command stack: the model is small and fully serializable, so it's a deep copy before each mutation, ids preserved
  so selections survive. Draw, erase, delete, clear and extend all record.

  5. Eraser is scoped to the selection — with nothing selected it does nothing and the cursor goes dashed to show it's inert.

  6. Crossings. Alternating is gone entirely — nothing is guessed. Two rules, applied in order, in `src/crossings.js`:

       1. a pen lift across a crossing sends that strand under;
       2. otherwise the strand drawn later goes over.

  Rule 2 always applies, so every crossing is decided and the tubes never intersect. It also means a shape drawn with no pen lifts is a descending diagram — a valid curve, but always the
  unknot. That is correct and intended: breaks are what make a knot. A trefoil is three breaks, either as three strokes or one stroke with three lifts. The gap that closes the loop counts as
  a break like any other, which is what makes three strokes enough (it used to demand four).

  7. Shift while drawing gives a straight line (and works while extending too).

  Clearance is now fixed at 4 × tube radius centre-to-centre — one full strand thickness of gap — rather than scaling with drawing size. The test verifies the strands part by exactly that and
  that the tubes never intersect.

  One note on that test: my earlier "tubes don't intersect" check was measuring wrong. It excluded neighbouring samples by index, so on a tight bend it flagged the tube curving around a
  corner as a self-intersection. Exclusion has to be by arclength — that's the standard rope-thickness criterion. With that fixed the true minimum separation is 0.298, exactly the designed
  clearance.

  Biggest remaining hole: pen lifts only decide self-crossings within one strand. Two separate strands drawn on the same plane still pass through each other — you have to aim with the pierce
  dots. That's the thing I'd fix next.
