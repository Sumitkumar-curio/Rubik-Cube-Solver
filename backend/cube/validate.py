"""Validate facelet strings for solvability prerequisites."""

from __future__ import annotations

from .defs import FACELET_COUNT, COLOR_NAMES


def validate_facelets(facelets: str) -> str | None:
    if len(facelets) != FACELET_COUNT:
        return f"Expected {FACELET_COUNT} stickers, got {len(facelets)}"

    facelets = facelets.upper()
    counts = {c: 0 for c in COLOR_NAMES}
    for ch in facelets:
        if ch not in counts:
            return f"Invalid color '{ch}' (use U,R,F,D,L,B)"
        counts[ch] += 1

    for c, n in counts.items():
        if n != 9:
            return f"Color {c} appears {n} times (need exactly 9)"

    # Centers must be URFDLB in positions 4,13,22,31,40,49
    expected_centers = "URFDLB"
    for i, face in enumerate(expected_centers):
        center = facelets[i * 9 + 4]
        if center != face:
            return (
                f"Center of face {face} is '{center}'. "
                "Hold the cube so centers match: U=white top, D=yellow bottom, "
                "F=green, B=blue, R=red, L=orange (or remap colors to face letters)."
            )
    return None
