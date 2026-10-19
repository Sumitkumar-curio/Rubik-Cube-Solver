/**
 * Three.js Rubik's cube — physical layer turns.
 *
 * Stickers are painted ONCE from the user's captured colors, then each move
 * rotates cubie meshes in place (bake). We never re-paint after a turn —
 * that was the "colors changing" bug (repaint fought the rotation).
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const FACE_ORDER = ["U", "R", "F", "D", "L", "B"];
const SOLVED = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

/** Default Western scheme (demo / before user capture). */
export const DEFAULT_LETTER_HEX = {
  U: 0xf4f4f0, // white
  R: 0xe23b2f, // red
  F: 0x2f9e4a, // green
  D: 0xf0d24a, // yellow
  L: 0xf07a2e, // orange
  B: 0x2f6fdb, // blue
};

const FACE_AXIS = {
  U: new THREE.Vector3(0, 1, 0),
  D: new THREE.Vector3(0, -1, 0),
  R: new THREE.Vector3(1, 0, 0),
  L: new THREE.Vector3(-1, 0, 0),
  F: new THREE.Vector3(0, 0, 1),
  B: new THREE.Vector3(0, 0, -1),
};

const FACE_NAMES = {
  U: "UP / TOP",
  D: "DOWN / BOTTOM",
  F: "FRONT",
  B: "BACK",
  R: "RIGHT",
  L: "LEFT",
};

// Cubie face materials order: +x -x +y -y +z -z  → R L U D F B
const MAT_FACE = ["R", "L", "U", "D", "F", "B"];

// CW quarter-turn sign around each face's outward axis (Three.js Y-up)
const CW_SIGN = { U: -1, D: 1, R: -1, L: 1, F: -1, B: 1 };

/**
 * Facelet source index for a CW quarter turn: new[t] = old[FACELET_SRC_CW[face][t]].
 * Verified against backend apply_moves for all 18 moves.
 */
const FACELET_SRC_CW = {
  U: [6,3,0,7,4,1,8,5,2,45,46,47,12,13,14,15,16,17,9,10,11,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,18,19,20,39,40,41,42,43,44,36,37,38,48,49,50,51,52,53],
  R: [0,1,20,3,4,23,6,7,26,15,12,9,16,13,10,17,14,11,18,19,29,21,22,32,24,25,35,27,28,51,30,31,48,33,34,45,36,37,38,39,40,41,42,43,44,8,46,47,5,49,50,2,52,53],
  F: [0,1,2,3,4,5,44,41,38,6,10,11,7,13,14,8,16,17,24,21,18,25,22,19,26,23,20,15,12,9,30,31,32,33,34,35,36,37,27,39,40,28,42,43,29,45,46,47,48,49,50,51,52,53],
  D: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,24,25,26,18,19,20,21,22,23,42,43,44,33,30,27,34,31,28,35,32,29,36,37,38,39,40,41,51,52,53,45,46,47,48,49,50,15,16,17],
  L: [53,1,2,50,4,5,47,7,8,9,10,11,12,13,14,15,16,17,0,19,20,3,22,23,6,25,26,18,28,29,21,31,32,24,34,35,42,39,36,43,40,37,44,41,38,45,46,33,48,49,30,51,52,27],
  B: [11,14,17,3,4,5,6,7,8,9,10,35,12,13,34,15,16,33,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,36,39,42,2,37,38,1,40,41,0,43,44,51,48,45,52,49,46,53,50,47],
};

/** Apply one move to a facelet string locally (no network). */
export function applyMoveLocal(facelets, mv) {
  if (!facelets || facelets.length !== 54) throw new Error("facelets must be 54 chars");
  const face = mv[0];
  const src = FACELET_SRC_CW[face];
  if (!src) throw new Error(`Unknown move ${mv}`);
  let turns = 1;
  if (mv.includes("2")) turns = 2;
  else if (mv.includes("'")) turns = 3; // CCW = 3× CW
  let cur = facelets;
  for (let t = 0; t < turns; t++) {
    let next = "";
    for (let i = 0; i < 54; i++) next += cur[src[i]];
    cur = next;
  }
  return cur;
}

export function applyMovesLocal(facelets, moves) {
  return (moves || []).reduce((fl, mv) => applyMoveLocal(fl, mv), facelets);
}

/** Build [start, after1, after2, …] for the whole solution sequence. */
export function buildFaceletHistory(startFacelets, moves) {
  const hist = [startFacelets];
  let cur = startFacelets;
  for (const mv of moves || []) {
    cur = applyMoveLocal(cur, mv);
    hist.push(cur);
  }
  return hist;
}

function parseMove(mv) {
  const face = mv[0];
  let turns = 1;
  if (mv.includes("2")) turns = 2;
  let sign = CW_SIGN[face] ?? -1;
  if (mv.includes("'")) sign *= -1;
  return { face, turns, angle: sign * (Math.PI / 2) * turns };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

class RubiksViewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.facelets = SOLVED;
    /** Face letter → sticker hex; updated from user's captured centers */
    this.letterHex = { ...DEFAULT_LETTER_HEX };
    this.speed = 1;
    this.playing = false;
    this.paused = false;
    this._abortPlay = false;
    this.cubies = [];
    this.onMove = null;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(4.2, 3.4, 5.2);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 14;
    this.controls.target.set(0, 0, 0);

    // No directional lights — stickers use unlit materials so rotation
    // never changes perceived brightness (that looked like “color change”).
    this.scene.add(new THREE.AmbientLight(0xffffff, 1));

    this.cubeRoot = new THREE.Group();
    this.scene.add(this.cubeRoot);
    this._buildCubies();
    this.paint(SOLVED);

    this._resize();
    window.addEventListener("resize", () => this._resize());
    this._tick();
  }

  _resize() {
    const parent = this.canvas.parentElement;
    const w = parent.clientWidth || 400;
    const h = parent.clientHeight || 400;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _makeMaterials(colors) {
    // MeshBasicMaterial = flat color, ignores scene lights.
    // MeshStandardMaterial was shading faces darker/lighter as they turned.
    return MAT_FACE.map((f) => {
      const hex = colors[f];
      const mat = new THREE.MeshBasicMaterial({
        color: hex == null ? 0x111111 : hex,
      });
      mat.userData.baseColor = hex == null ? 0x111111 : hex;
      mat.userData.isSticker = hex != null;
      return mat;
    });
  }

  _buildCubies() {
    const size = 0.92;
    const gap = 1.02;
    const geo = new THREE.BoxGeometry(size, size, size);
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue;
          const colors = { R: null, L: null, U: null, D: null, F: null, B: null };
          if (x === 1) colors.R = DEFAULT_LETTER_HEX.R;
          if (x === -1) colors.L = DEFAULT_LETTER_HEX.L;
          if (y === 1) colors.U = DEFAULT_LETTER_HEX.U;
          if (y === -1) colors.D = DEFAULT_LETTER_HEX.D;
          if (z === 1) colors.F = DEFAULT_LETTER_HEX.F;
          if (z === -1) colors.B = DEFAULT_LETTER_HEX.B;
          const mesh = new THREE.Mesh(geo, this._makeMaterials(colors));
          mesh.position.set(x * gap, y * gap, z * gap);
          // bx/by/bz = birth slot (for paint). ox/oy/oz = current grid (for turns).
          mesh.userData = { bx: x, by: y, bz: z, ox: x, oy: y, oz: z };
          const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(geo),
            new THREE.LineBasicMaterial({ color: 0x0a0e0c })
          );
          mesh.add(edges);
          this.cubeRoot.add(mesh);
          this.cubies.push(mesh);
        }
      }
    }
  }

  /**
   * Paint from 54-char facelet string (URFDLB order).
   * ONLY call at scramble start / Reset / jump — never after a turn.
   */
  paint(facelets) {
    this.facelets = facelets;
    const faceMaps = {
      U: facelets.slice(0, 9),
      R: facelets.slice(9, 18),
      F: facelets.slice(18, 27),
      D: facelets.slice(27, 36),
      L: facelets.slice(36, 45),
      B: facelets.slice(45, 54),
    };

    const idx = (row, col) => row * 3 + col;
    const gap = 1.02;

    for (const mesh of this.cubies) {
      // Always paint on birth slots, then clear baked rotation.
      // This is how Reset / jump / scramble rebuild a consistent cube.
      const x = mesh.userData.bx;
      const y = mesh.userData.by;
      const z = mesh.userData.bz;
      mesh.position.set(x * gap, y * gap, z * gap);
      mesh.rotation.set(0, 0, 0);
      mesh.quaternion.identity();
      mesh.userData.ox = x;
      mesh.userData.oy = y;
      mesh.userData.oz = z;

      const hex = this.letterHex;
      const colors = { R: null, L: null, U: null, D: null, F: null, B: null };
      if (y === 1) colors.U = hex[faceMaps.U[idx(z + 1, x + 1)]];
      if (y === -1) colors.D = hex[faceMaps.D[idx(1 - z, x + 1)]];
      if (z === 1) colors.F = hex[faceMaps.F[idx(1 - y, x + 1)]];
      if (z === -1) colors.B = hex[faceMaps.B[idx(1 - y, 1 - x)]];
      if (x === 1) colors.R = hex[faceMaps.R[idx(1 - y, 1 - z)]];
      if (x === -1) colors.L = hex[faceMaps.L[idx(1 - y, z + 1)]];

      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose?.());
      }
      mesh.material = this._makeMaterials(colors);
    }
  }

  setSpeed(s) {
    this.speed = Math.max(0.25, Math.min(3, s));
  }

  /**
   * Map face letters (U/R/F/D/L/B) to real sticker colors from the user's cube.
   * Call before paint() so the 3D cube matches the physical cube.
   */
  setColorScheme(letterToHex) {
    if (!letterToHex) {
      this.letterHex = { ...DEFAULT_LETTER_HEX };
      return;
    }
    const next = { ...DEFAULT_LETTER_HEX };
    for (const f of FACE_ORDER) {
      if (letterToHex[f] == null) continue;
      let v = letterToHex[f];
      if (typeof v === "string") {
        v = v.trim();
        if (v.startsWith("#")) v = parseInt(v.slice(1), 16);
        else v = parseInt(v, 16);
      }
      if (Number.isFinite(v)) next[f] = v;
    }
    this.letterHex = next;
  }

  resetColorScheme() {
    this.letterHex = { ...DEFAULT_LETTER_HEX };
  }

  _layerCubies(face) {
    const gap = 1.02;
    const axis = face === "U" || face === "D" ? "y"
      : face === "R" || face === "L" ? "x" : "z";
    const val = face === "U" || face === "R" || face === "F" ? 1 : -1;
    return this.cubies.filter((c) => {
      const ud = c.userData || {};
      const key = axis === "x" ? "ox" : axis === "y" ? "oy" : "oz";
      if (ud[key] != null) return ud[key] === val;
      return Math.round(c.position[axis] / gap) === val;
    });
  }

  /** Snap cubie to grid after a baked turn — keep quaternion (stickers stay put). */
  _bakeCubie(mesh) {
    const gap = 1.02;
    mesh.position.x = Math.round(mesh.position.x / gap) * gap;
    mesh.position.y = Math.round(mesh.position.y / gap) * gap;
    mesh.position.z = Math.round(mesh.position.z / gap) * gap;
    const e = new THREE.Euler().setFromQuaternion(mesh.quaternion, "XYZ");
    const snap = (r) => Math.round(r / (Math.PI / 2)) * (Math.PI / 2);
    e.x = snap(e.x);
    e.y = snap(e.y);
    e.z = snap(e.z);
    mesh.quaternion.setFromEuler(e);
    // Keep birth bx/by/bz; update current ox/oy/oz for the next layer pick.
    mesh.userData.ox = Math.round(mesh.position.x / gap);
    mesh.userData.oy = Math.round(mesh.position.y / gap);
    mesh.userData.oz = Math.round(mesh.position.z / gap);
  }

  _highlight(face, on) {
    const layer = new Set(this._layerCubies(face));
    const accent = new THREE.Color(0xc8f542);
    for (const mesh of this.cubies) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const active = on && layer.has(mesh);
      for (const m of mats) {
        const base = m.userData.baseColor;
        if (base == null) continue;
        if (active && m.userData.isSticker) {
          m.color.setHex(base).lerp(accent, 0.22);
        } else {
          m.color.setHex(base);
        }
      }
    }
  }

  /**
   * Animate a face turn and BAKE transforms in place.
   * Do NOT paint() after — stickers ride with the cubies.
   */
  async animateMove(mv, endFacelets = null) {
    const { face, angle } = parseMove(mv);
    this._highlight(face, true);
    const layer = this._layerCubies(face);
    const pivot = new THREE.Group();
    this.cubeRoot.add(pivot);
    // attach() keeps world transform (add/remove would snap stickers wrong)
    for (const c of layer) {
      pivot.attach(c);
    }

    const axis = FACE_AXIS[face].clone();
    const duration = (420 / this.speed) * (Math.abs(angle) > 2 ? 1.25 : 1);
    const start = performance.now();
    const startQuat = pivot.quaternion.clone();
    const endQuat = new THREE.Quaternion().setFromAxisAngle(axis, angle).multiply(startQuat);

    await new Promise((resolve) => {
      const step = (now) => {
        if (this._abortPlay) {
          pivot.quaternion.copy(endQuat);
          finish();
          resolve();
          return;
        }
        const t = Math.min(1, (now - start) / duration);
        const e = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
        pivot.quaternion.slerpQuaternions(startQuat, endQuat, e);
        if (t < 1) requestAnimationFrame(step);
        else {
          finish();
          resolve();
        }
      };
      const finish = () => {
        pivot.quaternion.copy(endQuat);
        for (const c of layer) {
          this.cubeRoot.attach(c); // bake world pos/rot into cube root
          this._bakeCubie(c);
        }
        this.cubeRoot.remove(pivot);
        this._highlight(face, false);
        if (endFacelets) this.facelets = endFacelets;
        // Never paint() here — stickers already rode with the mesh.
      };
      requestAnimationFrame(step);
    });
  }

  async play(startFacelets, moves, { onStep, onAfterMove, skipInitialPaint = false } = {}) {
    this._abortPlay = false;
    this.playing = true;
    this.paused = false;
    // Full paint ONLY at the start of a play-from-origin sequence
    if (!skipInitialPaint) this.paint(startFacelets);
    let current = startFacelets;
    try {
      for (let i = 0; i < moves.length; i++) {
        while (this.paused && !this._abortPlay) {
          await sleep(40);
        }
        if (this._abortPlay) break;
        const mv = moves[i];
        const next = applyMoveLocal(current, mv);
        if (onStep) onStep(i, mv, FACE_NAMES[mv[0]] || mv[0]);
        await this.animateMove(mv, next);
        if (this._abortPlay) break;
        current = next;
        this.facelets = current;
        if (onAfterMove) onAfterMove(i, current, mv);
      }
    } finally {
      this.playing = false;
      this.paused = false;
      this._abortPlay = false;
    }
    return current;
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; this._abortPlay = false; }
  stop() { this._abortPlay = true; this.paused = false; }

  async stepOnce(facelets, move) {
    this._abortPlay = false;
    const next = applyMoveLocal(facelets, move);
    await this.animateMove(move, next);
    return next;
  }

  async waitUntilIdle() {
    const t0 = performance.now();
    while (this.playing && performance.now() - t0 < 8000) {
      await sleep(40);
    }
  }

  _tick() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this._tick());
  }
}

let viewer = null;

export function initCube3D(canvasId = "cube-canvas") {
  const canvas = document.getElementById(canvasId);
  viewer = new RubiksViewer(canvas);
  window.Cube3D = {
    paint: (f) => viewer.paint(f),
    play: (...a) => viewer.play(...a),
    pause: () => viewer.pause(),
    resume: () => viewer.resume(),
    stop: () => viewer.stop(),
    stepOnce: (...a) => viewer.stepOnce(...a),
    setSpeed: (s) => viewer.setSpeed(s),
    setColorScheme: (m) => viewer.setColorScheme(m),
    resetColorScheme: () => viewer.resetColorScheme(),
    getColorScheme: () => ({ ...viewer.letterHex }),
    getFacelets: () => viewer.facelets,
    waitUntilIdle: () => viewer.waitUntilIdle(),
    get playing() { return viewer.playing; },
    get paused() { return viewer.paused; },
    FACE_NAMES,
    SOLVED,
    DEFAULT_LETTER_HEX,
    applyMoveLocal,
    applyMovesLocal,
    buildFaceletHistory,
  };
  return window.Cube3D;
}
