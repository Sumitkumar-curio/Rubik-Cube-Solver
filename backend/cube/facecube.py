"""Facelet string representation (54 stickers, Kociemba format)."""

from __future__ import annotations

from .defs import (
    FACELET_COUNT,
    CORNER_FACELET,
    EDGE_FACELET,
    CORNER_COLOR,
    EDGE_COLOR,
    COLOR_NAMES,
    U,
    R,
    F,
    D,
    L,
    B,
)
from .cubie import CubieCube


class FaceCube:
    __slots__ = ("f",)

    def __init__(self, facelets: str | None = None) -> None:
        if facelets is None:
            self.f = [U] * 9 + [R] * 9 + [F] * 9 + [D] * 9 + [L] * 9 + [B] * 9
        else:
            if len(facelets) != FACELET_COUNT:
                raise ValueError(f"Expected {FACELET_COUNT} facelets, got {len(facelets)}")
            self.f = []
            for ch in facelets:
                idx = COLOR_NAMES.find(ch.upper())
                if idx < 0:
                    raise ValueError(f"Invalid facelet color '{ch}'")
                self.f.append(idx)

    def to_string(self) -> str:
        return "".join(COLOR_NAMES[c] for c in self.f)

    def to_cubie_cube(self) -> CubieCube:
        cc = CubieCube()
        for i in range(8):
            fac = CORNER_FACELET[i]
            ori = 0
            for ori in range(3):
                if self.f[fac[ori]] in (U, D):
                    break
            col1 = self.f[fac[(ori + 1) % 3]]
            col2 = self.f[fac[(ori + 2) % 3]]
            for j in range(8):
                c = CORNER_COLOR[j]
                if c[1] == col1 and c[2] == col2:
                    cc.cp[i] = j
                    cc.co[i] = ori
                    break
            else:
                raise ValueError(f"Invalid corner colors at position {i}")

        for i in range(12):
            fac = EDGE_FACELET[i]
            for j in range(12):
                if (
                    self.f[fac[0]] == EDGE_COLOR[j][0]
                    and self.f[fac[1]] == EDGE_COLOR[j][1]
                ):
                    cc.ep[i] = j
                    cc.eo[i] = 0
                    break
                if (
                    self.f[fac[0]] == EDGE_COLOR[j][1]
                    and self.f[fac[1]] == EDGE_COLOR[j][0]
                ):
                    cc.ep[i] = j
                    cc.eo[i] = 1
                    break
            else:
                raise ValueError(f"Invalid edge colors at position {i}")
        return cc

    @staticmethod
    def from_cubie(cc: CubieCube) -> FaceCube:
        fc = FaceCube()
        for i in range(8):
            j = cc.cp[i]
            ori = cc.co[i]
            for k in range(3):
                fc.f[CORNER_FACELET[i][(k + ori) % 3]] = CORNER_COLOR[j][k]
        for i in range(12):
            j = cc.ep[i]
            ori = cc.eo[i]
            for k in range(2):
                fc.f[EDGE_FACELET[i][(k + ori) % 2]] = EDGE_COLOR[j][k]
        centers = [U, R, F, D, L, B]
        for face, col in enumerate(centers):
            fc.f[face * 9 + 4] = col
        return fc


_COLOR_ALIASES = {
    "white": "white", "w": "white", "u": "white",
    "yellow": "yellow", "y": "yellow", "d": "yellow",
    "red": "red", "r": "red",
    "orange": "orange", "o": "orange", "l": "orange",
    "blue": "blue", "b": "blue",
    "green": "green", "g": "green", "f": "green",
}


def colors_to_facelets(faces: dict[str, list[str]]) -> str:
    """
    Convert 6 faces × 9 absolute color names into a URFDLB facelet string.

    Each face list is row-major. Centers define which absolute color belongs
    to which face letter.
    """
    order = ["U", "R", "F", "D", "L", "B"]
    for face in order:
        if face not in faces or len(faces[face]) != 9:
            raise ValueError(f"Face {face} must have exactly 9 stickers")

    def norm(c: str) -> str:
        key = c.strip().lower()
        if key not in _COLOR_ALIASES:
            raise ValueError(f"Unknown sticker color '{c}'")
        return _COLOR_ALIASES[key]

    color_to_face: dict[str, str] = {}
    for face in order:
        center = norm(faces[face][4])
        if center in color_to_face:
            raise ValueError(
                f"Two faces share center color '{center}' "
                f"({color_to_face[center]} and {face}). Check photos."
            )
        color_to_face[center] = face

    if len(color_to_face) != 6:
        raise ValueError("Need six distinct center colors")

    out: list[str] = []
    for face in order:
        for sticker in faces[face]:
            out.append(color_to_face[norm(sticker)])
    return "".join(out)
