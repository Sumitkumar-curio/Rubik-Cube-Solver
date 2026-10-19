"""Layer-by-layer beginner-style solver (piece-by-piece BFS). Longer, human-like."""

from __future__ import annotations

import time
from collections import deque

from .cubie import CubieCube, MOVE_CUBE, from_facelets
from .defs import MOVE_NAMES
from .facecube import FaceCube


def _state_key(cc: CubieCube) -> tuple:
    return (tuple(cc.cp), tuple(cc.co), tuple(cc.ep), tuple(cc.eo))


def _edges_ok(cc: CubieCube, up_to: int) -> bool:
    for i in range(up_to + 1):
        if cc.ep[i] != i or cc.eo[i] != 0:
            return False
    return True


def _corners_ok(cc: CubieCube, up_to: int) -> bool:
    for i in range(up_to + 1):
        if cc.cp[i] != i or cc.co[i] != 0:
            return False
    return True


def _bfs(cc: CubieCube, goal, max_depth: int = 9) -> list[int] | None:
    if goal(cc):
        return []
    start = _state_key(cc)
    q: deque[tuple[CubieCube, list[int]]] = deque([(cc.copy(), [])])
    seen = {start}
    while q:
        cur, path = q.popleft()
        if len(path) >= max_depth:
            continue
        last_face = path[-1] // 3 if path else -1
        for m in range(18):
            face = m // 3
            if face == last_face:
                continue
            nxt = cur.copy()
            nxt.multiply(MOVE_CUBE[m])
            k = _state_key(nxt)
            if k in seen:
                continue
            if goal(nxt):
                return path + [m]
            seen.add(k)
            q.append((nxt, path + [m]))
    return None


def solve_beginner(facelets: str, timeout_s: float = 20.0) -> list[str]:
    """
    Place edges then corners one-by-one (keeps earlier pieces solved).
    Typical length ~40–90 moves — closer to a human beginner method.
    Falls back to finishing whatever remains with a broader BFS if needed.
    """
    deadline = time.time() + timeout_s
    cc = from_facelets(facelets)
    all_moves: list[int] = []

    # Edges first (UR UF UL UB DR DF DL DB FR FL BL BR)
    for ei in range(12):
        if time.time() > deadline:
            break
        if _edges_ok(cc, ei):
            continue

        def goal(c: CubieCube, _ei=ei) -> bool:
            return _edges_ok(c, _ei)

        seg = _bfs(cc, goal, max_depth=8)
        if seg is None:
            # Try a bit deeper for stubborn pieces
            seg = _bfs(cc, goal, max_depth=10)
        if seg is None:
            continue
        for m in seg:
            cc.multiply(MOVE_CUBE[m])
        all_moves.extend(seg)

    # Then corners
    for ci in range(8):
        if time.time() > deadline:
            break
        if _corners_ok(cc, ci) and _edges_ok(cc, 11):
            continue

        def goal(c: CubieCube, _ci=ci) -> bool:
            return _edges_ok(c, 11) and _corners_ok(c, _ci)

        seg = _bfs(cc, goal, max_depth=8)
        if seg is None:
            seg = _bfs(cc, goal, max_depth=11)
        if seg is None:
            continue
        for m in seg:
            cc.multiply(MOVE_CUBE[m])
        all_moves.extend(seg)

    # If not fully solved, try one final BFS to identity (may fail on hard states)
    solved = CubieCube()
    if _state_key(cc) != _state_key(solved):
        if time.time() < deadline:

            def goal_solved(c: CubieCube) -> bool:
                return _state_key(c) == _state_key(solved)

            # Prefer finishing via two-phase if available
            try:
                from .solver import Search

                search = Search()
                search.start = cc
                rest = search.solve_optimized(
                    cc,
                    timeout_s=max(1.0, deadline - time.time()),
                    target=24,
                )
                if rest:
                    all_moves.extend(rest)
                    for m in rest:
                        cc.multiply(MOVE_CUBE[m])
            except Exception:
                seg = _bfs(cc, goal_solved, max_depth=12)
                if seg:
                    all_moves.extend(seg)

    return [MOVE_NAMES[m] for m in all_moves]
