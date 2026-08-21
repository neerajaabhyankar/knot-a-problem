// The data model. `points` is the only state that matters; every mesh in the
// viewer is derived from it. Levels (b) and (c) will read exactly this shape,
// so keep it plain and serializable.
//
// Colours and the default radius come from style.css by way of theme.js, so
// there is one place to change how the app looks.

import { DEFAULT_RADIUS, PALETTE } from './theme.js';

let nextId = 1;

export class Scene {
  constructor() {
    this.version = 1;
    this.curves = [];
  }

  addCurve(points, { closed = true, color = null, name = null, radius = DEFAULT_RADIUS, by = 'human' } = {}) {
    const curve = {
      id: `c${nextId++}`,
      name: name ?? `curve ${this.curves.length + 1}`,
      color: color ?? PALETTE[this.curves.length % PALETTE.length],
      radius,
      closed,
      // Who last touched this. The top-level plan wants it once an agent can
      // drive the editor, and a field is far cheaper now than a migration then.
      by,
      points, // [x, y, z][]
    };
    this.curves.push(curve);
    return curve;
  }

  remove(id) {
    const i = this.curves.findIndex((c) => c.id === id);
    if (i >= 0) this.curves.splice(i, 1);
    return i >= 0;
  }

  get(id) {
    return this.curves.find((c) => c.id === id) ?? null;
  }

  clear() {
    this.curves.length = 0;
  }

  toJSON() {
    return { version: this.version, curves: structuredClone(this.curves) };
  }

  /**
   * Replace the contents wholesale — how undo/redo works. Ids are preserved so
   * a restored selection still points at the right strands; `nextId` only ever
   * increases, so reviving an old id can't collide with a future one.
   */
  restore(snapshot) {
    this.curves = structuredClone(snapshot.curves);
  }
}
