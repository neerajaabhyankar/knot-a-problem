// Reidemeister moves.
//
// These are *isotopies*: they change the picture and not the knot. (A crossing
// change — swapping which strand is on top — is a different animal entirely.
// It is the unknotting operation, and it does change the knot. It is not here.)
//
// Every move is a condition on a **face**, which is why diagram.js goes to the
// trouble of tracing them:
//
//   R1  a face of degree 1 — a kink. Always removable.
//   R2  a face of degree 2 — a bigon. Removable only if the same strand is on
//       top at both crossings. If they alternate it is a clasp, and no amount
//       of pulling will undo it.
//   R3  a face of degree 3 — a triangle. Available only if one strand is
//       entirely above the other two, i.e. the over-relation is not a cycle.
//
// Those two exceptions are the reason to check structurally rather than by eye:
// a clasp and a removable bigon are the same picture apart from one bit, and so
// are a cyclic and an acyclic triangle.
//
// Note the asymmetry: these are the *simplifying* directions. The move that
// adds a kink or a bigon is available almost anywhere, which is exactly why
// simplification is a search — sometimes you have to go up before you can come
// down.

import { CROSS, DART, Diagram, OPP, ROT, SLOT } from './diagram.js';

/**
 * Every face of degree 1, 2 or 3, with a verdict and — when the answer is no —
 * the reason. `find` is the filtered version; this one exists so the reason is
 * inspectable rather than inferred from an absence.
 */
export function survey(D) {
  const out = [];
  for (const face of D.faces()) {
    if (face.length === 1) {
      out.push({ kind: 'R1', face, crossings: [CROSS(face[0])], available: true, reason: '' });
    } else if (face.length === 2) {
      const [d0, d1] = face;
      const crossings = [CROSS(d0), CROSS(d1)];
      if (crossings[0] === crossings[1]) {
        out.push({ kind: 'R2', face, crossings, available: false, reason: 'both corners are the same crossing' });
      } else {
        const coherent = D.isOver(d0) === D.isOver(D.pair[d0]);
        out.push({
          kind: 'R2',
          face,
          crossings,
          available: coherent,
          reason: coherent ? '' : 'a clasp — the strands alternate over and under',
        });
      }
    } else if (face.length === 3) {
      const crossings = face.map((d) => CROSS(d));
      if (new Set(crossings).size !== 3) {
        out.push({ kind: 'R3', face, crossings, available: false, reason: 'the triangle repeats a crossing' });
        continue;
      }
      // Each side of the triangle lies on one strand; each corner is where two
      // of them meet. Read off who is on top at each corner and ask whether
      // that relation is a cycle.
      const wins = face.map((_, i) => D.isOver(D.pair[face[i]]));
      const cyclic = wins.every(Boolean) || !wins.some(Boolean);
      out.push({
        kind: 'R3',
        face,
        crossings,
        available: !cyclic,
        reason: cyclic ? 'no strand is entirely over the other two' : '',
      });
    }
  }
  return out;
}

/** The moves that can actually be made, simplifying directions only. */
export function find(D) {
  return survey(D).filter((m) => m.available);
}

/**
 * Delete a set of crossings, letting each strand run straight through where a
 * crossing used to be.
 *
 * This one operation covers R1 and R2 both, which is the nice surprise: a kink
 * disappears because the walk enters the crossing, comes back round the loop
 * edge, and leaves — no special case needed. It also handles the case where
 * what is left over is a circle with no crossings on it at all, which happens
 * whenever the last bigon of an overlapping pair goes.
 */
function spliceOut(D, removed) {
  const keep = [];
  const index = new Int32Array(D.n).fill(-1);
  for (let c = 0; c < D.n; c++) {
    if (!removed.has(c)) {
      index[c] = keep.length;
      keep.push(c);
    }
  }
  const relabel = (d) => DART(index[CROSS(d)], SLOT(d));

  const pair = new Int32Array(4 * keep.length).fill(-1);
  for (const c of keep) {
    for (let s = 0; s < 4; s++) {
      const d = DART(c, s);
      let a = D.pair[d];
      let guard = 4 * D.n;
      while (removed.has(CROSS(a))) {
        a = D.pair[OPP(a)];
        if (guard-- < 0) throw new Error('splicing went round for ever');
      }
      pair[relabel(d)] = relabel(a);
    }
  }

  // Anything that only ever touched deleted crossings is now a bare circle.
  // Each such component shows up as two strand orbits, one per direction.
  const seen = new Uint8Array(4 * D.n);
  let stranded = 0;
  for (let d = 0; d < 4 * D.n; d++) {
    if (seen[d] || !removed.has(CROSS(d))) continue;
    let x = d;
    let pure = true;
    do {
      seen[x] = 1;
      if (!removed.has(CROSS(x))) pure = false;
      x = D.pair[OPP(x)];
    } while (x !== d);
    if (pure) stranded++;
  }

  return new Diagram({ n: keep.length, pair, over: D.over.filter((_, c) => !removed.has(c)), loops: D.loops + stranded / 2 });
}

/**
 * Perform a move found by `find`. The returned diagram is new; the old one is
 * untouched, which is what makes "assert the invariant did not change" a
 * comparison rather than a promise.
 */
export function apply(D, move) {
  if (!move.available) throw new Error(`that ${move.kind} is not available: ${move.reason}`);
  if (move.kind === 'R1' || move.kind === 'R2') return spliceOut(D, new Set(move.crossings));
  if (move.kind === 'R3') {
    throw new Error(
      'R3 is detected but not yet applied — it rewires three edges without deleting anything, ' +
        'so it needs its own construction rather than a splice. See diagram.md §R3.',
    );
  }
  throw new Error(`unknown move ${move.kind}`);
}

/**
 * Pull out kinks and bigons until none are left.
 *
 * This is greedy and therefore incomplete: it only ever goes downhill, so it
 * reaches a diagram with no removable face rather than a minimal one. It is a
 * simplifier, not a solver, and it should be described that way.
 */
export function simplify(D, { limit = 200 } = {}) {
  const applied = [];
  let current = D;
  for (let step = 0; step < limit; step++) {
    const move = find(current).find((m) => m.kind === 'R1' || m.kind === 'R2');
    if (!move) break;
    current = apply(current, move);
    applied.push(move.kind);
  }
  return { diagram: current, applied };
}
