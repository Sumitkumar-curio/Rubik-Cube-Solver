/**
 * Visual 3D guide cube — shows how to rotate before each capture.
 * Rotations match CAPTURE_STEPS (FRONT = home).
 *
 * CSS rotateY uses right-hand rule (thumb UP):
 *   +90° → LEFT face toward camera
 *   -90° → RIGHT face toward camera
 *  ±180° → BACK face toward camera
 */
export const HOME_RX = -28;
export const HOME_RY = 32;

export const GUIDE_POSES = {
  home: { rx: HOME_RX, ry: HOME_RY, label: "HOME — FRONT facing you", anim: "none" },
  F: { rx: HOME_RX, ry: HOME_RY, label: "FRONT faces camera", anim: "none" },
  // Clockwise from above → RIGHT to camera (CSS rotateY -90°)
  R: {
    rx: HOME_RX,
    ry: HOME_RY - 90,
    label: "Turn RIGHT (clockwise from above)",
    anim: "yaw-right",
  },
  // Continue clockwise → BACK
  B: {
    rx: HOME_RX,
    ry: HOME_RY - 180,
    label: "Turn RIGHT again → BACK",
    anim: "yaw-right",
  },
  // Anti-clockwise from above → LEFT to camera (CSS rotateY +90°)
  L: {
    rx: HOME_RX,
    ry: HOME_RY + 90,
    label: "From HOME turn LEFT (anti-clockwise)",
    anim: "yaw-left",
  },
  U: {
    rx: -100,
    ry: HOME_RY,
    label: "From HOME tip cube AWAY from you",
    anim: "tip-away",
  },
  D: {
    rx: 55,
    ry: HOME_RY,
    label: "From HOME tip cube TOWARD you",
    anim: "tip-toward",
  },
};

/** Which equatorial face faces the camera for a guide pose (CSS Y delta from HOME). */
export function cameraFaceForYawDelta(deltaRy) {
  const n = ((deltaRy % 360) + 360) % 360;
  if (n === 0) return "F";
  if (n === 90) return "L";
  if (n === 180) return "B";
  if (n === 270) return "R";
  return null;
}

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
  setGuidePose("home", { animate: false });
  await sleep(450);
  if (face === "F") {
    setGuidePose("F", { animate: true });
    await sleep(600);
    return;
  }
  if (face === "B") {
    // HOME → RIGHT → BACK (both clockwise)
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
