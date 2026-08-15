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

  6. Pen lifts. You were right, and this replaced the alternating scheme as the primary mechanism. Draw now stays armed across pen lifts until a stroke ends back at the strand's start (or
  Enter finishes it open). Pen down = over; the gap where you lifted becomes a bridge that dips under. A trefoil is four strokes with three lifts.

  Alternating survives only as the fallback for crossings you leave ambiguous — both passes drawn pen-down. The status line tells you when that happened, so you know the tool guessed. Worth
  keeping precisely because the naive alternative ("first pass goes over") produces a descending diagram, which is always the unknot.

  7. Shift while drawing gives a straight line (and works while extending too).

  Clearance is now fixed at 4 × tube radius centre-to-centre — one full strand thickness of gap — rather than scaling with drawing size. The test verifies the strands part by exactly that and
  that the tubes never intersect.

  One note on that test: my earlier "tubes don't intersect" check was measuring wrong. It excluded neighbouring samples by index, so on a tight bend it flagged the tube curving around a
  corner as a self-intersection. Exclusion has to be by arclength — that's the standard rope-thickness criterion. With that fixed the true minimum separation is 0.298, exactly the designed
  clearance.

  Biggest remaining hole: pen lifts only decide self-crossings within one strand. Two separate strands drawn on the same plane still pass through each other — you have to aim with the pierce
  dots. That's the thing I'd fix next.
