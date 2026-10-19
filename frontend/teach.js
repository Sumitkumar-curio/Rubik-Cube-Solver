/** Teaching arrows + human instructions for each move. */

const FACE_LABEL = {
  U: "UP (top)",
  D: "DOWN (bottom)",
  F: "FRONT",
  B: "BACK",
  R: "RIGHT",
  L: "LEFT",
};

export function describeMove(mv) {
  const face = mv[0];
  const faceName = FACE_LABEL[face] || face;
  let dir = "clockwise";
  let amount = "90°";
  let kind = "cw";
  if (mv.includes("'")) {
    dir = "counter-clockwise";
    kind = "ccw";
  }
  if (mv.includes("2")) {
    dir = "180°";
    amount = "180°";
    kind = "half";
  }
  const action =
    kind === "half"
      ? `Turn ${faceName} halfway around (180°)`
      : `Turn ${faceName} ${dir} ${amount}`;
  return { face, faceName, dir, amount, kind, action, notation: mv };
}

export function renderArrowSVG(kind) {
  // Curved arrow for CW / CCW / 180
  if (kind === "half") {
    return `
      <circle cx="60" cy="60" r="34" fill="none" stroke="#c8f542" stroke-width="6"
        stroke-dasharray="40 12" transform="rotate(-40 60 60)"/>
      <polygon points="88,38 98,52 78,54" fill="#c8f542"/>
      <polygon points="32,82 22,68 42,66" fill="#c8f542"/>
      <text x="60" y="66" text-anchor="middle" fill="#e9f2ec" font-size="18" font-family="IBM Plex Mono, monospace">180°</text>
    `;
  }
  if (kind === "ccw") {
    return `
      <path d="M 88 42 A 34 34 0 1 0 88 78" fill="none" stroke="#c8f542" stroke-width="7" stroke-linecap="round"/>
      <polygon points="88,28 102,48 74,46" fill="#c8f542"/>
      <text x="60" y="66" text-anchor="middle" fill="#7ec8ff" font-size="14" font-family="IBM Plex Sans, sans-serif">CCW</text>
    `;
  }
  // cw default
  return `
    <path d="M 32 42 A 34 34 0 1 1 32 78" fill="none" stroke="#c8f542" stroke-width="7" stroke-linecap="round"/>
    <polygon points="32,28 18,48 46,46" fill="#c8f542"/>
    <text x="60" y="66" text-anchor="middle" fill="#7ec8ff" font-size="14" font-family="IBM Plex Sans, sans-serif">CW</text>
  `;
}

export function showTeach(mv) {
  const overlay = document.getElementById("teach-overlay");
  if (!overlay) return;
  const info = describeMove(mv);
  overlay.hidden = false;
  document.getElementById("teach-face").textContent = info.faceName;
  document.getElementById("teach-action").textContent = info.action;
  document.getElementById("teach-notation").textContent = info.notation;
  document.getElementById("arrow-svg").innerHTML = renderArrowSVG(info.kind);
}

export function hideTeach() {
  const overlay = document.getElementById("teach-overlay");
  if (overlay) overlay.hidden = true;
}

export function stageAtIndex(stages, index) {
  if (!stages?.length) return null;
  let current = stages[0];
  for (const s of stages) {
    if (index >= s.start_index) current = s;
  }
  return current;
}
