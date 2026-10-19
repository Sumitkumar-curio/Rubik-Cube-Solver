#!/usr/bin/env python3
"""Quick solver sanity checks."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from cube.solver import scramble, solve_optimized, apply_moves
from cube.facecube import colors_to_facelets
from cube.defs import COLOR_NAMES

SOLVED = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"


def test_identity():
    r = solve_optimized(SOLVED, timeout_s=2)
    assert r.move_count == 0


def test_scramble_solves():
    facelets, _ = scramble(15)
    r = solve_optimized(facelets, timeout_s=20)
    assert apply_moves(facelets, r.moves) == SOLVED
    assert r.move_count <= 24
    print(f"OK scramble solved in {r.move_count} moves ({r.elapsed_ms} ms)")


def test_colors_roundtrip():
    # Build color faces from solved facelets
    letter_to_color = {
        "U": "white", "R": "red", "F": "green",
        "D": "yellow", "L": "orange", "B": "blue",
    }
    faces = {}
    for i, face in enumerate("URFDLB"):
        faces[face] = [letter_to_color[ch] for ch in SOLVED[i * 9 : i * 9 + 9]]
    assert colors_to_facelets(faces) == SOLVED


if __name__ == "__main__":
    test_identity()
    test_colors_roundtrip()
    test_scramble_solves()
    print("All tests passed")
