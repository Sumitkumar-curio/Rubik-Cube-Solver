/**
 * Capture order & orientation so solutions match the physical cube.
 * FRONT is the reference face. Always keep UP on top for side faces.
 *
 * Whole-cube yaw (viewed from above, UP stays on top):
 *   clockwise 90°  → RIGHT faces camera
 *   clockwise 180° → BACK faces camera
 *   anti-clockwise 90° → LEFT faces camera
 */
export const CAPTURE_ORDER = ["F", "R", "B", "L", "U", "D"];

export const CAPTURE_STEPS = {
  F: {
    title: "1 · FRONT (main face)",
    how: "Hold the cube so your chosen FRONT faces the camera.",
    turn: "This is your home position. Do not rotate yet.",
    photoTop: "UP edge at the TOP of the photo",
    tip: "Remember this FRONT — every other photo is relative to it.",
    yawFromHomeDeg: 0,
  },
  R: {
    title: "2 · RIGHT",
    how: "From FRONT, turn the cube clockwise (as seen from above) so the RIGHT face points at the camera.",
    turn: "Yaw right / clockwise · UP stays on top.",
    photoTop: "UP edge at the TOP of the photo",
    tip: "Do not flip the cube upside down. RIGHT is the face that was on your right at HOME.",
    yawFromHomeDeg: -90,
  },
  B: {
    title: "3 · BACK",
    how: "From FRONT, turn clockwise twice (or once more from RIGHT) so BACK faces the camera.",
    turn: "Yaw right 180° · UP stays on top.",
    photoTop: "UP edge at the TOP of the photo",
    tip: "Same as: HOME → clockwise → RIGHT → clockwise → BACK.",
    yawFromHomeDeg: -180,
  },
  L: {
    title: "4 · LEFT",
    how: "From FRONT, turn the cube anti-clockwise (from above) so LEFT faces the camera.",
    turn: "Yaw left / anti-clockwise · UP stays on top.",
    photoTop: "UP edge at the TOP of the photo",
    tip: "Return to FRONT first if you got lost, then one anti-clockwise turn.",
    yawFromHomeDeg: 90,
  },
  U: {
    title: "5 · UP (top)",
    how: "Return to FRONT facing you. Tip the cube away from you so the TOP faces the camera.",
    turn: "Tip forward / away · FRONT edge ends at the BOTTOM of the photo.",
    photoTop: "BACK edge at the TOP of the photo",
    tip: "Critical: bottom of photo = the edge that was FRONT.",
    yawFromHomeDeg: 0,
  },
  D: {
    title: "6 · DOWN (bottom)",
    how: "Return to FRONT facing you. Tip the cube toward you so the BOTTOM faces the camera.",
    turn: "Tip toward yourself · FRONT edge ends at the TOP of the photo.",
    photoTop: "FRONT edge at the TOP of the photo",
    tip: "Critical: top of photo = the edge that was FRONT.",
    yawFromHomeDeg: 0,
  },
};

/** Face that ends toward the camera after a whole-cube yaw (degrees, from above). */
export function faceAfterYaw(yawDeg) {
  const n = ((yawDeg % 360) + 360) % 360;
  // Clockwise yaw (negative in CSS Y) brings R, then B, then L…
  // Equatorial faces at home: F@0, R@+90 local → after cube yaw θ (CCW+), camera sees face at -θ.
  if (n === 0) return "F";
  if (n === 90) return "L"; // anti-clockwise 90°
  if (n === 180) return "B";
  if (n === 270) return "R"; // clockwise 90° === yaw -90 ≡ 270
  return null;
}

export function holdReminder(faces) {
  if (!faces?.F?.[4] || !faces?.U?.[4]) return null;
  const fc = faces.F[4];
  const uc = faces.U[4];
  return {
    front: fc,
    up: uc,
    text: `Hold your cube with ${fc.toUpperCase()} center in FRONT and ${uc.toUpperCase()} center on TOP — then follow every move.`,
  };
}
