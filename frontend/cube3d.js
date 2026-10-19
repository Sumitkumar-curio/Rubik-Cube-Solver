/**
 * Three.js Rubik's cube with layer-turn animation + face highlight.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const FACE_ORDER = ["U", "R", "F", "D", "L", "B"];
const SOLVED = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

const LETTER_HEX = {
  U: 0xf4f4f0,
  R: 0xe23b2f,
  F: 0x2f9e4a,
  D: 0xf0d24a,
  L: 0xf07a2e,
  B: 0x2f6fdb,
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

function parseMove(mv) {
  const face = mv[0];
  let turns = 1;
  if (mv.includes("2")) turns = 2;
  let sign = CW_SIGN[face] ?? -1;
  if (mv.includes("'")) sign *= -1;
  return { face, turns, angle: sign * (Math.PI / 2) * turns };
}

class RubiksViewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.facelets = SOLVED;
    this.speed = 1;
    this.playing = false;
    this.paused = false;
    this._abortPlay = false;
    this.cubies = [];
    this.pivot = null;
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

    const amb = new THREE.AmbientLight(0xffffff, 0.72);
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(5, 8, 4);
    const fill = new THREE.DirectionalLight(0x7ec8ff, 0.25);
    fill.position.set(-4, -2, -3);
    this.scene.add(amb, dir, fill);

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
    // colors: {R,L,U,D,F,B} hex or null for internal
    return MAT_FACE.map((f) => {
      const hex = colors[f];
      if (hex == null) {
        return new THREE.MeshBasicMaterial({ color: 0x111111 });
      }
      return new THREE.MeshStandardMaterial({
        color: hex,
        roughness: 0.45,
        metalness: 0.08,
      });
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
          if (x === 1) colors.R = LETTER_HEX.R;
          if (x === -1) colors.L = LETTER_HEX.L;
          if (y === 1) colors.U = LETTER_HEX.U;
          if (y === -1) colors.D = LETTER_HEX.D;
          if (z === 1) colors.F = LETTER_HEX.F;
          if (z === -1) colors.B = LETTER_HEX.B;
          const mesh = new THREE.Mesh(geo, this._makeMaterials(colors));
          mesh.position.set(x * gap, y * gap, z * gap);
          mesh.userData = { ox: x, oy: y, oz: z };
          // edge lines
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
   * Maps stickers onto cubie face materials by world position.
   */
  paint(facelets) {
    this.facelets = facelets;
    // Reset materials from facelet map for each outer face sticker
    // Simpler approach: derive color at each cubie face from facelets grid
    const faceMaps = {
      U: facelets.slice(0, 9),
      R: facelets.slice(9, 18),
      F: facelets.slice(18, 27),
      D: facelets.slice(27, 36),
      L: facelets.slice(36, 45),
      B: facelets.slice(45, 54),
    };

    // Kociemba face layouts (row-major, looking at that face)
    const idx = (row, col) => row * 3 + col;

    for (const mesh of this.cubies) {
      const x = Math.round(mesh.position.x / 1.02);
      const y = Math.round(mesh.position.y / 1.02);
      const z = Math.round(mesh.position.z / 1.02);
      mesh.position.set(x * 1.02, y * 1.02, z * 1.02);
      mesh.rotation.set(0, 0, 0);
      mesh.quaternion.identity();
      mesh.userData = { ox: x, oy: y, oz: z };

      const colors = { R: null, L: null, U: null, D: null, F: null, B: null };
      // U: looking down, x→right, z→front (bottom of diagram)
      if (y === 1) colors.U = LETTER_HEX[faceMaps.U[idx(z + 1, x + 1)]];
      // D: looking up from below, x→right, z→back relative to standard? looking at D with F on top of diagram:
      // Kociemba D: row0 near F → z=+1 is top when looking at D from below with F away... 
      // Standard: looking at D, F is top of face diagram → z=+1 → row 0
      if (y === -1) colors.D = LETTER_HEX[faceMaps.D[idx(1 - z, x + 1)]];
      // F: x→right, y→up
      if (z === 1) colors.F = LETTER_HEX[faceMaps.F[idx(1 - y, x + 1)]];
      // B: looking at back, x increases left (so -x), y up
      if (z === -1) colors.B = LETTER_HEX[faceMaps.B[idx(1 - y, 1 - x)]];
      // R: looking at right, z increases left (F left), y up → col from -z
      if (x === 1) colors.R = LETTER_HEX[faceMaps.R[idx(1 - y, 1 - z)]];
      // L: looking at left, z increases right (F right), y up
      if (x === -1) colors.L = LETTER_HEX[faceMaps.L[idx(1 - y, z + 1)]];

      // Dispose old materials
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose?.());
      }
      mesh.material = this._makeMaterials(colors);
    }
  }

  setSpeed(s) {
    this.speed = Math.max(0.25, Math.min(3, s));
  }

  _layerCubies(face) {
    const axis = face === "U" || face === "D" ? "oy"
      : face === "R" || face === "L" ? "ox" : "oz";
    const val = face === "U" || face === "R" || face === "F" ? 1 : -1;
    return this.cubies.filter((c) => {
      const p = Math.round(c.position[axis === "ox" ? "x" : axis === "oy" ? "y" : "z"] / 1.02);
      return p === val;
    });
  }

  _highlight(face, on) {
    const layer = this._layerCubies(face);
    for (const mesh of this.cubies) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m.emissive) m.emissive.setHex(0x000000);
      }
    }
    if (!on) return;
    for (const mesh of layer) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m.emissive) m.emissive.setHex(0x334411);
      }
    }
  }

  async animateMove(mv) {
    const { face, angle } = parseMove(mv);
    this._highlight(face, true);
    const layer = this._layerCubies(face);
    const pivot = new THREE.Group();
    this.cubeRoot.add(pivot);
    for (const c of layer) {
      this.cubeRoot.remove(c);
      pivot.add(c);
    }

    const axis = FACE_AXIS[face].clone();
    // Base ~700ms at 1× — teaching-friendly; speed slider scales this
    const duration = (700 / this.speed) * (Math.abs(angle) > 2 ? 1.4 : 1);
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
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        pivot.quaternion.slerpQuaternions(startQuat, endQuat, e);
        if (t < 1) requestAnimationFrame(step);
        else {
          finish();
          resolve();
        }
      };
      const finish = () => {
        // Bake transforms back to cubeRoot
        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        for (const c of [...pivot.children]) {
          c.getWorldPosition(worldPos);
          c.getWorldQuaternion(worldQuat);
          pivot.remove(c);
          this.cubeRoot.add(c);
          c.position.copy(worldPos);
          c.quaternion.copy(worldQuat);
          // Snap position to grid
          c.position.x = Math.round(c.position.x / 1.02) * 1.02;
          c.position.y = Math.round(c.position.y / 1.02) * 1.02;
          c.position.z = Math.round(c.position.z / 1.02) * 1.02;
          // Snap rotation to 90°
          c.rotation.x = Math.round(c.rotation.x / (Math.PI / 2)) * (Math.PI / 2);
          c.rotation.y = Math.round(c.rotation.y / (Math.PI / 2)) * (Math.PI / 2);
          c.rotation.z = Math.round(c.rotation.z / (Math.PI / 2)) * (Math.PI / 2);
        }
        this.cubeRoot.remove(pivot);
        this._highlight(face, false);
      };
      requestAnimationFrame(step);
    });
  }

  async play(startFacelets, moves, { onStep } = {}) {
    this._abortPlay = false;
    this.playing = true;
    this.paused = false;
    this.paint(startFacelets);
    let current = startFacelets;
    try {
      for (let i = 0; i < moves.length; i++) {
        while (this.paused && !this._abortPlay) {
          await sleep(50);
        }
        if (this._abortPlay) break;
        const mv = moves[i];
        if (onStep) onStep(i, mv, FACE_NAMES[mv[0]] || mv[0]);
        await this.animateMove(mv);
        // Sync logical state from server for color accuracy every few moves
        current = await applyOnServer(current, [mv]);
        // Re-paint occasionally to avoid drift (every move is safest for colors)
        this.paint(current);
      }
    } finally {
      this.playing = false;
      this.paused = false;
    }
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; }
  stop() { this._abortPlay = true; this.paused = false; }

  async stepOnce(facelets, move) {
    this._highlight(move[0], true);
    await this.animateMove(move);
    const next = await applyOnServer(facelets, [move]);
    this.paint(next);
    return next;
  }

  _tick() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this._tick());
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function applyOnServer(facelets, moves) {
  const res = await fetch("/api/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ facelets, moves }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Apply failed");
  return data.facelets;
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
    getFacelets: () => viewer.facelets,
    get playing() { return viewer.playing; },
    get paused() { return viewer.paused; },
    FACE_NAMES,
    SOLVED,
  };
  return window.Cube3D;
}

