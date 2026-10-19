import { initCube3D } from "./cube3d.js";
import { showTeach, hideTeach, stageAtIndex } from "./teach.js";

const { FACE_ORDER, FACE_HINTS, COLOR_HEX, readFaceColors, readFaceFromVideo } =
  window.CubeVision;

const faces = Object.fromEntries(FACE_ORDER.map((f) => [f, null]));
let lastSolution = null;
let scrambleFacelets = null; // immutable scramble start
let lastFacelets = null;
let playIndex = 0;
let brush = "white";
let camStream = null;
let camFace = "U";
let camFacing = "environment";

const toastEl = document.getElementById("toast");

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => {
    toastEl.hidden = true;
  }, 4200);
}

function selectedMethod() {
  return document.querySelector('input[name="method"]:checked')?.value || "kociemba";
}

function allFacesReady() {
  return FACE_ORDER.every((f) => faces[f]?.length === 9);
}

function updateSolveBtn() {
  document.getElementById("btn-solve").disabled = !allFacesReady();
}

function setSolving(on, text) {
  document.getElementById("solving").hidden = !on;
  if (text) document.getElementById("solving-text").textContent = text;
}

function localColorsToFacelets(faceMap) {
  const colorToFace = {};
  FACE_ORDER.forEach((f) => {
    colorToFace[faceMap[f][4]] = f;
  });
  let out = "";
  FACE_ORDER.forEach((f) => {
    faceMap[f].forEach((c) => {
      if (!colorToFace[c]) throw new Error(`Color ${c} missing from centers`);
      out += colorToFace[c];
    });
  });
  return out;
}

function syncCubeFromFaces() {
  if (!allFacesReady()) return;
  try {
    const fl = localColorsToFacelets(faces);
    window.Cube3D.paint(fl);
    lastFacelets = fl;
    scrambleFacelets = fl;
  } catch {
    /* wait */
  }
}

function paintMini(f) {
  const mini = document.getElementById(`mini-${f}`);
  if (!mini) return;
  mini.innerHTML = "";
  (faces[f] || Array(9).fill(null)).forEach((c) => {
    const s = document.createElement("span");
    s.style.background = c ? COLOR_HEX[c] : "#1a221c";
    mini.appendChild(s);
  });
}

async function ingestFace(f, fileOrResult) {
  const result = fileOrResult.colors
    ? fileOrResult
    : await readFaceColors(fileOrResult);
  faces[f] = result.colors;
  const prev = document.getElementById(`prev-${f}`);
  prev.innerHTML = `<img src="${result.previewUrl}" alt="${f}" />`;
  prev.closest(".face-card")?.classList.add("ready");
  paintMini(f);
  updateSolveBtn();
  syncCubeFromFaces();
}

function renderFaceGrid() {
  const grid = document.getElementById("face-grid");
  grid.innerHTML = "";
  FACE_ORDER.forEach((f) => {
    const card = document.createElement("div");
    card.className = "face-card";
    card.innerHTML = `
      <h3>${f} · ${FACE_HINTS[f]}</h3>
      <div class="preview" id="prev-${f}">No photo yet</div>
      <div class="mini" id="mini-${f}"></div>
      <div class="face-actions">
        <button type="button" class="cam-btn" data-face="${f}">Camera</button>
        <button type="button" class="up-btn" data-face="${f}">Upload</button>
      </div>
      <input type="file" accept="image/*" id="file-${f}" />
    `;
    grid.appendChild(card);
    paintMini(f);
    card.querySelector(".up-btn").addEventListener("click", () => card.querySelector("input").click());
    card.querySelector(".cam-btn").addEventListener("click", () => openCamera(f));
    card.querySelector("input").addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        await ingestFace(f, file);
      } catch (err) {
        toast(err.message || "Could not read image");
      }
    });
  });
}

async function openCamera(face) {
  camFace = face;
  document.getElementById("cam-face-label").textContent = FACE_HINTS[face];
  document.getElementById("camera-modal").hidden = false;
  await startCamera();
}

async function startCamera() {
  stopCamera();
  const video = document.getElementById("cam-video");
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: camFacing }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = camStream;
    await video.play();
  } catch {
    toast("Camera blocked — use Upload, or allow camera permission.");
    document.getElementById("camera-modal").hidden = true;
  }
}

function stopCamera() {
  if (camStream) {
    camStream.getTracks().forEach((t) => t.stop());
    camStream = null;
  }
  document.getElementById("cam-video").srcObject = null;
}

async function captureFromCamera() {
  const video = document.getElementById("cam-video");
  if (!video.videoWidth) {
    toast("Camera not ready yet");
    return;
  }
  try {
    const result = await readFaceFromVideo(video);
    await ingestFace(camFace, result);
    stopCamera();
    document.getElementById("camera-modal").hidden = true;
    toast(`${FACE_HINTS[camFace]} captured`);
  } catch (err) {
    toast(err.message || "Capture failed");
  }
}

function methodSolvingText() {
  const m = selectedMethod();
  if (m === "ida") return "IDA* searching for a shortest path…";
  if (m === "cfop") return "Building CFOP solution (Cross → F2L → OLL → PLL)…";
  return "Kociemba two-phase search…";
}

async function solve() {
  if (!allFacesReady()) return;
  setSolving(true, methodSolvingText());
  document.getElementById("btn-solve").disabled = true;
  try {
    const res = await fetch("/api/solve_colors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ faces, method: selectedMethod() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Solve failed");
    applySolution(data);
    toast(`Solved in ${data.move_count} moves — use Next step + arrows`);
  } catch (err) {
    toast(err.message || String(err));
  } finally {
    setSolving(false);
    updateSolveBtn();
  }
}

function applySolution(data) {
  scrambleFacelets = data.facelets;
  lastFacelets = data.facelets;
  lastSolution = data;
  playIndex = 0;
  window.Cube3D.paint(data.facelets);
  showResult(data);
  enablePlayback(true);
  hideTeach();
  // Keep mobile layout stable: resize after DOM updates
  requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
}

function showResult(data) {
  const strip = document.getElementById("result-strip");
  strip.hidden = false;
  document.getElementById("stat-moves").textContent = String(data.move_count);
  document.getElementById("stat-ms").textContent = String(Math.round(data.elapsed_ms));
  document.getElementById("stat-algo").textContent = data.algorithm;
  document.getElementById("notes").textContent = data.notes || "";

  const pill = document.getElementById("stage-pill");
  if (data.stages?.length) {
    pill.hidden = false;
    pill.textContent = data.stages.map((s) => s.name).join(" → ");
  } else {
    pill.hidden = true;
  }

  const movesEl = document.getElementById("moves");
  movesEl.innerHTML = "";
  data.moves.forEach((m, i) => {
    const chip = document.createElement("span");
    chip.className = "move-chip";
    chip.textContent = m;
    chip.dataset.i = String(i);
    chip.addEventListener("click", () => {
      // Show teaching for this move without jumping cube state
      document.querySelectorAll(".move-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      updateHud(i, m);
      showTeach(m);
      updateStagePill(i);
    });
    movesEl.appendChild(chip);
  });
}

function updateStagePill(index) {
  const pill = document.getElementById("stage-pill");
  const st = stageAtIndex(lastSolution?.stages, index);
  if (st) {
    pill.hidden = false;
    pill.textContent = `Stage: ${st.name}`;
  }
}

function enablePlayback(on) {
  ["btn-play", "btn-pause", "btn-step", "btn-prev", "btn-reset"].forEach((id) => {
    document.getElementById(id).disabled = !on;
  });
}

function updateHud(i, mv) {
  const hud = document.getElementById("move-hud");
  hud.hidden = false;
  document.getElementById("hud-face").textContent =
    window.Cube3D.FACE_NAMES[mv[0]] || mv[0];
  document.getElementById("hud-move").textContent = mv;
  document.getElementById("hud-step").textContent =
    `${i + 1} / ${lastSolution?.move_count || "?"}`;
  showTeach(mv);
  updateStagePill(i);
}

function highlightChip(i) {
  document.querySelectorAll(".move-chip").forEach((c, idx) => {
    c.classList.toggle("active", idx === i);
    c.classList.toggle("done", idx < i);
  });
  const chip = document.querySelector(`.move-chip[data-i="${i}"]`);
  // Avoid scrollIntoView jumping the whole mobile page
  if (chip && chip.parentElement) {
    const parent = chip.parentElement;
    const left = chip.offsetLeft - parent.clientWidth / 2 + chip.clientWidth / 2;
    parent.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }
}

async function playSolution() {
  if (!lastSolution || !scrambleFacelets) return;
  window.Cube3D.resume();
  lastFacelets = scrambleFacelets;
  playIndex = 0;
  await window.Cube3D.play(scrambleFacelets, lastSolution.moves, {
    onStep(i, mv) {
      playIndex = i;
      highlightChip(i);
      updateHud(i, mv);
    },
  });
  playIndex = lastSolution.moves.length;
}

async function stepForward() {
  if (!lastSolution || !scrambleFacelets) return;
  if (playIndex >= lastSolution.moves.length) {
    toast("Solution finished");
    return;
  }
  const mv = lastSolution.moves[playIndex];
  updateHud(playIndex, mv);
  highlightChip(playIndex);
  lastFacelets = await window.Cube3D.stepOnce(lastFacelets || scrambleFacelets, mv);
  playIndex += 1;
}

async function stepBack() {
  if (!lastSolution || !scrambleFacelets) return;
  if (playIndex <= 0) {
    toast("Already at the start");
    return;
  }
  // Rebuild state by replaying moves 0..playIndex-2
  const target = playIndex - 1;
  window.Cube3D.stop();
  let state = scrambleFacelets;
  window.Cube3D.paint(state);
  for (let i = 0; i < target; i++) {
    state = await fetchApply(state, [lastSolution.moves[i]]);
  }
  window.Cube3D.paint(state);
  lastFacelets = state;
  playIndex = target;
  if (target > 0) {
    const mv = lastSolution.moves[target - 1];
    highlightChip(target - 1);
    updateHud(target - 1, mv);
  } else {
    document.querySelectorAll(".move-chip").forEach((c) => c.classList.remove("active", "done"));
    hideTeach();
    document.getElementById("move-hud").hidden = true;
  }
}

async function fetchApply(facelets, moves) {
  const res = await fetch("/api/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ facelets, moves }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Apply failed");
  return data.facelets;
}

function resetPlayback() {
  window.Cube3D.stop();
  if (lastSolution && scrambleFacelets) {
    lastFacelets = scrambleFacelets;
    window.Cube3D.paint(scrambleFacelets);
    playIndex = 0;
    document.querySelectorAll(".move-chip").forEach((c) => {
      c.classList.remove("active", "done");
    });
    document.getElementById("move-hud").hidden = true;
    hideTeach();
    if (lastSolution.stages?.length) {
      const pill = document.getElementById("stage-pill");
      pill.hidden = false;
      pill.textContent = lastSolution.stages.map((s) => s.name).join(" → ");
    }
  }
}

async function demoScramble() {
  setSolving(true, methodSolvingText());
  try {
    const res = await fetch("/api/scramble");
    const data = await res.json();
    FACE_ORDER.forEach((f, fi) => {
      const slice = data.facelets.slice(fi * 9, fi * 9 + 9);
      faces[f] = [...slice].map(letterToColor);
      paintMini(f);
      const prev = document.getElementById(`prev-${f}`);
      if (prev) {
        prev.textContent = "From demo";
        prev.closest(".face-card")?.classList.add("ready");
      }
    });
    updateSolveBtn();
    window.Cube3D.paint(data.facelets);

    const solveRes = await fetch("/api/solve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ facelets: data.facelets, method: selectedMethod() }),
    });
    const solved = await solveRes.json();
    if (!solveRes.ok) throw new Error(solved.error || "Solve failed");
    applySolution(solved);
    toast(`Demo: ${solved.move_count} moves — tap Next step & follow arrows`);
    // Don't auto-scroll the page on mobile
  } catch (err) {
    toast(err.message || String(err));
  } finally {
    setSolving(false);
  }
}

function letterToColor(ch) {
  return { U: "white", R: "red", F: "green", D: "yellow", L: "orange", B: "blue" }[ch];
}

function openManual() {
  document.getElementById("manual-modal").hidden = false;
  const palette = document.getElementById("palette");
  palette.innerHTML = "";
  Object.entries(COLOR_HEX).forEach(([name, hex]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.style.background = hex;
    b.title = name;
    if (name === brush) b.classList.add("selected");
    b.addEventListener("click", () => {
      brush = name;
      palette.querySelectorAll("button").forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
    });
    palette.appendChild(b);
  });

  const wrap = document.getElementById("manual-faces");
  wrap.innerHTML = "";
  FACE_ORDER.forEach((f) => {
    if (!faces[f]) {
      const defaults = {
        U: "white", R: "red", F: "green", D: "yellow", L: "orange", B: "blue",
      };
      faces[f] = Array(9).fill(defaults[f]);
    }
    const box = document.createElement("div");
    box.className = "manual-face";
    box.innerHTML = `<h4>${f} · ${FACE_HINTS[f]}</h4>`;
    const grid = document.createElement("div");
    grid.className = "paint-grid";
    faces[f].forEach((c, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.style.background = COLOR_HEX[c];
      btn.addEventListener("click", () => {
        faces[f][i] = brush;
        btn.style.background = COLOR_HEX[brush];
        paintMini(f);
      });
      grid.appendChild(btn);
    });
    box.appendChild(grid);
    wrap.appendChild(box);
  });
}

function closeManual() {
  document.getElementById("manual-modal").hidden = true;
  FACE_ORDER.forEach((f) => {
    paintMini(f);
    if (faces[f]) {
      document.getElementById(`prev-${f}`)?.closest(".face-card")?.classList.add("ready");
    }
  });
  updateSolveBtn();
  syncCubeFromFaces();
}

function wireMethods() {
  document.querySelectorAll(".method-card").forEach((card) => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".method-card").forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      card.querySelector("input").checked = true;
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  if (!window.Cube3D) initCube3D();
  renderFaceGrid();
  wireMethods();

  // Default slow teaching speed
  window.Cube3D.setSpeed(0.45);

  document.getElementById("btn-solve").addEventListener("click", solve);
  document.getElementById("btn-demo").addEventListener("click", demoScramble);
  document.getElementById("btn-manual").addEventListener("click", openManual);
  document.getElementById("modal-close").addEventListener("click", closeManual);
  document.getElementById("btn-apply-manual").addEventListener("click", closeManual);

  document.getElementById("btn-play").addEventListener("click", () => {
    if (window.Cube3D.playing && window.Cube3D.paused) {
      window.Cube3D.resume();
      return;
    }
    if (window.Cube3D.playing) return;
    resetPlayback();
    playSolution();
  });
  document.getElementById("btn-pause").addEventListener("click", () => window.Cube3D.pause());
  document.getElementById("btn-step").addEventListener("click", stepForward);
  document.getElementById("btn-prev").addEventListener("click", stepBack);
  document.getElementById("btn-reset").addEventListener("click", resetPlayback);

  const speed = document.getElementById("speed");
  const speedLabel = document.getElementById("speed-label");
  speed.addEventListener("input", () => {
    const v = Number(speed.value);
    speedLabel.textContent = `${v.toFixed(2)}×`;
    window.Cube3D.setSpeed(v);
  });

  document.getElementById("cam-close").addEventListener("click", () => {
    stopCamera();
    document.getElementById("camera-modal").hidden = true;
  });
  document.getElementById("cam-shutter").addEventListener("click", captureFromCamera);
  document.getElementById("cam-switch").addEventListener("click", async () => {
    camFacing = camFacing === "environment" ? "user" : "environment";
    await startCamera();
  });
});
