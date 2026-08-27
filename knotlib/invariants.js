// Quantities you can compute from a diagram — and, just as importantly, what
// each one is actually invariant under.
//
// The classic error in this corner of the subject is not a wrong algorithm, it
// is a right algorithm used at the wrong level. Writhe and the Kauffman bracket
// are the two everyone reaches for and **neither survives a Reidemeister I
// move**; the Jones polynomial is the bracket corrected by the writhe precisely
// because of that. So every quantity here is returned tagged, and
// `fingerprint()` refuses anything that is not tagged `ambient`. That turns a
// subtle mathematical mistake into an ordinary error message.

import { DART } from './diagram.js';
import * as L from './laurent.js';

export const INVARIANCE = {
  /** Depends on the picture. Changes under every move. */
  DIAGRAM: 'diagram',
  /** Survives R2 and R3 but not R1 — "regular isotopy". */
  REGULAR: 'regular',
  /** Survives all three. A knot invariant. */
  AMBIENT: 'ambient',
};

const quantity = (name, invariance, value) => ({ name, invariance, value });

/** Beyond this the state sum stops being a computation and becomes a hang. */
export const BRACKET_LIMIT = 16;

export const crossingCount = (D) => quantity('crossings', INVARIANCE.DIAGRAM, D.n);

export const writhe = (D) => quantity('writhe', INVARIANCE.REGULAR, D.writhe());

/**
 * Linking numbers between every pair of components, as a lower-triangular list.
 * Half the signed count of the crossings between the two, and a genuine
 * invariant: a self-crossing never contributes, so R1 cannot touch it.
 */
export function linking(D) {
  const comp = D.componentOfDart();
  // Every component, free loops included: a circle off on its own is still a
  // component, and its linking number with everything is a zero the fingerprint
  // has to see. Leaving it out is how a drawn unlink stops matching a bare one.
  const k = D.componentCount();
  const lk = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let c = 0; c < D.n; c++) {
    const { over, under } = D.arrivalsAt(c);
    const a = comp[over];
    const b = comp[under];
    if (a === b) continue;
    lk[a][b] += D.sign(c) / 2;
    lk[b][a] += D.sign(c) / 2;
  }
  return quantity('linking', INVARIANCE.AMBIENT, lk);
}

/**
 * The Kauffman bracket ⟨D⟩, as a Laurent polynomial in A, normalised so that
 * ⟨unknot⟩ = 1.
 *
 * A state chooses one of two smoothings at every crossing; the bracket sums
 * A^(#A − #B) · δ^(loops − 1) over all 2ⁿ of them, with δ = −A² − A⁻².
 *
 * Which smoothing is the "A" one is fixed by the rotation: turning the
 * over-strand counter-clockwise sweeps two of the four corners, and the A
 * smoothing is the one that joins those two. In dart terms that is a pairing of
 * slots, which is all the code below needs.
 */
export function bracket(D) {
  if (D.n > BRACKET_LIMIT) {
    throw new Error(`${D.n} crossings is ${2 ** (D.n - BRACKET_LIMIT)}× past what the state sum will do (limit ${BRACKET_LIMIT})`);
  }
  const delta = { lo: -2, c: [-1, 0, 0, 0, -1] }; // −A² − A⁻²
  const powers = [L.one()];
  const deltaPow = (k) => {
    while (powers.length <= k) powers.push(L.mul(powers[powers.length - 1], delta));
    return powers[k];
  };

  // Slot pairings. over = 0 means the strand through slots {0,2} is on top.
  const JOIN_A = [3, 2, 1, 0];
  const JOIN_B = [1, 0, 3, 2];
  const tables = Array.from({ length: D.n }, (_, c) =>
    D.over[c] === 0 ? [JOIN_A, JOIN_B] : [JOIN_B, JOIN_A],
  );

  const darts = 4 * D.n;
  const smooth = new Int32Array(darts);
  const seen = new Uint8Array(darts);
  let total = L.ZERO;

  for (let state = 0; state < 1 << D.n; state++) {
    let a = 0;
    for (let c = 0; c < D.n; c++) {
      const b = (state >> c) & 1;
      if (b === 0) a++;
      const table = tables[c][b];
      for (let s = 0; s < 4; s++) smooth[DART(c, s)] = DART(c, table[s]);
    }
    seen.fill(0);
    let circles = D.loops;
    for (let d = 0; d < darts; d++) {
      if (seen[d]) continue;
      circles++;
      let x = d;
      do {
        seen[x] = 1;
        x = smooth[x];
        seen[x] = 1;
        x = D.pair[x];
      } while (x !== d);
    }
    total = L.add(total, L.scale(deltaPow(circles - 1), 1, a - (D.n - a)));
    if (D.n === 0) break;
  }
  if (D.n === 0) total = deltaPow(D.loops - 1);
  return quantity('bracket', INVARIANCE.REGULAR, total);
}

/**
 * The Jones polynomial, written in A rather than t: `f = (−A³)^(−w) · ⟨D⟩`, and
 * `V(t) = f` with `t = A⁻⁴`.
 *
 * Keeping it in A avoids fourth-root bookkeeping — a link with an even number
 * of components has half-integer powers of t, and those are perfectly ordinary
 * integer powers of A. The substitution is the reader's to make.
 */
export function jones(D) {
  const w = D.writhe();
  const b = bracket(D).value;
  return quantity('jones', INVARIANCE.AMBIENT, L.scale(b, (-1) ** (w % 2 === 0 ? 0 : 1), -3 * w));
}

/**
 * Everything ambient about a diagram, as one comparable string.
 *
 * The guard is the point: pass it a regular-isotopy quantity and it throws
 * rather than quietly producing a fingerprint that changes when you add a kink.
 */
export function fingerprint(D, extra = []) {
  const parts = [linking(D), jones(D), ...extra];
  for (const q of parts) {
    if (q.invariance !== INVARIANCE.AMBIENT) {
      throw new Error(`${q.name} is invariant under ${q.invariance} isotopy only — it cannot go in a fingerprint`);
    }
  }
  const [lk, j] = parts;
  const pairs = [];
  for (let i = 0; i < lk.value.length; i++) {
    for (let k = i + 1; k < lk.value.length; k++) pairs.push(lk.value[i][k]);
  }
  return [
    `k=${D.componentCount()}`,
    `lk=${pairs.sort((x, y) => x - y).join(',')}`,
    `V=${L.toString(j.value)}`,
    ...extra.slice(2).map((q) => `${q.name}=${JSON.stringify(q.value)}`),
  ].join(' | ');
}
