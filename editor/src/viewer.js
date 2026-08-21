// Everything three.js: renderer, camera, lights, the draw-plane indicator,
// endpoint handles, and turning Curve records into tube meshes.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DEFAULT_RADIUS } from './theme.js';

// Handles and the focus ring are chrome, not strand: they stay one size however
// thick the strand under them happens to be.
const TUBE_RADIUS = DEFAULT_RADIUS;
const GROUND_Y = -3;
const PLANE_HALF = 3.2; // draw-plane indicator half-width, world units
const GRID_STEP = 0.8;

const mod = (a, n) => ((a % n) + n) % n;

export class Viewer {
  constructor(canvas) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0b0e);
    // Fades the ground into the background instead of leaving a bright horizon.
    this.scene.fog = new THREE.Fog(0x0a0b0e, 9, 34);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    this.camera.position.set(0, 2.2, 7.5);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.rotateSpeed = 0.85;
    this.controls.panSpeed = 1.0;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 40;
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true; // zoom goes where you point, like a map
    // Plotly-style turntable: left orbits, wheel zooms, and ⌘/Ctrl/⇧ with a
    // left-drag pans — three.js swaps that one itself. The left button is taken
    // away only while a stroke tool is armed.
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    };

    this._setupEnvironment();
    this._setupLights();
    this._setupGround();
    this._setupDrawPlane();
    this._setupHandles();

    this.curveGroup = new THREE.Group();
    this.scene.add(this.curveGroup);
    this.meshes = new Map(); // curve id -> Mesh

    this.preview = null;
    this.selection = new Set();
    this.tool = 'select';
    this.panHint = false;
    this.dragging = false;

    this.raycaster = new THREE.Raycaster();
    this._plane = new THREE.Plane();
    this._ndc = new THREE.Vector2();
    this._tmp = new THREE.Vector3();

    this.resize();
    addEventListener('resize', () => this.resize());
  }

  // ---------- setup ----------

  _setupEnvironment() {
    // A faint room reflection keeps the tubes from looking like flat vector
    // art. Kept low — a strong one reads as cheap shiny plastic.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.16;
    pmrem.dispose();
  }

  _setupLights() {
    // Neutral and broad: solid, evenly lit colour rather than a specular sweep.
    this.scene.add(new THREE.AmbientLight(0xa8b4c8, 1.1));

    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(4, 8, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 30;
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    key.shadow.bias = -0.0008;
    key.shadow.radius = 4;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xdfe6f2, 0.55);
    fill.position.set(-6, 1, -4);
    this.scene.add(fill);
  }

  _setupGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0x0d1015, roughness: 0.95, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = GROUND_Y;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  _setupDrawPlane() {
    this.drawPlane = new THREE.Group();
    this.scene.add(this.drawPlane);

    this._planeFill = new THREE.MeshBasicMaterial({
      color: 0x4dd2ff,
      transparent: true,
      opacity: 0.02,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.drawPlane.add(
      new THREE.Mesh(new THREE.PlaneGeometry(PLANE_HALF * 2, PLANE_HALF * 2), this._planeFill),
    );

    // The grid is drawn one cell oversized and then slid by the pan offset, so
    // the lines stay put in the world while the patch stays on screen. Without
    // that the grid is glued to the screen centre and panning looks broken.
    const reach = PLANE_HALF + GRID_STEP;
    const verts = [];
    for (let v = -reach; v <= reach + 1e-6; v += GRID_STEP) {
      verts.push(-reach, v, 0, reach, v, 0);
      verts.push(v, -reach, 0, v, reach, 0);
    }
    this._planeGrid = new THREE.LineBasicMaterial({
      color: 0x4dd2ff,
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
    });
    this._grid = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute(verts, 3),
      ),
      this._planeGrid,
    );
    this.drawPlane.add(this._grid);
  }

  _setupHandles() {
    // Grabbable ends of an open strand. Drawn on top of everything so you can
    // always get hold of one. Two looks: the end your next stroke attaches to,
    // and an end you could grab instead.
    this.handleGroup = new THREE.Group();
    this.scene.add(this.handleGroup);
    this.handles = [];
    this.hotHandle = null;
    this.liveId = null; // the strand the next stroke will continue
    this._handleGeom = new THREE.SphereGeometry(TUBE_RADIUS * 1.7, 20, 14);
    this._handleMats = {
      idle: new THREE.MeshBasicMaterial({ color: 0x9a938d, depthTest: false }),
      live: new THREE.MeshBasicMaterial({ color: 0xfaf6f3, depthTest: false }),
    };

    // Close enough to act on? A reticle closes around the handle. The ball
    // itself never moves, resizes or changes colour — the ring is drawn in the
    // handle's own colour, so this stays neutral whatever the palette is.
    this._focusRing = new THREE.Mesh(
      new THREE.RingGeometry(TUBE_RADIUS * 2.9, TUBE_RADIUS * 3.3, 48),
      new THREE.MeshBasicMaterial({
        color: 0xfaf6f3,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthTest: false,
      }),
    );
    this._focusRing.renderOrder = 13;
    this._focusRing.visible = false;
    this.scene.add(this._focusRing);
  }

  /** Scale that goes with each handle look. */
  static HANDLE_SCALE = { idle: 0.7, live: 1 };

  // ---------- tools ----------

  setTool(tool) {
    this.tool = tool;
    const armed = tool === 'draw';
    this._planeFill.opacity = armed ? 0.035 : 0.015;
    this._planeGrid.opacity = armed ? 0.15 : 0.05;
    // three.js turns a ROTATE binding into a pan by itself while ⌘/Ctrl/⇧ is
    // held, so the only binding we own is whether left-drag belongs to the
    // camera at all. A stroke tool takes it.
    this.controls.mouseButtons.LEFT = armed || tool === 'erase' ? null : THREE.MOUSE.ROTATE;
    this._applyCursor();
  }

  /** Is a pan modifier held? Cosmetic only — three.js does the actual swap. */
  setPanHint(down) {
    this.panHint = down;
    this._applyCursor();
  }

  setDragging(down) {
    this.dragging = down;
    if (down) this.cancelEase(); // touching the camera wins over a glide
    this._applyCursor();
  }

  _applyCursor() {
    this.canvas.style.cursor =
      this.tool === 'erase' ? 'none'
      : this.tool === 'draw' ? 'crosshair'
      : this.dragging && this.panHint ? 'grabbing'
      : this.panHint || this.hotHandle ? 'grab'
      : 'all-scroll'; // the camera is what a drag moves
  }

  // ---------- draw plane math ----------

  /** The plane parallel to the screen through `anchor` (default: orbit target). */
  drawPlaneObject(anchor = null) {
    const normal = new THREE.Vector3();
    this.camera.getWorldDirection(normal);
    this._plane.setFromNormalAndCoplanarPoint(normal, anchor ?? this.controls.target);
    return this._plane;
  }

  /** World units per screen pixel, measured at the draw plane. */
  worldPerPixel() {
    const dist = this.camera.position.distanceTo(this.controls.target);
    const h = this.canvas.clientHeight || 1;
    return (2 * dist * Math.tan((this.camera.fov * Math.PI) / 360)) / h;
  }

  _rayThrough(px, py) {
    const rect = this.canvas.getBoundingClientRect();
    this._ndc.set(
      ((px - rect.left) / rect.width) * 2 - 1,
      -((py - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this._ndc, this.camera);
    return this.raycaster.ray;
  }

  /**
   * Screen pixels -> a point in space. `depthPixels` lifts the point toward the
   * viewer *along the view ray*, so the point still lands on exactly the pixel
   * you drew — depth is added without the drawing sliding around. `anchor`
   * chooses which parallel plane to land on; extending a strand uses its
   * endpoint so the continuation starts where the strand actually is.
   */
  unproject(px, py, depthPixels = 0, anchor = null) {
    const ray = this._rayThrough(px, py);
    const hit = new THREE.Vector3();
    if (!ray.intersectPlane(this.drawPlaneObject(anchor), hit)) return null;
    if (depthPixels) hit.addScaledVector(ray.direction, -depthPixels * this.worldPerPixel());
    return hit;
  }

  /** World point -> screen pixels. */
  project(v) {
    const rect = this.canvas.getBoundingClientRect();
    const p = v.clone().project(this.camera);
    return [((p.x + 1) / 2) * rect.width, ((1 - p.y) / 2) * rect.height];
  }

  _syncDrawPlaneTransform() {
    const target = this.controls.target;
    this.drawPlane.position.copy(target);
    this.drawPlane.quaternion.copy(this.camera.quaternion);

    // Slide the grid lines so they stay anchored to world coordinates.
    const right = this._tmp.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const u = target.dot(right);
    const up = this._tmp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const v = target.dot(up);
    this._grid.position.set(-mod(u, GRID_STEP), -mod(v, GRID_STEP), 0);
  }

  // ---------- endpoint handles ----------

  /**
   * Open strands that are selected or live get a grabbable ball on each end.
   * The live strand grows from its last point, so that end is the emphasised
   * one — it is where your next stroke will attach.
   */
  updateHandles(model) {
    const liveId = this.liveId;
    this.handles = [];
    for (const curve of model.curves) {
      if (curve.closed) continue;
      if (!this.selection.has(curve.id) && curve.id !== liveId) continue;
      const pts = curve.points;
      const isLive = curve.id === liveId;
      this.handles.push({ curveId: curve.id, end: 'start', position: vec(pts[0]), live: false });
      this.handles.push({
        curveId: curve.id,
        end: 'end',
        position: vec(pts[pts.length - 1]),
        live: isLive,
      });
    }
    this._drawHandles();
  }

  /** Mark the handle the pointer is close enough to act on. */
  setHotHandle(handle) {
    const id = handle ? `${handle.curveId}:${handle.end}` : null;
    if (id === this.hotHandle) return false;
    this.hotHandle = id;
    this._drawHandles();
    this._applyCursor();
    return true;
  }

  _drawHandles() {
    for (const m of this.handleGroup.children) m.visible = false;
    this.handles.forEach((h, i) => {
      let mesh = this.handleGroup.children[i];
      if (!mesh) {
        mesh = new THREE.Mesh(this._handleGeom, this._handleMats.idle);
        mesh.renderOrder = 12;
        this.handleGroup.add(mesh);
      }
      const look = h.live ? 'live' : 'idle';
      mesh.material = this._handleMats[look];
      mesh.scale.setScalar(Viewer.HANDLE_SCALE[look]);
      mesh.position.copy(h.position);
      mesh.visible = true;
    });

    const hot = this.handles.find((h) => `${h.curveId}:${h.end}` === this.hotHandle);
    this._focusRing.visible = Boolean(hot);
    if (hot) {
      this._focusRing.position.copy(hot.position);
      this._focusRing.material.color.copy(this._handleMats[hot.live ? 'live' : 'idle'].color);
    }
  }

  /** The endpoint handle within `tol` pixels of the cursor, if any. */
  hitHandle(px, py, tol = 15) {
    let best = null;
    let bestD = tol;
    for (const h of this.handles) {
      const [hx, hy] = this.project(h.position);
      const d = Math.hypot(hx - px, hy - py);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    return best;
  }

  /** Screen depth of a world point, in pixels — positive is toward the viewer. */
  depthOf(v) {
    return -this.drawPlaneObject().distanceToPoint(v) / this.worldPerPixel();
  }

  /** A curve as the lift wants an obstacle: screen pixels carrying their depth. */
  projectCurve(curve) {
    const out = curve.points.map((p) => {
      const v = vec(p);
      const [x, y] = this.project(v);
      return [x, y, this.depthOf(v)];
    });
    if (curve.closed && out.length) out.push(out[0]);
    return out;
  }

  // ---------- curves ----------

  syncCurves(model) {
    const live = new Set();
    for (const curve of model.curves) {
      live.add(curve.id);
      const existing = this.meshes.get(curve.id);
      if (existing) {
        if (existing.userData.stamp === stampOf(curve)) continue;
        this._disposeMesh(existing);
        this.curveGroup.remove(existing);
      }
      const mesh = buildTubeMesh(curve);
      mesh.userData = { id: curve.id, stamp: stampOf(curve) };
      this.curveGroup.add(mesh);
      this.meshes.set(curve.id, mesh);
    }

    for (const [id, mesh] of this.meshes) {
      if (live.has(id)) continue;
      this._disposeMesh(mesh);
      this.curveGroup.remove(mesh);
      this.meshes.delete(id);
    }

    this.setSelection(this.selection);
    this.updateHandles(model);
  }

  _disposeMesh(mesh) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }

  setSelection(ids) {
    this.selection = new Set([...ids].filter((id) => this.meshes.has(id)));
    for (const [meshId, mesh] of this.meshes) {
      const on = this.selection.has(meshId);
      mesh.material.emissive.set(on ? 0xffffff : 0x000000);
      mesh.material.emissiveIntensity = on ? 0.22 : 0;
    }
  }

  /** Screen pixels -> curve id under the cursor, or null. */
  pick(px, py) {
    this._rayThrough(px, py);
    const hits = this.raycaster.intersectObjects(this.curveGroup.children, false);
    return hits.length ? hits[0].object.userData.id : null;
  }

  /** The camera's own right and forward, as plain arrays. Placement offsets a
   *  loaded shape along the right vector so it lands beside what you're looking
   *  at, whatever angle you happen to be viewing from. */
  right() {
    const v = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    return [v.x, v.y, v.z];
  }

  forward() {
    const v = new THREE.Vector3();
    this.camera.getWorldDirection(v);
    return [v.x, v.y, v.z];
  }

  /** Drop the camera exactly where a saved scene left it. */
  setCamera({ position, target }) {
    this._ease = null;
    this.camera.position.set(...position);
    this.controls.target.set(...target);
  }

  camera3() {
    const p = this.camera.position;
    const t = this.controls.target;
    return { position: [p.x, p.y, p.z], target: [t.x, t.y, t.z] };
  }

  /**
   * Glide the view onto a point over `ms`. Used when something is loaded in
   * beside what's already there: the new shape lands off to one side, and this
   * is what takes you to it.
   *
   * The viewing *direction* never changes — this is a pan, not an orbit. The
   * distance changes only if the arriving shape wouldn't otherwise fit, because
   * loading a big scene into a zoomed-in view would otherwise glide you to a
   * point where you can see nothing.
   */
  easeTo(centre, radius = 0, ms = 1200) {
    const target = new THREE.Vector3(...centre);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    let dist = this.camera.position.distanceTo(this.controls.target);
    if (radius > 0) {
      const needed = (radius * 1.9) / Math.tan((this.camera.fov * Math.PI) / 360);
      dist = Math.max(dist, Math.min(needed, this.controls.maxDistance));
    }
    this._ease = {
      from: { target: this.controls.target.clone(), position: this.camera.position.clone() },
      to: { target, position: target.clone().addScaledVector(dir, dist) },
      start: performance.now(),
      ms,
    };
  }

  /** Any deliberate camera input wins over a glide in progress. */
  cancelEase() {
    this._ease = null;
  }

  _stepEase() {
    if (!this._ease) return;
    const { from, to, start, ms } = this._ease;
    const k = Math.min(1, (performance.now() - start) / ms);
    // Ease in and out, so it starts and stops without a jerk.
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    this.controls.target.lerpVectors(from.target, to.target, e);
    this.camera.position.lerpVectors(from.position, to.position, e);
    if (k >= 1) this._ease = null;
  }

  /** Recentre the camera on everything that's been drawn. */
  frameAll(model) {
    this._ease = null;
    const box = new THREE.Box3();
    let any = false;
    for (const curve of model.curves) {
      for (const p of curve.points) {
        box.expandByPoint(vec(p));
        any = true;
      }
    }
    if (!any) {
      this.controls.target.set(0, 0, 0);
      return;
    }
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 0.8);
    const dist = (radius * 1.9) / Math.tan((this.camera.fov * Math.PI) / 360);

    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(dir, dist);
  }

  // ---------- live stroke preview ----------

  showPreview(points3, closed) {
    this.clearPreview();
    if (points3.length < 2) return;
    const pts = closed ? [...points3, points3[0]] : points3;
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    this.preview = new THREE.Line(
      geom,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }),
    );
    this.preview.renderOrder = 5;
    this.scene.add(this.preview);
  }

  clearPreview() {
    if (!this.preview) return;
    this.preview.geometry.dispose();
    this.preview.material.dispose();
    this.scene.remove(this.preview);
    this.preview = null;
  }

  // ---------- loop ----------

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this._stepEase();
    if (this._focusRing.visible) this._focusRing.quaternion.copy(this.camera.quaternion);
    this.controls.update();
    this._syncDrawPlaneTransform();
    this.renderer.render(this.scene, this.camera);
  }
}

// ---------- helpers ----------

/** [x, y, z] -> Vector3. Exported so main.js needn't import three itself. */
export const vec3 = (p) => new THREE.Vector3(p[0], p[1], p[2]);
const vec = vec3;

function stampOf(curve) {
  const p = curve.points;
  return `${curve.closed}|${curve.color}|${curve.radius}|${p.length}|${p[0]?.join(',')}|${p[p.length - 1]?.join(',')}`;
}

/** Curve record -> smooth three.js curve. Centripetal avoids cusps and loops. */
export function toSpline(curve) {
  return new THREE.CatmullRomCurve3(curve.points.map(vec), curve.closed, 'centripetal', 0.5);
}

/** Dense world-space sample of a curve. Closed curves don't repeat the seam. */
export function sampleCurve(curve, n) {
  if (curve.points.length < 2) return [];
  const pts = toSpline(curve).getSpacedPoints(n);
  return curve.closed ? pts.slice(0, -1) : pts;
}

function buildTubeMesh(curve) {
  const spline = toSpline(curve);
  const segments = Math.max(120, curve.points.length * 12);
  const radius = curve.radius ?? DEFAULT_RADIUS;
  const geom = new THREE.TubeGeometry(spline, segments, radius, 16, curve.closed);
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(curve.color),
    roughness: 0.62,
    metalness: 0.0,
    emissive: new THREE.Color(0x000000),
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export { TUBE_RADIUS };
