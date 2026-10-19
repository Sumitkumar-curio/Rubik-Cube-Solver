"""IDA* search with pattern-database pruning tables (optimal / near-optimal)."""

from __future__ import annotations

import time

from .cubie import CubieCube, MOVE_CUBE, from_facelets
from .defs import MOVE_NAMES, N_TWIST, N_FLIP, N_CORNERS_PERM, N_UD_EDGES
from .tables import TABLES, PHASE2_MOVES


def _heuristic(twist: int, flip: int, slice_: int, corners: int, ud: int, ss: int) -> int:
    """Admissible lower bound using phase pattern databases."""
    T = TABLES
    h = max(
        T.slice_twist_prun[slice_ * N_TWIST + twist],
        T.slice_flip_prun[slice_ * N_FLIP + flip],
    )
    if twist == 0 and flip == 0 and slice_ == 0:
        h = max(
            h,
            T.slice_corners_prun[ss * N_CORNERS_PERM + corners],
            T.slice_ud_edges_prun[ss * N_UD_EDGES + ud],
        )
    return h


def solve_ida(
    facelets: str,
    timeout_s: float = 20.0,
    max_depth: int = 20,
) -> list[str] | None:
    """
    IDA* toward a shortest solution (≤20 when it finishes in time).
    Uses Kociemba move/pruning tables as pattern databases.
    """
    TABLES.ensure()
    T = TABLES
    deadline = time.time() + timeout_s
    cc = from_facelets(facelets)

    twist0 = cc.get_twist()
    flip0 = cc.get_flip()
    slice0 = cc.get_slice_unsorted()
    corners0 = cc.get_corners()
    ud0 = cc.get_ud_edges()
    ss0 = cc.get_slice_sorted()

    if twist0 == flip0 == slice0 == corners0 == ud0 == ss0 == 0:
        return []

    found: list[int] | None = None

    def search(
        twist, flip, slice_, corners, ud, ss, g, bound, last_face, path: list[int]
    ) -> int:
        nonlocal found
        if time.time() > deadline:
            return 10**9
        h = _heuristic(twist, flip, slice_, corners, ud, ss)
        f = g + h
        if f > bound:
            return f
        if h == 0 and twist == flip == slice_ == corners == ud == ss == 0:
            found = path[:]
            return -1  # signal success

        min_exceed = 10**9
        in_g1 = twist == 0 and flip == 0 and slice_ == 0
        moves = PHASE2_MOVES if in_g1 else range(18)

        for m in moves:
            face = m // 3
            if face == last_face:
                continue
            if last_face != -1 and face % 3 == last_face % 3 and face < last_face:
                continue

            t2 = T.twist_move[twist][m]
            f2 = T.flip_move[flip][m]
            s2 = T.slice_move[slice_][m]
            c2 = T.corners_move[corners][m]
            u2 = T.ud_edges_move[ud][m]
            ss2 = T.slice_sorted_move[ss][m]

            path.append(m)
            t = search(t2, f2, s2, c2, u2, ss2, g + 1, bound, face, path)
            path.pop()
            if t == -1:
                return -1
            if t < min_exceed:
                min_exceed = t
        return min_exceed

    bound = _heuristic(twist0, flip0, slice0, corners0, ud0, ss0)
    path: list[int] = []
    while bound <= max_depth:
        if time.time() > deadline:
            break
        t = search(twist0, flip0, slice0, corners0, ud0, ss0, 0, bound, -1, path)
        if t == -1 and found is not None:
            return [MOVE_NAMES[m] for m in found]
        if t >= 10**9:
            break
        bound = t

    # Fallback: seed with two-phase, then try to shorten with remaining time
    from .solver import Search

    seed = Search()
    seed.start = cc
    idx = seed.solve_optimized(cc, timeout_s=max(2.0, timeout_s * 0.35), target=20)
    if idx is None:
        return None

    best = idx
    upper = len(best)
    bound = _heuristic(twist0, flip0, slice0, corners0, ud0, ss0)
    found = None
    while bound < upper and time.time() < deadline:
        t = search(twist0, flip0, slice0, corners0, ud0, ss0, 0, bound, -1, path)
        if t == -1 and found is not None:
            if len(found) < len(best):
                best = found
                upper = len(best)
            found = None
            bound = _heuristic(twist0, flip0, slice0, corners0, ud0, ss0)
            continue
        if t >= 10**9:
            break
        bound = t

    return [MOVE_NAMES[m] for m in best]
