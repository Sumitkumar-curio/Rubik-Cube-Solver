"""Validate facelet strings for solvability prerequisites."""

from __future__ import annotations

from .defs import FACELET_COUNT, COLOR_NAMES


def validate_facelets(facelets: str) -> str | None:
    if len(facelets) != FACELET_COUNT:
        return f"Expected {FACELET_COUNT} stickers, got {len(facelets)}. Capture all 6 faces (9 stickers each)."

    facelets = facelets.upper()
    counts = {c: 0 for c in COLOR_NAMES}
    for ch in facelets:
        if ch not in counts:
            return f"Invalid color code '{ch}'. Fix sticker colors and try again."
        counts[ch] += 1

    bad = [f"{c}×{n}" for c, n in counts.items() if n != 9]
    if bad:
        return (
            "Each color must appear exactly 9 times. "
            f"Current counts: {', '.join(f'{c}={n}' for c, n in counts.items())}. "
            "Tap stickers to correct misreads."
        )

    # Centers must be URFDLB in positions 4,13,22,31,40,49
    # (true after colors_to_facelets maps by centers)
    expected_centers = "URFDLB"
    for i, face in enumerate(expected_centers):
        center = facelets[i * 9 + 4]
        if center != face:
            return (
                f"Internal center mismatch on face {face} (got {center}). "
                "Two uploaded faces may share the same center color — "
                "each face center must be a different color."
            )
    return None


def validate_cube_state(facelets: str) -> str | None:
    """Facelets + cubie parity / orientation checks with friendly messages."""
    err = validate_facelets(facelets)
    if err:
        return err
    try:
        from .facecube import FaceCube

        cc = FaceCube(facelets).to_cubie_cube()
    except ValueError as e:
        return (
            f"Could not read cube pieces: {e}. "
            "A sticker is likely wrong — check corners/edges with Edit colors. "
            "Also verify photo orientation (UP edge at top for side faces)."
        )
    verr = cc.verify()
    if verr:
        return (
            f"{verr}. "
            "This usually means stickers were read wrong or a photo was rotated. "
            "Re-check faces (especially UP/DOWN orientation) and tap to fix colors."
        )
    return None
