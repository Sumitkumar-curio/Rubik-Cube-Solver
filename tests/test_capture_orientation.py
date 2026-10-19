#!/usr/bin/env python3
"""
Critical capture orientation tests — run BEFORE push:

    python3 tests/test_capture_orientation.py

Fails if LEFT/RIGHT yaw directions are swapped again.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from cube.solver import solve_optimized, apply_moves  # noqa: E402
from cube.validate import validate_facelets, validate_cube_state  # noqa: E402

SOLVED = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"
FACE_ORDER = ["U", "R", "F", "D", "L", "B"]
failures: list[str] = []


def ok(name: str) -> None:
    print(f"  OK  {name}")


def fail(name: str, detail: str) -> None:
    print(f"FAIL  {name}: {detail}")
    failures.append(name)


def face_after_yaw(yaw_deg: int) -> str:
    """Positive yaw = anti-clockwise from above; face toward camera."""
    n = yaw_deg % 360
    if n < 0:
        n += 360
    return {0: "F", 90: "L", 180: "B", 270: "R"}[n]


def test_physical_yaw_table() -> None:
    cases = {
        0: "F",
        -90: "R",  # clockwise 90°
        -180: "B",
        90: "L",  # anti-clockwise 90°
        180: "B",
        270: "R",
    }
    for yaw, expected in cases.items():
        got = face_after_yaw(yaw)
        if got != expected:
            fail(f"yaw {yaw}", f"expected {expected}, got {got}")
        else:
            ok(f"yaw {yaw:+d}° → {expected}")


def test_guide_js_poses() -> None:
    src = (ROOT / "frontend" / "guide-cube.js").read_text()
    home = int(re.search(r"export const HOME_RY = (-?\d+)", src).group(1))
    # R: HOME_RY - 90
    if "ry: HOME_RY - 90" not in src and f"ry: {home - 90}" not in src:
        # accept either expression form in GUIDE_POSES.R block
        m = re.search(r"\bR:\s*\{[^}]*ry:\s*([^,\n]+)", src)
        if not m or "HOME_RY - 90" not in m.group(1).replace(" ", ""):
            # evaluate simple HOME_RY ± n
            expr = m.group(1).strip() if m else ""
            if expr.replace(" ", "") not in (f"HOME_RY-90", str(home - 90)):
                fail("GUIDE R ry", f"must be HOME_RY - 90, got {expr!r}")
            else:
                ok("GUIDE R ry = HOME_RY - 90 (RIGHT / clockwise)")
        else:
            ok("GUIDE R ry = HOME_RY - 90 (RIGHT / clockwise)")
    else:
        ok("GUIDE R ry = HOME_RY - 90 (RIGHT / clockwise)")

    if "ry: HOME_RY + 90" not in src:
        m = re.search(r"\bL:\s*\{[^}]*ry:\s*([^,\n]+)", src)
        expr = m.group(1).strip() if m else ""
        if expr.replace(" ", "") not in ("HOME_RY+90", str(home + 90)):
            fail("GUIDE L ry", f"must be HOME_RY + 90, got {expr!r}")
        else:
            ok("GUIDE L ry = HOME_RY + 90 (LEFT / anti-clockwise)")
    else:
        ok("GUIDE L ry = HOME_RY + 90 (LEFT / anti-clockwise)")

    if "ry: HOME_RY - 180" not in src:
        fail("GUIDE B ry", "must be HOME_RY - 180 (clockwise path via RIGHT)")
    else:
        ok("GUIDE B ry = HOME_RY - 180")

    if 'anim: "yaw-right"' not in src.split("R:")[1].split("L:")[0]:
        fail("GUIDE R anim", "R must use yaw-right")
    else:
        ok("GUIDE R anim = yaw-right")

    l_block = src.split("L:")[1].split("U:")[0]
    if 'anim: "yaw-left"' not in l_block:
        fail("GUIDE L anim", "L must use yaw-left")
    else:
        ok("GUIDE L anim = yaw-left")

    # Regression: old swapped values
    if re.search(r"\bR:\s*\{[^}]*ry:\s*HOME_RY \+ 90", src):
        fail("regression R", "old swapped R pose (+90) returned")
    else:
        ok("regression: old wrong R (+90) absent")

    if re.search(r"\bL:\s*\{[^}]*ry:\s*HOME_RY - 90", src):
        fail("regression L", "old swapped L pose (-90) returned")
    else:
        ok("regression: old wrong L (-90) absent")

    # Labels
    r_lab = re.search(r'\bR:\s*\{[^}]*label:\s*"([^"]+)"', src)
    l_lab = re.search(r'\bL:\s*\{[^}]*label:\s*"([^"]+)"', src)
    if not r_lab or "clockwise" not in r_lab.group(1).lower() or "anti" in r_lab.group(1).lower():
        fail("GUIDE R label", f"must say clockwise, got {r_lab and r_lab.group(1)!r}")
    else:
        ok("GUIDE R label mentions clockwise")
    if not l_lab or "anti-clockwise" not in l_lab.group(1).lower():
        fail("GUIDE L label", f"must say anti-clockwise, got {l_lab and l_lab.group(1)!r}")
    else:
        ok("GUIDE L label mentions anti-clockwise")

    # Pose deltas must map to correct faces
    for face, delta in (("F", 0), ("R", -90), ("B", -180), ("L", 90)):
        if face_after_yaw(delta) != face:
            fail(f"pose map {face}", "physics mismatch")
        else:
            ok(f"pose delta {delta:+d} → camera {face}")


def test_capture_guide_copy() -> None:
    src = (ROOT / "frontend" / "capture-guide.js").read_text()
    # Extract R and L how/turn blocks roughly
    r_sec = src.split("R: {")[1].split("B: {")[0]
    l_sec = src.split("L: {")[1].split("U: {")[0]
    b_sec = src.split("B: {")[1].split("L: {")[0]

    if "anti-clockwise" in r_sec.lower() and "clockwise" in r_sec.lower():
        # allow tip mentioning something else? R must not say anti-clockwise for the turn
        if re.search(r"anti-clockwise", r_sec, re.I):
            fail("CAPTURE R copy", "RIGHT must not say anti-clockwise")
        else:
            ok("CAPTURE R copy = clockwise only")
    elif "clockwise" in r_sec.lower() and "anti-clockwise" not in r_sec.lower():
        ok("CAPTURE R copy = clockwise only")
    else:
        fail("CAPTURE R copy", "RIGHT must instruct clockwise turn")

    if "anti-clockwise" not in l_sec.lower():
        fail("CAPTURE L copy", "LEFT must instruct anti-clockwise")
    else:
        ok("CAPTURE L copy = anti-clockwise")

    if "clockwise" not in b_sec.lower():
        fail("CAPTURE B copy", "BACK should continue clockwise via RIGHT")
    else:
        ok("CAPTURE B copy = clockwise path")

    # yawFromHomeDeg fields
    for face, yaw in (("F", 0), ("R", -90), ("B", -180), ("L", 90)):
        m = re.search(rf"\b{face}:\s*\{{[^}}]*yawFromHomeDeg:\s*(-?\d+)", src)
        if not m or int(m.group(1)) != yaw:
            fail(f"yawFromHomeDeg {face}", f"expected {yaw}, got {m and m.group(1)}")
        elif face_after_yaw(int(m.group(1))) != face:
            fail(f"yawFromHomeDeg {face}", "does not bring face to camera")
        else:
            ok(f"yawFromHomeDeg {face} = {yaw}")


def test_colors_not_auto_rewritten() -> None:
    app = (ROOT / "frontend" / "app.js").read_text()
    if "reconcileAllFaces(" in app:
        fail("auto-color", "app.js still calls reconcileAllFaces (colors must not auto-change)")
    else:
        ok("app.js does not auto-reconcile colors")


def test_playback_ui_is_minimal() -> None:
    html = (ROOT / "frontend" / "index.html").read_text()
    app = (ROOT / "frontend" / "app.js").read_text()
    if "teach-overlay" in html:
        fail("teach overlay", "teach text overlay should be removed for mobile clarity")
    else:
        ok("no teach-overlay in HTML")
    if "hold-banner" in html:
        fail("hold banner", "hold banner text should be removed")
    else:
        ok("no hold-banner in HTML")
    if "stat-ms" in html or 'id="notes"' in html:
        fail("extra stats", "only move count should remain in result strip")
    else:
        ok("result strip is move-count only")
    if "faceletHistory" not in app:
        fail("playback history", "Prev needs faceletHistory for fast step-back")
    else:
        ok("faceletHistory enables fast Prev")
    if "resetPlayback()" in app.split("btn-play")[1].split("btn-pause")[0]:
        fail("play resets", "Play must not call resetPlayback (breaks Pause→Play)")
    else:
        ok("Play does not force reset")


def test_3d_keeps_user_sticker_colors() -> None:
    """Solve must paint with captured center colors, not default white-top scheme."""
    app = (ROOT / "frontend" / "app.js").read_text()
    cube = (ROOT / "frontend" / "cube3d.js").read_text()

    if "setColorScheme" not in cube:
        fail("cube3d scheme API", "missing setColorScheme")
    else:
        ok("cube3d.js exposes setColorScheme")

    if "this.letterHex" not in cube and "letterHex" not in cube:
        fail("cube3d letterHex", "paint must use mutable letterHex, not fixed LETTER_HEX")
    else:
        ok("cube3d paint uses mutable letterHex")

    if re.search(r"\bLETTER_HEX\b", cube):
        fail("cube3d LETTER_HEX", "stale LETTER_HEX reference — use letterHex / DEFAULT_LETTER_HEX")
    else:
        ok("no stale LETTER_HEX reference")

    if "paintCubeWithUserColors" not in app:
        fail("app paint helper", "missing paintCubeWithUserColors")
    else:
        ok("app.js has paintCubeWithUserColors")

    # applySolution must use user colors (not bare Cube3D.paint)
    apply_block = app.split("function applySolution")[1].split("function showResult")[0]
    if "paintCubeWithUserColors" not in apply_block:
        fail("applySolution", "must call paintCubeWithUserColors so colors stay true")
    else:
        ok("applySolution keeps user sticker colors")

    if "buildFaceletHistory" not in apply_block:
        fail("applySolution history", "must build whole-sequence faceletHistory")
    else:
        ok("applySolution builds whole-sequence faceletHistory")

    if "colorSchemeFromFaces" not in app:
        fail("scheme from centers", "missing colorSchemeFromFaces")
    else:
        ok("colorSchemeFromFaces builds scheme from centers")

    # Turns must bake mesh rotation — never paint() after animateMove
    anim = cube.split("async animateMove")[1].split("async play")[0]
    if "this.paint(" in anim or ".paint(" in anim:
        fail("bake turns", "animateMove must not paint() after rotation")
    else:
        ok("animateMove bakes turns without repainting")

    if "_bakeCubie" not in cube or "attach(" not in cube:
        fail("bake API", "need attach + _bakeCubie so stickers stay on pieces")
    else:
        ok("cube3d bakes layer turns with attach")

    step = cube.split("async stepOnce")[1].split("async waitUntilIdle")[0]
    if "this.paint(" in step:
        fail("stepOnce paint", "stepOnce must not paint after a turn")
    else:
        ok("stepOnce does not repaint stickers")

    # Contract: yellow-on-top cube must map U → yellow hex, not white
    vision = (ROOT / "frontend" / "vision.js").read_text()

    def hex_for(name: str) -> str:
        m = re.search(rf'{name}:\s*"([^"]+)"', vision)
        assert m, name
        return m.group(1).lower()

    if hex_for("yellow") == hex_for("white"):
        fail("hex distinct", "yellow and white must differ")
    else:
        ok("yellow ≠ white (non-standard orientation can be shown)")


def test_solved_and_swapped_lr() -> None:
    err = validate_facelets(SOLVED)
    if err:
        fail("solved validate_facelets", err)
    else:
        ok("solved facelets valid")

    err = validate_cube_state(SOLVED)
    if err:
        fail("solved validate_cube_state", err)
    else:
        ok("solved cube state valid")

    # Swap R and L face blocks (9 stickers each) — simulates wrong capture guide
    faces = {f: SOLVED[i * 9 : (i + 1) * 9] for i, f in enumerate(FACE_ORDER)}
    faces["R"], faces["L"] = faces["L"], faces["R"]
    swapped = "".join(faces[f] for f in FACE_ORDER)
    if swapped == SOLVED:
        fail("swap L/R", "swap produced identical facelets")
    else:
        ok("L/R photo swap changes facelets")

    # Centers become wrong (R center is L letter etc.) after naive swap of blocks
    # when letters are face IDs — this must not validate as the solved cube.
    if validate_facelets(swapped) is None and swapped != SOLVED:
        # centers would be L in R slot → validate_facelets should fail
        fail("swapped centers", "expected center validation failure")
    else:
        ok("swapped L/R fails facelet center check (or differs)")


def test_scramble_still_solves() -> None:
    from cube.solver import scramble

    facelets, _ = scramble(12)
    r = solve_optimized(facelets, timeout_s=15, target=24)
    if apply_moves(facelets, r.moves) != SOLVED:
        fail("scramble solve", "moves did not reach solved")
    else:
        ok(f"scramble solved in {r.move_count} moves")


def main() -> int:
    print("=== Physical yaw ===")
    test_physical_yaw_table()
    print("=== guide-cube.js ===")
    test_guide_js_poses()
    print("=== capture-guide.js ===")
    test_capture_guide_copy()
    print("=== Color safety ===")
    test_colors_not_auto_rewritten()
    test_3d_keeps_user_sticker_colors()
    print("=== Playback UI ===")
    test_playback_ui_is_minimal()
    print("=== Cube validity ===")
    test_solved_and_swapped_lr()
    print("=== Solver smoke ===")
    test_scramble_still_solves()

    print()
    if failures:
        print(f"{len(failures)} FAILURE(S) — DO NOT PUSH")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("ALL CAPTURE ORIENTATION TESTS PASSED — safe to push")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
