import { initCube3D } from "./cube3d.js";
import { CAPTURE_ORDER, CAPTURE_STEPS } from "./capture-guide.js";
import { buildGuideCube, playGuideSequence } from "./guide-cube.js";

const {
  FACE_ORDER,
  FACE_HINTS,
  COLOR_HEX,
  readFaceColors,
  readFaceFromVideo,
  validateLocalFaces,
} = window.CubeVision;

const faces = Object.fromEntries(FACE_ORDER.map((f) => [f, null]));
let lastSolution = null;
let scrambleFacelets = null; // immutable scramble start
let lastFacelets = null;
let playIndex = 0;
/** faceletHistory[i] = cube after first i moves applied */
let faceletHistory = [];
let playbackBusy = false;
let brush = "white";
let camStream = null;
let camFace = "U";
let camFacing = "environment";
/** Pending capture awaiting user review */
let reviewState = null; // { face, colors, previewUrl, brush, fromCamera }
let reviewBrush = "white";
/** Face currently shown in the rotate coach */
let coachFace = "F";
/** After save, auto-open coach for the next missing face */
let guidedMode = false;
let guideBuilt = false;

const toastEl = document.getElementById("toast");

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => {
    toastEl.hidden = true;
  }, 4200);
}

function showError(msg) {
  const box = document.getElementById("error-box");
  if (!msg) {
    box.hidden = true;
    box.textContent = "";
    return;
  }
  box.hidden = false;
  box.textContent = msg;
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function updateStepBanner(face) {
  const step = CAPTURE_STEPS[face];
  if (!step) return;
  const idx = CAPTURE_ORDER.indexOf(face) + 1;
  document.getElementById("step-num").textContent = `Step ${idx} / 6 · Capture this next`;
  document.getElementById("step-title").textContent = step.title;
  document.getElementById("step-how").textContent = `${step.how} ${step.turn}`;
  document.getElementById("step-top").textContent = `⚠ ${step.photoTop}`;
}

function nextMissingFace() {
  return CAPTURE_ORDER.find((f) => !faces[f]) || CAPTURE_ORDER[0];
}

function refreshWizard() {
  updateStepBanner(nextMissingFace());
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

/** Face letter → real captured center color (keeps 3D cube matching the physical cube). */
function colorSchemeFromFaces(faceMap = faces) {
  const scheme = {};
  FACE_ORDER.forEach((f) => {
    const center = faceMap[f]?.[4];
    if (center && COLOR_HEX[center]) scheme[f] = COLOR_HEX[center];
  });
  return scheme;
}

function paintCubeWithUserColors(facelets) {
  if (!window.Cube3D) return;
  if (allFacesReady()) {
    window.Cube3D.setColorScheme(colorSchemeFromFaces());
  }
  window.Cube3D.paint(facelets);
}

function syncCubeFromFaces() {
  if (!allFacesReady()) return;
  try {
    const fl = localColorsToFacelets(faces);
    paintCubeWithUserColors(fl);
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

function saveFace(f, colors, previewUrl) {
  // Never auto-rewrite colors — what the user saves is what we solve.
  faces[f] = colors.slice();
  const prev = document.getElementById(`prev-${f}`);
  if (previewUrl) {
    prev.innerHTML = `<img src="${previewUrl}" alt="${f}" />`;
  } else {
    prev.textContent = "Colors set";
  }
  prev.closest(".face-card")?.classList.add("ready");
  paintMini(f);
  updateSolveBtn();
  syncCubeFromFaces();
  showError("");
  refreshWizard();
}

async function ingestFace(f, fileOrResult, { fromCamera = false } = {}) {
  const result = fileOrResult.colors
    ? fileOrResult
    : await readFaceColors(fileOrResult);
  openReview(f, result.colors, result.previewUrl, fromCamera);
}

function openReview(face, colors, previewUrl, fromCamera) {
  reviewState = {
    face,
    colors: colors.slice(),
    previewUrl,
    fromCamera,
  };
  reviewBrush = "white";
  const step = CAPTURE_STEPS[face];
  document.getElementById("review-face-label").textContent =
    `${FACE_HINTS[face]}${step ? ` · ${step.photoTop}` : ""}`;
  document.getElementById("review-preview").src = previewUrl || "";
  renderReviewGrid();
  renderReviewPalette();
  document.getElementById("review-modal").hidden = false;
}

function renderReviewPalette() {
  const palette = document.getElementById("review-palette");
  palette.innerHTML = "";
  Object.entries(COLOR_HEX).forEach(([name, hex]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.style.background = hex;
    b.title = name;
    if (name === reviewBrush) b.classList.add("selected");
    b.addEventListener("click", () => {
      reviewBrush = name;
      palette.querySelectorAll("button").forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
    });
    palette.appendChild(b);
  });
}

function renderReviewGrid() {
  const grid = document.getElementById("review-grid");
  grid.innerHTML = "";
  reviewState.colors.forEach((c, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.style.background = COLOR_HEX[c];
    if (i === 4) btn.classList.add("center-mark");
    btn.addEventListener("click", () => {
      reviewState.colors[i] = reviewBrush;
      btn.style.background = COLOR_HEX[reviewBrush];
    });
    grid.appendChild(btn);
  });
}

function acceptReview() {
  if (!reviewState) return;
  const savedFace = reviewState.face;
  saveFace(savedFace, reviewState.colors, reviewState.previewUrl);
  document.getElementById("review-modal").hidden = true;
  toast(`${FACE_HINTS[savedFace]} saved — colors stay exactly as you set them`);
  reviewState = null;
  if (guidedMode && !allFacesReady()) {
    const next = nextMissingFace();
    setTimeout(() => openCoach(next), 400);
  } else if (allFacesReady()) {
    guidedMode = false;
    toast("All 6 faces saved — check colors, then Solve");
  }
}

async function retakeReview() {
  const face = reviewState?.face;
  const fromCamera = reviewState?.fromCamera;
  document.getElementById("review-modal").hidden = true;
  reviewState = null;
  if (face && fromCamera) {
    await openCoach(face);
  } else if (face) {
    document.getElementById(`file-${face}`)?.click();
  }
}

function renderFaceGrid() {
  const grid = document.getElementById("face-grid");
  grid.innerHTML = "";
  // Capture order: F R B L U D (FRONT is home)
  CAPTURE_ORDER.forEach((f, idx) => {
    const step = CAPTURE_STEPS[f];
    const card = document.createElement("div");
    card.className = "face-card";
    card.dataset.face = f;
    card.innerHTML = `
      <h3>${idx + 1}. ${f} · ${FACE_HINTS[f]}</h3>
      <p class="face-hint">${step.turn}</p>
      <div class="preview" id="prev-${f}">No photo yet</div>
      <div class="mini" id="mini-${f}"></div>
      <div class="face-actions">
        <button type="button" class="cam-btn" data-face="${f}">Guide + Camera</button>
        <button type="button" class="up-btn" data-face="${f}">Upload</button>
      </div>
      <input type="file" accept="image/*" id="file-${f}" />
    `;
    grid.appendChild(card);
    paintMini(f);
    card.querySelector(".up-btn").addEventListener("click", () => {
      updateStepBanner(f);
      card.querySelector("input").click();
    });
    card.querySelector(".cam-btn").addEventListener("click", () => openCoach(f));
    card.querySelector("input").addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        await ingestFace(f, file, { fromCamera: false });
      } catch (err) {
        showError(err.message || "Could not read image");
        toast(err.message || "Could not read image");
      }
      e.target.value = "";
    });

    card.querySelector(`#mini-${f}`).addEventListener("click", () => {
      if (!faces[f]) return;
      const prevImg = card.querySelector("img");
      openReview(f, faces[f], prevImg?.src || "", false);
    });
  });
  refreshWizard();
}

async function ensureGuideBuilt() {
  if (guideBuilt) return;
  buildGuideCube(document.getElementById("guide3d-root"));
  guideBuilt = true;
}

async function openCoach(face) {
  coachFace = face;
  guidedMode = true;
  updateStepBanner(face);
  await ensureGuideBuilt();
  const step = CAPTURE_STEPS[face];
  const idx = CAPTURE_ORDER.indexOf(face) + 1;
  document.getElementById("coach-heading").textContent =
    `Step ${idx} / 6 · ${step?.title || FACE_HINTS[face]}`;
  document.getElementById("coach-help").textContent = step
    ? `${step.how} ${step.tip || ""}`
    : "Copy the rotation, then capture.";
  document.getElementById("coach-check-1").textContent =
    face === "F"
      ? "① Hold HOME: pick FRONT toward you, UP on top — remember this forever"
      : "① Return to HOME first (FRONT toward you, UP on top)";
  document.getElementById("coach-check-2").textContent =
    `② Copy the rotation on the cube above → ${step?.turn || ""}`;
  document.getElementById("coach-check-3").textContent =
    `③ Fill the yellow square · ${step?.photoTop || "match TOP of photo"}`;
  document.getElementById("coach-modal").hidden = false;
  await playGuideSequence(face);
}

function closeCoach() {
  document.getElementById("coach-modal").hidden = true;
}

async function openCamera(face) {
  camFace = face;
  updateStepBanner(face);
  const step = CAPTURE_STEPS[face];
  document.getElementById("cam-face-label").textContent = FACE_HINTS[face];
  document.getElementById("cam-orient").textContent = step
    ? `⚠ ${step.photoTop}`
    : "Align face in the yellow square";
  document.getElementById("camera-modal").hidden = false;
  await startCamera();
}

async function startGuidedCapture() {
  guidedMode = true;
  const next = nextMissingFace();
  document.getElementById("capture")?.scrollIntoView({ behavior: "smooth", block: "start" });
  await openCoach(next);
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
    stopCamera();
    document.getElementById("camera-modal").hidden = true;
    openReview(camFace, result.colors, result.previewUrl, true);
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

async function checkCube() {
  showError("");
  if (!allFacesReady()) {
    showError("Capture all 6 faces first (FRONT → RIGHT → BACK → LEFT → UP → DOWN).");
    return false;
  }
  const localErrs = validateLocalFaces(faces);
  if (localErrs.length) {
    showError(
      localErrs.join("\n") +
        "\n\nTap a mini face grid to fix stickers yourself — we never change colors automatically."
    );
    return false;
  }
  try {
    const res = await fetch("/api/validate_colors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ faces }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      showError(
        (data.error || "Cube check failed.") +
          " Fix sticker colors or photo orientation (tap a face mini-grid). Colors are not auto-changed."
      );
      return false;
    }
    syncCubeFromFaces();
    toast("Cube looks valid — ready to solve");
    return true;
  } catch (err) {
    showError(err.message || String(err));
    return false;
  }
}

async function solve() {
  if (!allFacesReady()) {
    showError("Capture all 6 faces first.");
    return;
  }
  const ok = await checkCube();
  if (!ok) return;

  setSolving(true, methodSolvingText());
  document.getElementById("btn-solve").disabled = true;
  showError("");
  try {
    const res = await fetch("/api/solve_colors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ faces, method: selectedMethod() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Solve failed");
    applySolution(data);
    toast(`Solved in ${data.move_count} moves — hold cube as shown, then Next step`);
  } catch (err) {
    showError(err.message || String(err));
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
  faceletHistory = [data.facelets];
  playbackBusy = false;
  // Keep user's real sticker colors (not the default white-top scheme)
  paintCubeWithUserColors(data.facelets);
  showResult(data);
  enablePlayback(true);
  updateHud(0);
  requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
}

function showResult(data) {
  const strip = document.getElementById("result-strip");
  strip.hidden = false;
  document.getElementById("stat-moves").textContent = String(data.move_count);

  const movesEl = document.getElementById("moves");
  movesEl.innerHTML = "";
  data.moves.forEach((m, i) => {
    const chip = document.createElement("span");
    chip.className = "move-chip";
    chip.textContent = m;
    chip.dataset.i = String(i);
    chip.addEventListener("click", () => jumpToMove(i));
    movesEl.appendChild(chip);
  });
}

function enablePlayback(on) {
  ["btn-play", "btn-pause", "btn-step", "btn-prev", "btn-reset"].forEach((id) => {
    document.getElementById(id).disabled = !on;
  });
}

/** Compact step counter only — no how-to text (cube animation is enough). */
function updateHud(stepIndex) {
  const hud = document.getElementById("move-hud");
  const total = lastSolution?.move_count || 0;
  if (!total) {
    hud.hidden = true;
    return;
  }
  hud.hidden = false;
  const shown = Math.min(Math.max(stepIndex, 0), total);
  document.getElementById("hud-step").textContent = `${shown} / ${total}`;
}

function highlightChip(i) {
  document.querySelectorAll(".move-chip").forEach((c, idx) => {
    c.classList.toggle("active", idx === i);
    c.classList.toggle("done", idx < i);
  });
  const chip = document.querySelector(`.move-chip[data-i="${i}"]`);
  if (chip && chip.parentElement) {
    const parent = chip.parentElement;
    const left = chip.offsetLeft - parent.clientWidth / 2 + chip.clientWidth / 2;
    parent.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }
}

async function stopPlaybackIfNeeded() {
  if (window.Cube3D?.playing) {
    window.Cube3D.stop();
    await window.Cube3D.waitUntilIdle();
  }
}

async function playSolution() {
  if (!lastSolution || !scrambleFacelets) return;

  // Resume if paused mid-play
  if (window.Cube3D.playing && window.Cube3D.paused) {
    window.Cube3D.resume();
    return;
  }
  if (window.Cube3D.playing || playbackBusy) return;

  let startIdx = playIndex;
  let startState = faceletHistory[startIdx] || lastFacelets || scrambleFacelets;

  // Finished → restart from scramble
  if (startIdx >= lastSolution.moves.length) {
    startIdx = 0;
    startState = scrambleFacelets;
    faceletHistory = [scrambleFacelets];
    playIndex = 0;
    paintCubeWithUserColors(startState);
    highlightChip(-1);
  }

  const remaining = lastSolution.moves.slice(startIdx);
  if (!remaining.length) return;

  await window.Cube3D.play(startState, remaining, {
    skipInitialPaint: startIdx > 0,
    onStep(i) {
      const abs = startIdx + i;
      highlightChip(abs);
      updateHud(abs + 1);
    },
    onAfterMove(i, facelets) {
      const abs = startIdx + i + 1;
      playIndex = abs;
      faceletHistory[abs] = facelets;
      faceletHistory.length = abs + 1;
      lastFacelets = facelets;
      updateHud(abs);
    },
  });
}

async function stepForward() {
  if (!lastSolution || !scrambleFacelets || playbackBusy) return;
  if (playIndex >= lastSolution.moves.length) {
    toast("Solution finished");
    return;
  }
  playbackBusy = true;
  try {
    await stopPlaybackIfNeeded();
    const mv = lastSolution.moves[playIndex];
    const from = faceletHistory[playIndex] || lastFacelets || scrambleFacelets;
    highlightChip(playIndex);
    updateHud(playIndex + 1);
    const next = await window.Cube3D.stepOnce(from, mv);
    playIndex += 1;
    faceletHistory[playIndex] = next;
    faceletHistory.length = playIndex + 1;
    lastFacelets = next;
    updateHud(playIndex);
  } finally {
    playbackBusy = false;
  }
}

async function stepBack() {
  if (!lastSolution || !scrambleFacelets || playbackBusy) return;
  if (playIndex <= 0) {
    toast("Already at the start");
    return;
  }
  playbackBusy = true;
  try {
    await stopPlaybackIfNeeded();
    const target = playIndex - 1;
    // Prefer cached history (instant). Rebuild once if missing.
    let state = faceletHistory[target];
    if (!state) {
      state = await fetchApply(scrambleFacelets, lastSolution.moves.slice(0, target));
      faceletHistory[target] = state;
    }
    playIndex = target;
    lastFacelets = state;
    paintCubeWithUserColors(state);
    if (target > 0) {
      highlightChip(target - 1);
      updateHud(target);
    } else {
      document.querySelectorAll(".move-chip").forEach((c) => c.classList.remove("active", "done"));
      updateHud(0);
    }
  } finally {
    playbackBusy = false;
  }
}

async function jumpToMove(i) {
  if (!lastSolution || playbackBusy) return;
  playbackBusy = true;
  try {
    await stopPlaybackIfNeeded();
    const state = await fetchApply(scrambleFacelets, lastSolution.moves.slice(0, i));
    playIndex = i;
    faceletHistory[i] = state;
    faceletHistory.length = Math.max(faceletHistory.length, i + 1);
    lastFacelets = state;
    paintCubeWithUserColors(state);
    if (i > 0) {
      highlightChip(i - 1);
      updateHud(i);
    } else {
      document.querySelectorAll(".move-chip").forEach((c) => c.classList.remove("active", "done"));
      updateHud(0);
    }
  } catch (err) {
    toast(err.message || String(err));
  } finally {
    playbackBusy = false;
  }
}

async function fetchApply(facelets, moves) {
  if (!moves.length) return facelets;
  const res = await fetch("/api/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ facelets, moves }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Apply failed");
  return data.facelets;
}

async function resetPlayback() {
  if (!lastSolution || !scrambleFacelets) return;
  await stopPlaybackIfNeeded();
  lastFacelets = scrambleFacelets;
  faceletHistory = [scrambleFacelets];
  playIndex = 0;
  paintCubeWithUserColors(scrambleFacelets);
  document.querySelectorAll(".move-chip").forEach((c) => {
    c.classList.remove("active", "done");
  });
  updateHud(0);
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
    paintCubeWithUserColors(data.facelets);

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

  // Default playback speed (snappy on mobile)
  window.Cube3D.setSpeed(0.9);

  document.getElementById("btn-solve").addEventListener("click", solve);
  document.getElementById("btn-validate")?.addEventListener("click", checkCube);
  document.getElementById("btn-demo").addEventListener("click", demoScramble);
  document.getElementById("btn-demo-hero")?.addEventListener("click", demoScramble);
  document.getElementById("btn-manual").addEventListener("click", openManual);
  document.getElementById("modal-close").addEventListener("click", closeManual);
  document.getElementById("btn-apply-manual").addEventListener("click", closeManual);

  document.getElementById("review-accept").addEventListener("click", acceptReview);
  document.getElementById("review-retake").addEventListener("click", retakeReview);
  document.getElementById("review-close").addEventListener("click", () => {
    document.getElementById("review-modal").hidden = true;
    reviewState = null;
  });

  document.getElementById("btn-play").addEventListener("click", () => playSolution());
  document.getElementById("btn-pause").addEventListener("click", () => window.Cube3D.pause());
  document.getElementById("btn-step").addEventListener("click", () => stepForward());
  document.getElementById("btn-prev").addEventListener("click", () => stepBack());
  document.getElementById("btn-reset").addEventListener("click", () => resetPlayback());

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

  document.getElementById("btn-guided")?.addEventListener("click", startGuidedCapture);
  document.getElementById("btn-show-rotate")?.addEventListener("click", () => {
    openCoach(nextMissingFace());
  });
  document.getElementById("coach-close")?.addEventListener("click", closeCoach);
  document.getElementById("coach-replay")?.addEventListener("click", () => playGuideSequence(coachFace));
  document.getElementById("coach-camera")?.addEventListener("click", async () => {
    closeCoach();
    await openCamera(coachFace);
  });
  document.getElementById("coach-upload")?.addEventListener("click", () => {
    closeCoach();
    updateStepBanner(coachFace);
    document.getElementById(`file-${coachFace}`)?.click();
  });
});
