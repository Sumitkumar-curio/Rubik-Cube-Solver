/**
 * Visual 3D guide cube — shows how to rotate before each capture.
 * Rotations match CAPTURE_STEPS (FRONT = home).
 */
export const GUIDE_POSES = {
  // start / home: show F (green-ish), U on top, R on right
  home: { rx: -28, ry: 32, label: "HOME — FRONT facing you" },
  F: { rx: -28, ry: 32, label: "FRONT faces camera", anim: "none" },
  // anti-clockwise from above → R comes to front: rotate whole cube +90° around Y
  R: { rx: -28, ry: 122, label: "Turn LEFT (anti-clockwise from above)", anim: "yaw-left" },
  B: { rx: -28, ry: 212, label: "Turn LEFT again → BACK", anim: "yaw-left" },
  L: { rx: -28, ry: -58, label: "From HOME turn RIGHT (clockwise)", anim: "yaw-right" },
  // tip away: U faces camera — rotate around X
  U: { rx: -100, ry: 32, label: "From HOME tip cube AWAY from you", anim: "tip-away" },
  // tip toward: D faces camera
  D: { rx: 55, ry: 32, label: "From HOME tip cube TOWARD you", anim: "tip-toward" },
};

export function buildGuideCube(container) {
  container.innerHTML = `
    <div class="guide3d-stage">
      <div class="guide3d-cube" id="guide3d-cube">
        <div class="g3-face g3-u"><span>UP</span></div>
        <div class="g3-face g3-d"><span>DOWN</span></div>
        <div class="g3-face g3-f"><span>FRONT</span></div>
        <div class="g3-face g3-b"><span>BACK</span></div>
        <div class="g3-face g3-r"><span>RIGHT</span></div>
        <div class="g3-face g3-l"><span>LEFT</span></div>
      </div>
      <div class="guide3d-arrow" id="guide3d-arrow" hidden></div>
    </div>
    <p class="guide3d-caption" id="guide3d-caption">Watch the cube rotate…</p>
  `;
}

export function setGuidePose(face, { animate = true } = {}) {
  const cube = document.getElementById("guide3d-cube");
  const caption = document.getElementById("guide3d-caption");
  const arrow = document.getElementById("guide3d-arrow");
  if (!cube) return;

  const pose = GUIDE_POSES[face] || GUIDE_POSES.home;
  cube.style.transition = animate ? "transform 0.85s cubic-bezier(.2,.8,.2,1)" : "none";
  cube.style.transform = `rotateX(${pose.rx}deg) rotateY(${pose.ry}deg)`;

  // Highlight target face
  cube.querySelectorAll(".g3-face").forEach((el) => el.classList.remove("lit"));
  const map = { U: "g3-u", D: "g3-d", F: "g3-f", B: "g3-b", R: "g3-r", L: "g3-l" };
  const lit = cube.querySelector(`.${map[face]}`);
  if (lit) lit.classList.add("lit");

  if (caption) caption.textContent = pose.label;

  if (arrow) {
    if (pose.anim && pose.anim !== "none") {
      arrow.hidden = false;
      arrow.dataset.anim = pose.anim;
      arrow.textContent =
        pose.anim === "yaw-left" ? "↺ Turn left"
        : pose.anim === "yaw-right" ? "↻ Turn right"
        : pose.anim === "tip-away" ? "⤴ Tip away"
        : pose.anim === "tip-toward" ? "⤵ Tip toward you"
        : "";
    } else {
      arrow.hidden = true;
    }
  }
}

export async function playGuideSequence(face) {
  // Always show home first, then animate to target (multi-step for BACK)
  setGuidePose("home", { animate: false });
  await sleep(450);
  if (face === "F") {
    setGuidePose("F", { animate: true });
    await sleep(600);
    return;
  }
  if (face === "B") {
    // HOME → RIGHT → BACK so the turn is obvious
    setGuidePose("R", { animate: true });
    await sleep(850);
    setGuidePose("B", { animate: true });
    await sleep(900);
    return;
  }
  setGuidePose(face, { animate: true });
  await sleep(950);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
