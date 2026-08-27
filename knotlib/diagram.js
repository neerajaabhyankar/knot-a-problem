// A knot or link diagram, as a combinatorial map.
//
// See diagram.md for why this and not a PD code, and glossary.md for any word
// below that isn't obvious. The one-line version: PD codes cannot express a
// crossing-free circle and do not give you faces, and faces are where
// Reidemeister moves live.
//
// The truth is:
//
//   n      crossings
//   pair   4n darts; pair[d] is the dart at the far end of d's edge
//   over   one bit per crossing: 0 → the strand through slots {0,2} is over
//   loops  components with no crossings at all — the thing PD cannot say
//
// A dart is a half-edge. Dart d belongs to crossing d >> 2 and sits in slot
// d & 3, and slots 0,1,2,3 run **counter-clockwise** around the crossing. That
// cyclic order IS the planarity: nothing here stores a coordinate, and the
// diagram is still planar, because a rotation system determines an embedding in
// the sphere.
//
// Everything else on this class — faces, components, PD, Gauss, writhe — is
// derived and cached, exactly as the tube mesh is derived from `points` in the
// editor. If a derived value and the truth ever disagree, the truth wins.

export const SLOT = (d) => d & 3;
export const CROSS = (d) => d >> 2;
export const DART = (c, s) => c * 4 + (s & 3);
/** Next dart counter-clockwise at the same crossing. */
export const ROT = (d) => DART(CROSS(d), SLOT(d) + 1);
export const ROTINV = (d) => DART(CROSS(d), SLOT(d) + 3);
/** The far side of the same strand at the same crossing. */
export const OPP = (d) => d ^ 2;

export class Diagram {
  /**
   * @param {object} spec
   * @param {number} spec.n      crossings
   * @param {ArrayLike<number>} spec.pair    length 4n, an involution without fixed points
   * @param {ArrayLike<number>} spec.over    length n, each 0 or 1
   * @param {number} [spec.loops]            crossing-free components
   */
  constructor({ n, pair, over, loops = 0 }) {
    if (!Number.isInteger(n) || n < 0) throw new Error(`crossing count must be a non-negative integer, got ${n}`);
    if (!Number.isInteger(loops) || loops < 0) throw new Error(`loop count must be a non-negative integer, got ${loops}`);
    if (pair.length !== 4 * n) throw new Error(`pair must have 4n = ${4 * n} entries, got ${pair.length}`);
    if (over.length !== n) throw new Error(`over must have n = ${n} entries, got ${over.length}`);

    this.n = n;
    this.loops = loops;
    this.pair = Int32Array.from(pair);
    this.over = Uint8Array.from(over);

    for (let d = 0; d < 4 * n; d++) {
      const e = this.pair[d];
      if (!Number.isInteger(e) || e < 0 || e >= 4 * n) throw new Error(`dart ${d} pairs to ${e}, which is not a dart`);
      if (e === d) throw new Error(`dart ${d} pairs to itself`);
      if (this.pair[e] !== d) throw new Error(`pairing is not an involution at dart ${d}`);
    }
    for (let c = 0; c < n; c++) {
      if (this.over[c] !== 0 && this.over[c] !== 1) throw new Error(`over[${c}] must be 0 or 1, got ${this.over[c]}`);
    }

    this._cache = {};
    this.check();
  }

  /** Is the strand through this dart the one that goes over at its crossing? */
  isOver(d) {
    return (SLOT(d) & 1) === this.over[CROSS(d)];
  }

  // ---------------------------------------------------------------- faces --

  /**
   * The faces, each as its darts in order. A face is a region the diagram cuts
   * the plane into; its degree is how many darts bound it. Reidemeister moves
   * are conditions on faces of degree 1, 2 and 3 — see moves.js.
   *
   * Orbits of φ(d) = ROTINV(pair[d]). The inverse rotation rather than the
   * rotation is what makes a kink come out as a face of degree 1 rather than 3,
   * which is the whole reason to trace faces in the first place.
   */
  faces() {
    if (this._cache.faces) return this._cache.faces;
    const seen = new Uint8Array(4 * this.n);
    const out = [];
    for (let d = 0; d < 4 * this.n; d++) {
      if (seen[d]) continue;
      const face = [];
      let x = d;
      do {
        face.push(x);
        seen[x] = 1;
        x = ROTINV(this.pair[x]);
      } while (x !== d);
      out.push(face);
    }
    this._cache.faces = out;
    return out;
  }

  /** Connected pieces of the underlying graph, as arrays of crossing indices. */
  pieces() {
    if (this._cache.pieces) return this._cache.pieces;
    const parent = Array.from({ length: this.n }, (_, i) => i);
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    for (let d = 0; d < 4 * this.n; d++) {
      const a = find(CROSS(d));
      const b = find(CROSS(this.pair[d]));
      if (a !== b) parent[a] = b;
    }
    const groups = new Map();
    for (let c = 0; c < this.n; c++) {
      const r = find(c);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(c);
    }
    this._cache.pieces = [...groups.values()];
    return this._cache.pieces;
  }

  /**
   * Euler's formula, per connected piece, treating each as a map on its own
   * sphere: V − E + F = 2 with V = n and E = 2n gives F = n + 2.
   *
   * This is cheap and unreasonably effective. Every mutation in moves.js runs
   * it, and any mis-wired dart breaks it immediately — long before an invariant
   * would notice.
   */
  check() {
    const pieces = this.pieces();
    const expected = this.n + 2 * pieces.length;
    const got = this.faces().length;
    if (got !== expected) {
      throw new Error(
        `not a plane diagram: ${this.n} crossings in ${pieces.length} piece(s) need ${expected} faces, traced ${got}`,
      );
    }
    return true;
  }

  // ----------------------------------------------------------- components --

  /**
   * The link components, each as the darts it *arrives* at, in traversal order.
   *
   * Following the strand is σ(d) = pair[OPP(d)]: leave by the far side of the
   * crossing, then cross the edge. Its orbits come in pairs — one per direction
   * of travel — so choosing an orientation is choosing one orbit from each
   * pair. We take the one containing the lowest-numbered dart, which makes the
   * choice deterministic rather than arbitrary.
   */
  components() {
    if (this._cache.components) return this._cache.components;
    const seen = new Uint8Array(4 * this.n);
    const out = [];
    for (let d = 0; d < 4 * this.n; d++) {
      if (seen[d]) continue;
      const orbit = [];
      let x = d;
      do {
        if (seen[x]) throw new Error(`strand traversal revisited dart ${x}`);
        orbit.push(x);
        seen[x] = 1;
        x = this.pair[OPP(x)];
      } while (x !== d);
      // The same component walked the other way is the orbit of the opposite
      // darts; claim it now so it isn't reported as a second component.
      for (const y of orbit) seen[OPP(y)] = 1;
      out.push(orbit);
    }
    this._cache.components = out;
    return out;
  }

  /** How many link components, counting the crossing-free ones. */
  componentCount() {
    return this.components().length + this.loops;
  }

  /** Which component each dart belongs to; -1 for none (there are none). */
  componentOfDart() {
    if (this._cache.comp) return this._cache.comp;
    const comp = new Int32Array(4 * this.n).fill(-1);
    this.components().forEach((orbit, i) => {
      for (const d of orbit) {
        comp[d] = i;
        comp[OPP(d)] = i;
      }
    });
    this._cache.comp = comp;
    return comp;
  }

  /** True for the two darts per crossing that the chosen orientation arrives at. */
  incoming() {
    if (this._cache.incoming) return this._cache.incoming;
    const inc = new Uint8Array(4 * this.n);
    for (const orbit of this.components()) for (const d of orbit) inc[d] = 1;
    this._cache.incoming = inc;
    return inc;
  }

  /** The two darts the strands arrive at crossing `c` by, split over and under. */
  arrivalsAt(c) {
    const inc = this.incoming();
    let over = -1;
    let under = -1;
    for (let s = 0; s < 4; s++) {
      const d = DART(c, s);
      if (!inc[d]) continue;
      if (this.isOver(d)) over = d;
      else under = d;
    }
    if (over < 0 || under < 0) throw new Error(`crossing ${c} has no over/under arrival pair`);
    return { over, under };
  }

  /**
   * Crossing sign, ±1, by the right-hand rule: positive when the under-strand
   * passes from right to left as seen by someone walking the over-strand.
   *
   * Purely combinatorial — no coordinates needed. Slots run counter-clockwise,
   * so a strand arriving at slot s travels in the direction of slot s+2. The
   * under-strand is 90° counter-clockwise of the over-strand exactly when its
   * arrival slot is one further round.
   */
  sign(c) {
    const { over, under } = this.arrivalsAt(c);
    const turn = (SLOT(under) - SLOT(over) + 4) % 4;
    if (turn !== 1 && turn !== 3) throw new Error(`crossing ${c} is not transverse: arrival slots ${SLOT(over)}, ${SLOT(under)}`);
    return turn === 1 ? 1 : -1;
  }

  /** Sum of the crossing signs. NOT a knot invariant — see invariants.js. */
  writhe() {
    let w = 0;
    for (let c = 0; c < this.n; c++) w += this.sign(c);
    return w;
  }

  // ------------------------------------------------------- transformations --

  /** The mirror image: every crossing flipped. A different knot, in general. */
  mirror() {
    return new Diagram({ n: this.n, pair: this.pair, over: this.over.map((v) => 1 - v), loops: this.loops });
  }

  /**
   * The same knot, seen from behind the page: every rotation reversed AND every
   * crossing flipped. Reversing the rotations *alone* would be the mirror, so
   * these two operations differ by exactly one bit and are easy to confuse —
   * which is why `canonical()` quotients by this one and not by `mirror()`.
   */
  pageFlip() {
    const n = this.n;
    const m = (d) => DART(CROSS(d), (4 - SLOT(d)) % 4);
    const pair = new Int32Array(4 * n);
    for (let d = 0; d < 4 * n; d++) pair[m(d)] = m(this.pair[d]);
    return new Diagram({ n, pair, over: this.over.map((v) => 1 - v), loops: this.loops });
  }

  /**
   * The same diagram with the crossings renumbered and each crossing's slots
   * rotated. Nothing about the knot changes; the byte pattern changes entirely.
   * Exists so `canonical()` can be tested against it.
   */
  relabel(crossingPerm, slotShifts) {
    const n = this.n;
    const m = (d) => DART(crossingPerm[CROSS(d)], SLOT(d) + slotShifts[CROSS(d)]);
    const pair = new Int32Array(4 * n);
    for (let d = 0; d < 4 * n; d++) pair[m(d)] = m(this.pair[d]);
    const over = new Uint8Array(n);
    for (let c = 0; c < n; c++) over[crossingPerm[c]] = (this.over[c] + slotShifts[c]) & 1;
    return new Diagram({ n, pair, over, loops: this.loops });
  }

  // ------------------------------------------------------- canonical form --

  /**
   * A string that is equal for two diagrams exactly when they are the same
   * diagram — same up to renumbering, up to which slot you call 0, and up to
   * looking at the page from the other side.
   *
   * This is *diagram* equality, not knot equality. Two diagrams of the same
   * knot generally differ here; that is the point, since it is what lets a test
   * assert that a move did or did not change the picture.
   *
   * Split pieces are canonicalised independently and sorted, because a split
   * diagram's pieces have no relationship to fix.
   */
  canonical() {
    if (this._cache.canonical) return this._cache.canonical;
    const parts = this.pieces().map((piece) => this._canonicalPiece(piece)).sort();
    this._cache.canonical = `L${this.loops}${parts.map((p) => `|${p}`).join('')}`;
    return this._cache.canonical;
  }

  _canonicalPiece(piece) {
    let best = null;
    for (const c of piece) {
      for (let s = 0; s < 4; s++) {
        for (const flip of [0, 1]) {
          const enc = this._encode(DART(c, s), flip);
          if (best === null || enc < best) best = enc;
        }
      }
    }
    return best;
  }

  /**
   * Depth-first relabelling from one dart, in one of the two page orientations.
   *
   * The crossing bit has to be emitted relative to the anchor slot, or a
   * rotation of the slots would change the string: `(over + anchor) & 1` is the
   * combination that survives. XOR-ing `flip` on top is what makes the flip=1
   * reading of a diagram agree with the flip=0 reading of its page-flip, which
   * is the whole reason this quotient works.
   */
  _encode(root, flip) {
    const index = new Map();
    const anchor = new Map();
    const order = [];
    const visit = (c, slot) => {
      index.set(c, order.length);
      anchor.set(c, slot);
      order.push(c);
    };
    visit(CROSS(root), SLOT(root));

    const out = [];
    for (let i = 0; i < order.length; i++) {
      const c = order[i];
      const a = anchor.get(c);
      const row = [];
      for (let ns = 0; ns < 4; ns++) {
        const s = flip ? (a - ns + 8) % 4 : (a + ns) % 4;
        const e = this.pair[DART(c, s)];
        const ec = CROSS(e);
        if (!index.has(ec)) visit(ec, SLOT(e));
        const ea = anchor.get(ec);
        const nes = flip ? (ea - SLOT(e) + 8) % 4 : (SLOT(e) - ea + 8) % 4;
        row.push(`${index.get(ec)}.${nes}`);
      }
      out.push(`${((this.over[c] + a) & 1) ^ flip}:${row.join(',')}`);
    }
    return out.join(';');
  }

  // -------------------------------------------------------- derived codes --

  /**
   * Arc labels, 1-based, assigned by walking each component in turn. An arc is
   * an edge of the graph — a stretch of strand between two crossings.
   */
  arcs() {
    if (this._cache.arcs) return this._cache.arcs;
    const label = new Int32Array(4 * this.n);
    let next = 1;
    for (const orbit of this.components()) {
      for (const d of orbit) {
        label[d] = next;
        label[this.pair[d]] = next;
        next++;
      }
    }
    this._cache.arcs = label;
    return label;
  }

  /**
   * Planar Diagram code: one `X[a,b,c,d]` per crossing, `a` the incoming
   * under-arc and `b,c,d` counter-clockwise from it. A derived view — it cannot
   * express `loops`, which is reported separately and is why this returns an
   * object rather than a bare array.
   */
  pd() {
    const label = this.arcs();
    const X = [];
    for (let c = 0; c < this.n; c++) {
      const { under } = this.arrivalsAt(c);
      X.push([under, ROT(under), ROT(ROT(under)), ROT(ROT(ROT(under)))].map((d) => label[d]));
    }
    return { X, loops: this.loops };
  }

  /**
   * Signed Gauss code, one sequence per component: each pass through a crossing
   * as `{ crossing, over, sign }` in traversal order.
   */
  gauss() {
    return this.components().map((orbit) =>
      orbit.map((d) => ({ crossing: CROSS(d), over: this.isOver(d), sign: this.sign(CROSS(d)) })),
    );
  }

  toString() {
    return `Diagram(${this.n} crossing${this.n === 1 ? '' : 's'}, ${this.componentCount()} component${
      this.componentCount() === 1 ? '' : 's'
    }${this.loops ? `, ${this.loops} free` : ''})`;
  }
}

/** The crossing-free diagram of `k` split circles. */
export function unlink(k = 1) {
  return new Diagram({ n: 0, pair: [], over: [], loops: k });
}
