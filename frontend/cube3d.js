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

/** Absolute sticker color names → hex (never remap through U/R/F letters). */
export const NAME_TO_HEX = {
  white: 0xf4f4f0,
  yellow: 0xf0d24a,
  red: 0xe23b2f,
  orange: 0xf07a2e,
  blue: 0x2f6fdb,
  green: 0x2f9e4a,
};

const COLOR_ALIASES = {
  white: "white", w: "white",
  yellow: "yellow", y: "yellow",
  red: "red",
  orange: "orange", o: "orange",
  blue: "blue",
  green: "green", g: "green",
};

export function normalizeColorName(c) {
  if (c == null) return null;
  return COLOR_ALIASES[String(c).trim().toLowerCase()] || null;
}

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

/**
 * CW quarter-turn around each face's OUTWARD axis (Three.js right-hand).
 * When viewing a face from outside you look against the outward axis, so
 * +angle around the outward axis appears CW. These signs must match
 * FACELET_SRC_CW — the old inverted set left the cube unsolved after Play.
 */
const CW_SIGN = { U: 1, D: -1, R: 1, L: -1, F: 1, B: -1 };

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

/** Permute any 54-length array (facelet chars or color names) by one move. */
export function applyMoveToArray(arr, mv) {
  if (!arr || arr.length !== 54) throw new Error("need 54 stickers");
  const face = mv[0];
  const src = FACELET_SRC_CW[face];
  if (!src) throw new Error(`Unknown move ${mv}`);
  let turns = 1;
  if (mv.includes("2")) turns = 2;
  else if (mv.includes("'")) turns = 3; // CCW = 3× CW
  let cur = Array.isArray(arr) ? arr.slice() : [...arr];
  for (let t = 0; t < turns; t++) {
    const next = new Array(54);
    for (let i = 0; i < 54; i++) next[i] = cur[src[i]];
    cur = next;
  }
  return cur;
}

/** Apply one move to a facelet string locally (no network). */
export function applyMoveLocal(facelets, mv) {
  return applyMoveToArray([...facelets], mv).join("");
}

export function applyMovesLocal(facelets, moves) {
  return (moves || []).reduce((fl, mv) => applyMoveLocal(fl, mv), facelets);
}

export function applyMoveColors(colors54, mv) {
  return applyMoveToArray(colors54, mv);
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

/** Absolute color-name history — used for Prev/Reset without letter remap. */
export function buildColorHistory(startColors54, moves) {
  const hist = [startColors54.slice()];
  let cur = startColors54.slice();
  for (const mv of moves || []) {
    cur = applyMoveColors(cur, mv);
    hist.push(cur.slice());
  }
  return hist;
}

/** faces {U:[9 names],…} → 54 color names in URFDLB order */
export function facesToColors54(faceMap) {
  const out = [];
  for (const f of FACE_ORDER) {
    const arr = faceMap[f];
    if (!arr || arr.length !== 9) throw new Error(`Face ${f} needs 9 colors`);
    for (const c of arr) {
      const n = normalizeColorName(c);
      if (!n) throw new Error(`Unknown color '${c}' on ${f}`);
      out.push(n);
    }
  }
  return out;
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
   * Core painter: 6 faces × 9 hex colors. Resets cubies to birth slots.
   * ONLY for scramble start / Reset / jump — NEVER after a live turn
   * (that rewrote stickers and looked like a “false cube”).
   */
  _paintHexFaces(faceHexMaps) {
    const idx = (row, col) => row * 3 + col;
    const gap = 1.02;

    for (const mesh of this.cubies) {
      const x = mesh.userData.bx;
      const y = mesh.userData.by;
      const z = mesh.userData.bz;
      mesh.position.set(x * gap, y * gap, z * gap);
      mesh.rotation.set(0, 0, 0);
      mesh.quaternion.identity();
      mesh.userData.ox = x;
      mesh.userData.oy = y;
      mesh.userData.oz = z;

      const colors = { R: null, L: null, U: null, D: null, F: null, B: null };
      if (y === 1) colors.U = faceHexMaps.U[idx(z + 1, x + 1)];
      if (y === -1) colors.D = faceHexMaps.D[idx(1 - z, x + 1)];
      if (z === 1) colors.F = faceHexMaps.F[idx(1 - y, x + 1)];
      if (z === -1) colors.B = faceHexMaps.B[idx(1 - y, 1 - x)];
      if (x === 1) colors.R = faceHexMaps.R[idx(1 - y, 1 - z)];
      if (x === -1) colors.L = faceHexMaps.L[idx(1 - y, z + 1)];

      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose?.());
      }
      mesh.material = this._makeMaterials(colors);
    }
  }

  /** Paint 54 absolute color names (URFDLB order) — no letter remap. */
  paintColors(colors54) {
    if (!colors54 || colors54.length !== 54) throw new Error("need 54 colors");
    const names = colors54.map((c, i) => {
      const n = normalizeColorName(c);
      if (!n || NAME_TO_HEX[n] == null) throw new Error(`Invalid color at ${i}: ${c}`);
      return n;
    });
    const faceHexMaps = {
      U: names.slice(0, 9).map((n) => NAME_TO_HEX[n]),
      R: names.slice(9, 18).map((n) => NAME_TO_HEX[n]),
      F: names.slice(18, 27).map((n) => NAME_TO_HEX[n]),
      D: names.slice(27, 36).map((n) => NAME_TO_HEX[n]),
      L: names.slice(36, 45).map((n) => NAME_TO_HEX[n]),
      B: names.slice(45, 54).map((n) => NAME_TO_HEX[n]),
    };
    this._paintHexFaces(faceHexMaps);
  }

  /**
   * Paint from captured absolute color names {U:[9],…}.
   * This is the real cube — stickers never go through U/R/F letter remap.
   */
  paintAbsoluteColors(faceMap) {
    const cols = facesToColors54(faceMap);
    // Lock letterHex from centers so any facelet paint stays consistent
    const centers = {};
    for (const f of FACE_ORDER) centers[f] = normalizeColorName(faceMap[f][4]);
    const letterHex = {};
    for (const f of FACE_ORDER) letterHex[f] = NAME_TO_HEX[centers[f]];
    this.letterHex = letterHex;

    const colorToFace = {};
    FACE_ORDER.forEach((face) => { colorToFace[centers[face]] = face; });
    this.facelets = FACE_ORDER.map((f) =>
      faceMap[f].map((c) => colorToFace[normalizeColorName(c)]).join("")
    ).join("");

    this.paintColors(cols);
  }

  /**
   * Paint from 54-char facelet string (URFDLB order) using locked letterHex.
   * Prefer paintAbsoluteColors for the user's photo cube.
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
    const hex = this.letterHex;
    const faceHexMaps = {};
    for (const f of FACE_ORDER) {
      faceHexMaps[f] = [...faceMaps[f]].map((ch) => hex[ch] ?? 0x444444);
    }
    this._paintHexFaces(faceHexMaps);
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

  /** Pick the 9 cubies on a face using live world positions (reliable after turns). */
  _layerCubies(face) {
    const gap = 1.02;
    const axis = face === "U" || face === "D" ? "y"
      : face === "R" || face === "L" ? "x" : "z";
    const val = face === "U" || face === "R" || face === "F" ? 1 : -1;
    const world = new THREE.Vector3();
    return this.cubies.filter((c) => {
      c.updateWorldMatrix(true, false);
      c.getWorldPosition(world);
      return Math.round(world[axis] / gap) === val;
    });
  }

  /**
   * Snap position to grid + snap orientation to nearest 90° axes.
   * IMPORTANT: do NOT snap via Euler XYZ — that corrupts stickers after a few turns
   * and looks like “colors changing”. Snap the rotation basis instead.
   */
  _bakeCubie(mesh) {
    const gap = 1.02;
    mesh.position.x = Math.round(mesh.position.x / gap) * gap;
    mesh.position.y = Math.round(mesh.position.y / gap) * gap;
    mesh.position.z = Math.round(mesh.position.z / gap) * gap;

    mesh.updateMatrix();
    const x = new THREE.Vector3();
    const y = new THREE.Vector3();
    const z = new THREE.Vector3();
    mesh.matrix.extractBasis(x, y, z);

    const snapAxis = (v) => {
      const ax = Math.abs(v.x);
      const ay = Math.abs(v.y);
      const az = Math.abs(v.z);
      if (ax >= ay && ax >= az) v.set(Math.sign(v.x) || 1, 0, 0);
      else if (ay >= az) v.set(0, Math.sign(v.y) || 1, 0);
      else v.set(0, 0, Math.sign(v.z) || 1);
    };
    snapAxis(x);
    snapAxis(y);
    // Rebuild a right-handed orthonormal basis so stickers stay correct
    z.crossVectors(x, y).normalize();
    y.crossVectors(z, x).normalize();
    const mat = new THREE.Matrix4().makeBasis(x, y, z);
    mesh.quaternion.setFromRotationMatrix(mat);
    mesh.rotation.setFromQuaternion(mesh.quaternion);

    mesh.userData.ox = Math.round(mesh.position.x / gap);
    mesh.userData.oy = Math.round(mesh.position.y / gap);
    mesh.userData.oz = Math.round(mesh.position.z / gap);
  }

  /**
   * Rotate ONE face only. Stickers stay on the cubie materials — we NEVER
   * paint() here (repainting was the “false cube / random colors” bug).
   * CW_SIGN matches FACELET_SRC_CW so the cube still reaches solved.
   */
  async animateMove(mv, endFacelets = null) {
    const { face, angle } = parseMove(mv);
    const layer = this._layerCubies(face);
    if (layer.length !== 9) {
      console.warn(`[Cube3D] expected 9 cubies on ${face}, got ${layer.length}`);
    }

    const pivot = new THREE.Group();
    pivot.position.set(0, 0, 0);
    pivot.quaternion.identity();
    this.cubeRoot.add(pivot);

    for (const c of layer) {
      pivot.attach(c);
    }

    const axis = FACE_AXIS[face].clone();
    const duration = (420 / this.speed) * (Math.abs(angle) > 2 ? 1.25 : 1);
    const t0 = performance.now();
    const q0 = pivot.quaternion.clone();
    const q1 = new THREE.Quaternion().setFromAxisAngle(axis, angle).multiply(q0);

    await new Promise((resolve) => {
      const step = (now) => {
        if (this._abortPlay) {
          pivot.quaternion.copy(q1);
          finish();
          resolve();
          return;
        }
        const t = Math.min(1, (now - t0) / duration);
        const e = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
        pivot.quaternion.slerpQuaternions(q0, q1, e);
        if (t < 1) requestAnimationFrame(step);
        else {
          finish();
          resolve();
        }
      };
      const finish = () => {
        pivot.quaternion.copy(q1);
        for (const c of layer) {
          this.cubeRoot.attach(c);
          this._bakeCubie(c); // keep same materials — only pose updates
        }
        this.cubeRoot.remove(pivot);
        if (endFacelets) this.facelets = endFacelets;
      };
      requestAnimationFrame(step);
    });
  }

  async play(startFacelets, moves, { onStep, onAfterMove, skipInitialPaint = true } = {}) {
    this._abortPlay = false;
    this.playing = true;
    this.paused = false;
    // Default: do NOT repaint — stickers were set from absolute photo colors.
    // Only paint(facelets) when caller explicitly sets skipInitialPaint=false
    // (legacy); that path remaps via letters and must be avoided for user cubes.
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
    paintColors: (c) => viewer.paintColors(c),
    paintAbsoluteColors: (m) => viewer.paintAbsoluteColors(m),
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
    NAME_TO_HEX,
    applyMoveLocal,
    applyMovesLocal,
    applyMoveColors,
    buildFaceletHistory,
    buildColorHistory,
    facesToColors54,
  };
  return window.Cube3D;
}
