/**
 * Capture order & orientation so solutions match the physical cube.
 * FRONT is the reference face. Always keep UP on top for side faces.
 */
export const CAPTURE_ORDER = ["F", "R", "B", "L", "U", "D"];

export const CAPTURE_STEPS = {
  F: {
    title: "1 · FRONT (main face)",
    how: "Hold the cube so your chosen FRONT faces the camera.",
    turn: "This is your home position. Do not rotate yet.",
    photoTop: "UP edge at the TOP of the photo",
    tip: "Remember this FRONT — every other photo is relative to it.",
  },
  R: {
    title: "2 · RIGHT",
    how: "From FRONT, turn the cube anti-clockwise (as seen from above) so the RIGHT face points at the camera.",
    turn: "Yaw left / anti-clockwise · UP stays on top.",
    photoTop: "UP edge at the TOP of the photo",
    tip: "Do not flip the cube upside down.",
  },
  B: {
    title: "3 · BACK",
    how: "From FRONT, turn anti-clockwise twice (or once more from RIGHT) so BACK faces the camera.",
    turn: "180° turn · UP stays on top.",
    photoTop: "UP edge at the TOP of the photo",
    tip: "Same as: FRONT → right → right → BACK.",
  },
  L: {
    title: "4 · LEFT",
    how: "From FRONT, turn the cube clockwise (from above) so LEFT faces the camera.",
    turn: "Yaw right / clockwise · UP stays on top.",
    photoTop: "UP edge at the TOP of the photo",
    tip: "Return to FRONT first if you got lost, then one clockwise turn.",
  },
  U: {
    title: "5 · UP (top)",
    how: "Return to FRONT facing you. Tip the cube away from you so the TOP faces the camera.",
    turn: "Tip forward / away · FRONT edge ends at the BOTTOM of the photo.",
    photoTop: "BACK edge at the TOP of the photo",
    tip: "Critical: bottom of photo = the edge that was FRONT.",
  },
  D: {
    title: "6 · DOWN (bottom)",
    how: "Return to FRONT facing you. Tip the cube toward you so the BOTTOM faces the camera.",
    turn: "Tip toward yourself · FRONT edge ends at the TOP of the photo.",
    photoTop: "FRONT edge at the TOP of the photo",
    tip: "Critical: top of photo = the edge that was FRONT.",
  },
};

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
