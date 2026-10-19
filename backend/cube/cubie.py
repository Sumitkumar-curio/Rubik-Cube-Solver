"""Cubie-level cube: corner/edge permutations + orientations."""

from __future__ import annotations

from .defs import (
    N_CORNER,
    N_EDGE,
    CORNER_FACELET,
    EDGE_FACELET,
    CORNER_COLOR,
    EDGE_COLOR,
    U,
    R,
    F,
    D,
    L,
    B,
)


class CubieCube:
    __slots__ = ("cp", "co", "ep", "eo")

    def __init__(
        self,
        cp: list[int] | None = None,
        co: list[int] | None = None,
        ep: list[int] | None = None,
        eo: list[int] | None = None,
    ) -> None:
        self.cp = cp if cp is not None else list(range(N_CORNER))
        self.co = co if co is not None else [0] * N_CORNER
        self.ep = ep if ep is not None else list(range(N_EDGE))
        self.eo = eo if eo is not None else [0] * N_EDGE

    def copy(self) -> CubieCube:
        return CubieCube(self.cp[:], self.co[:], self.ep[:], self.eo[:])

    def multiply(self, other: CubieCube) -> None:
        """self = self * other (apply other after self)."""
        # Corners
        new_cp = [0] * N_CORNER
        new_co = [0] * N_CORNER
        for i in range(N_CORNER):
            new_cp[i] = self.cp[other.cp[i]]
            new_co[i] = (self.co[other.cp[i]] + other.co[i]) % 3
        self.cp, self.co = new_cp, new_co

        # Edges
        new_ep = [0] * N_EDGE
        new_eo = [0] * N_EDGE
        for i in range(N_EDGE):
            new_ep[i] = self.ep[other.ep[i]]
            new_eo[i] = (other.eo[i] + self.eo[other.ep[i]]) % 2
        self.ep, self.eo = new_ep, new_eo

    # ----- Coordinates -----

    def get_twist(self) -> int:
        ret = 0
        for i in range(N_CORNER - 1):
            ret = 3 * ret + self.co[i]
        return ret

    def set_twist(self, twist: int) -> None:
        total = 0
        for i in range(N_CORNER - 2, -1, -1):
            self.co[i] = twist % 3
            total += self.co[i]
            twist //= 3
        self.co[N_CORNER - 1] = (3 - total % 3) % 3

    def get_flip(self) -> int:
        ret = 0
        for i in range(N_EDGE - 1):
            ret = 2 * ret + self.eo[i]
        return ret

    def set_flip(self, flip: int) -> None:
        total = 0
        for i in range(N_EDGE - 2, -1, -1):
            self.eo[i] = flip % 2
            total += self.eo[i]
            flip //= 2
        self.eo[N_EDGE - 1] = (2 - total % 2) % 2

    def get_slice_unsorted(self) -> int:
        """Combination index of FR,FL,BL,BR positions among 12 edges. 0..494"""
        a = 0
        x = 0
        for j in range(N_EDGE - 1, -1, -1):
            if 8 <= self.ep[j] <= 11:
                a += _n_choose_k(11 - j, x + 1)
                x += 1
        return a

    def get_slice_sorted(self) -> int:
        """Permutation of the 4 UD-slice edges FR,FL,BL,BR. 0..23"""
        slice_edge = [self.ep[i] - 8 for i in range(8, 12)]
        ret = 0
        for i in range(4):
            s = 0
            for j in range(i + 1, 4):
                if slice_edge[j] < slice_edge[i]:
                    s += 1
            ret = ret * (4 - i) + s
        return ret

    def set_slice_sorted(self, idx: int) -> None:
        perm = _int_to_perm(idx, 4)
        for i in range(4):
            self.ep[8 + i] = perm[i] + 8

    def get_corners(self) -> int:
        """Corner permutation 0..40319"""
        return _perm_to_int(self.cp, N_CORNER)

    def set_corners(self, idx: int) -> None:
        self.cp = _int_to_perm(idx, N_CORNER)

    def get_ud_edges(self) -> int:
        """Permutation of the 8 non-slice edges. 0..40319"""
        return _perm_to_int(self.ep[:8], 8)

    def set_ud_edges(self, idx: int) -> None:
        perm = _int_to_perm(idx, 8)
        for i in range(8):
            self.ep[i] = perm[i]

    def get_flipslice(self) -> int:
        return self.get_flip() * N_SLICE_RAW + self.get_slice_unsorted()

    def verify(self) -> str | None:
        """Return error message if invalid, else None."""
        edge_count = [0] * N_EDGE
        for e in self.ep:
            edge_count[e] += 1
        if any(c != 1 for c in edge_count):
            return "Invalid edge permutation"

        corner_count = [0] * N_CORNER
        for c in self.cp:
            corner_count[c] += 1
        if any(c != 1 for c in corner_count):
            return "Invalid corner permutation"

        if sum(self.eo) % 2 != 0:
            return "Invalid edge flip parity"

        if sum(self.co) % 3 != 0:
            return "Invalid corner twist"

        if _parity(self.ep) != _parity(self.cp):
            return "Edge/corner parity mismatch — cube may be illegally scrambled"

        return None


N_SLICE_RAW = 495


def _n_choose_k(n: int, k: int) -> int:
    if n < k:
        return 0
    if n == k or k == 0:
        return 1
    k = min(k, n - k)
    r = 1
    for i in range(k):
        r = r * (n - i) // (i + 1)
    return r


def _parity(perm: list[int]) -> int:
    s = 0
    for i in range(len(perm)):
        for j in range(i + 1, len(perm)):
            if perm[j] < perm[i]:
                s += 1
    return s % 2


def _perm_to_int(perm: list[int], n: int) -> int:
    arr = perm[:]
    ret = 0
    for i in range(n):
        s = 0
        for j in range(i + 1, n):
            if arr[j] < arr[i]:
                s += 1
        ret = ret * (n - i) + s
    return ret


def _int_to_perm(idx: int, n: int) -> list[int]:
    perm = [0] * n
    unused = list(range(n))
    for i in range(n):
        fact = _factorial(n - 1 - i)
        k = idx // fact
        idx %= fact
        perm[i] = unused.pop(k)
    return perm


def _factorial(n: int) -> int:
    r = 1
    for i in range(2, n + 1):
        r *= i
    return r


# Basic face-turn cubie cubes (90° clockwise looking at that face)
def _make_move_cubes() -> list[CubieCube]:
    # Corner permutations / orientations for U R F D L B quarter turns
    # cp: which corner goes to position i; co: orientation contributed
    defs = {
        # U: URF←UBR←ULB←UFL←URF ; D corners fixed; edges UR←UB←UL←UF
        "U": (
            [3, 0, 1, 2, 4, 5, 6, 7],
            [0] * 8,
            [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11],
            [0] * 12,
        ),
        # R: URF←DFR←DRB←UBR ; edges UR←FR←DR←BR
        "R": (
            [4, 1, 2, 0, 7, 5, 6, 3],
            [2, 0, 0, 1, 1, 0, 0, 2],
            [8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0],
            [0] * 12,
        ),
        # F: URF←UFL←DLF←DFR ; edges UF←FL←DF←FR ; flips on those edges
        "F": (
            [1, 5, 2, 3, 0, 4, 6, 7],
            [1, 2, 0, 0, 2, 1, 0, 0],
            [0, 9, 2, 3, 4, 8, 6, 7, 1, 5, 10, 11],
            [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0],
        ),
        # D: DFR←DRB←DBL←DLF
        "D": (
            [0, 1, 2, 3, 5, 6, 7, 4],
            [0] * 8,
            [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11],
            [0] * 12,
        ),
        # L: UFL←ULB←DBL←DLF
        "L": (
            [0, 2, 6, 3, 4, 1, 5, 7],
            [0, 1, 2, 0, 0, 2, 1, 0],
            [0, 1, 10, 3, 4, 5, 9, 7, 8, 2, 6, 11],
            [0] * 12,
        ),
        # B: UBR←DRB←DBL←ULB ; edges UB←BR←DB←BL
        "B": (
            [0, 1, 3, 7, 4, 5, 2, 6],
            [0, 0, 1, 2, 0, 0, 2, 1],
            [0, 1, 2, 11, 4, 5, 6, 10, 8, 9, 3, 7],
            [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1],
        ),
    }
    basic: dict[str, CubieCube] = {}
    for name, (cp, co, ep, eo) in defs.items():
        basic[name] = CubieCube(cp[:], co[:], ep[:], eo[:])

    moves: list[CubieCube] = []
    for face in ("U", "R", "F", "D", "L", "B"):
        m1 = basic[face]
        m2 = CubieCube()
        m2.multiply(m1)
        m2.multiply(m1)
        m3 = CubieCube()
        m3.multiply(m1)
        m3.multiply(m1)
        m3.multiply(m1)
        moves.extend([m1.copy(), m2, m3])
    return moves


MOVE_CUBE = _make_move_cubes()


def from_facelets(facelets: str) -> CubieCube:
    """Build CubieCube from 54-char URFDLB facelet string."""
    from .facecube import FaceCube

    return FaceCube(facelets).to_cubie_cube()
