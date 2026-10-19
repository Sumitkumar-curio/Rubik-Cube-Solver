"""
CFOP-style solver for teachable, human-readable solutions.

Stages: Cross → F2L (pair search) → 2-look OLL → 2-look PLL.
Not globally optimal — designed for following along on a physical cube.
"""

from __future__ import annotations

import time
from collections import deque

from .cubie import CubieCube, MOVE_CUBE, from_facelets
from .defs import MOVE_NAMES
from .facecube import FaceCube

SOLVED = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"


def _key(cc: CubieCube) -> tuple:
    return (tuple(cc.cp), tuple(cc.co), tuple(cc.ep), tuple(cc.eo))


def _apply(cc: CubieCube, moves: list[str]) -> None:
    idx = {n: i for i, n in enumerate(MOVE_NAMES)}
    for mv in moves:
        cc.multiply(MOVE_CUBE[idx[mv]])


def _parse_alg(alg: str) -> list[str]:
    return [p for p in alg.replace("(", " ").replace(")", " ").split() if p]


def _bfs(cc: CubieCube, goal, max_depth: int = 8) -> list[str] | None:
    if goal(cc):
        return []
    q: deque[tuple[CubieCube, list[int]]] = deque([(cc.copy(), [])])
    seen = {_key(cc)}
    while q:
        cur, path = q.popleft()
        if len(path) >= max_depth:
            continue
        last = path[-1] // 3 if path else -1
        for m in range(18):
            if m // 3 == last:
                continue
            nxt = cur.copy()
            nxt.multiply(MOVE_CUBE[m])
            k = _key(nxt)
            if k in seen:
                continue
            if goal(nxt):
                return [MOVE_NAMES[x] for x in path + [m]]
            seen.add(k)
            q.append((nxt, path + [m]))
    return None


def _cross_ok(cc: CubieCube) -> bool:
    # White on D: edges DR,DF,DL,DB (indices 4,5,6,7) solved
    for i in (4, 5, 6, 7):
        if cc.ep[i] != i or cc.eo[i] != 0:
            return False
    return True


def _f2l_slot_ok(cc: CubieCube, corner: int, edge: int) -> bool:
    return (
        cc.cp[corner] == corner
        and cc.co[corner] == 0
        and cc.ep[edge] == edge
        and cc.eo[edge] == 0
    )


def _yellow_face_oriented(fc: FaceCube) -> bool:
    # U face all U
    return all(fc.f[i] == 0 for i in range(9))  # U=0


def _u_edges_oriented(cc: CubieCube) -> bool:
    # UF UR UB UL (1,0,3,2) oriented and on U? For OLL cross: yellow edges on U
    # Simpler: edge orientation eo for U edges in positions 0,1,2,3 is 0 and pieces are U edges
    for i in (0, 1, 2, 3):
        if cc.eo[i] != 0:
            return False
        if cc.ep[i] > 3:
            return False
    return True


# 2-look OLL / PLL algorithms (standard, yellow on U)
OLL_EDGE_ALGS = {
    # Detected by pattern of U-layer edge orientations after cross attempt
    "dot": "F R U R' U' F' F U R U' R' F'",  # actually: F R U R' U' F' + f R U R' U' f'
    "line": "F R U R' U' F'",
    "l": "F U R U' R' F'",
}

# Simpler fixed sequences we'll select by trying small set
OLL_TRY = [
    "",  # already
    "F R U R' U' F'",
    "F U R U' R' F'",
    "R U R' U R U2 R'",
    "R U2 R' U' R U' R'",
    "F R U R' U' F' U F R U R' U' F'",
    "R U R' U R U2 R' F R U R' U' F'",
    "F R U R' U' R U R' U' F'",
]

PLL_TRY = [
    "",
    "R U' R U R U R U' R' U' R2",  # Ub
    "R2 U R U R' U' R' U' R' U R'",  # Ua
    "M2 U M2 U2 M2 U M2",  # H (M = L' R)
    "M2 U M2 U M' U2 M2 U2 M'",  # Z approximate — use T
    "R U R' U' R' F R2 U' R' U' R U R' F'",  # T
    "R' U L' U2 R U' R' U2 R L",  # Ja-ish
    "R U R' F' R U R' U' R' F R2 U' R'",  # Y? T variant
    "x' R U' R' D R U R' D' R U R' D R U' R' D' x",  # E — skip if bad
]


def _normalize_m_moves(moves: list[str]) -> list[str]:
    """Expand M/M'/M2 and x/x' into face turns."""
    out: list[str] = []
    expand = {
        "M": ["L'", "R"],
        "M'": ["L", "R'"],
        "M2": ["L2", "R2"],
        "x": ["R", "L'", "L'", "R"],  # rough — avoid cube rotations in solution
    }
    # Better: rewrite H-perm without M
    remapped = {
        "M2 U M2 U2 M2 U M2": ["R2", "L2", "U", "R2", "L2", "U2", "R2", "L2", "U", "R2", "L2"],
    }
    # If whole sequence matches, use remapped — handled by replacing PLL_TRY
    for mv in moves:
        if mv in expand:
            out.extend(expand[mv])
        elif mv.startswith("x") or mv.startswith("y") or mv.startswith("z"):
            continue  # drop cube rotations — algs chosen without them
        else:
            out.append(mv)
    return out


# Clean PLL without M/x
PLL_ALGS = [
    [],
    _parse_alg("R2 U R U R' U' R' U' R' U R'"),  # Ua
    _parse_alg("R U' R U R U R U' R' U' R2"),  # Ub
    _parse_alg("R2 L2 U R2 L2 U2 R2 L2 U R2 L2"),  # H-like
    _parse_alg("R U R' U' R' F R2 U' R' U' R U R' F'"),  # T
    _parse_alg("R' U R' U' R' U' R' U R U R2"),  # alt U
    _parse_alg("F R U' R' U' R U R' F' R U R' U' R' F R F'"),  # Y
    _parse_alg("R U R' F' R U2 R' U2 R' F R U R U2 R'"),  # Aa
    _parse_alg("R' F R' B2 R F' R' B2 R2"),  # Ab-ish
]


def _u_face_all_yellow(cc: CubieCube) -> bool:
    fc = FaceCube.from_cubie(cc)
    return all(fc.f[i] == 0 for i in range(9))  # U stickers


def _is_solved(cc: CubieCube) -> bool:
    return FaceCube.from_cubie(cc).to_string() == SOLVED


def solve_cfop(facelets: str, timeout_s: float = 30.0) -> tuple[list[str], list[dict]]:
    """
    Returns (moves, stages) where stages are teaching annotations.
    """
    deadline = time.time() + timeout_s
    cc = from_facelets(facelets)
    all_moves: list[str] = []
    stages: list[dict] = []

    def add_stage(name: str, moves: list[str]) -> None:
        nonlocal cc
        if not moves:
            return
        _apply(cc, moves)
        all_moves.extend(moves)
        stages.append({"name": name, "moves": moves, "start_index": len(all_moves) - len(moves)})

    # —— Cross ——
    if not _cross_ok(cc):
        seg = _bfs(cc, _cross_ok, max_depth=8)
        if seg is None:
            seg = _bfs(cc, _cross_ok, max_depth=10)
        if seg:
            add_stage("Cross", seg)

    # —— F2L slots: DFR+FR (4,8), DLF+FL (5,9), DBL+BL (6,10), DRB+BR (7,11) ——
    slots = [(4, 8), (5, 9), (6, 10), (7, 11)]
    for si, (corner, edge) in enumerate(slots):
        if time.time() > deadline:
            break
        if _f2l_slot_ok(cc, corner, edge) and _cross_ok(cc):
            continue

        def goal(c, _c=corner, _e=edge):
            if not _cross_ok(c):
                return False
            # keep previously solved slots
            for cj, ej in slots[: si + 1]:
                if not _f2l_slot_ok(c, cj, ej):
                    return False
            return True

        seg = _bfs(cc, goal, max_depth=9)
        if seg is None:
            seg = _bfs(cc, goal, max_depth=11)
        if seg:
            add_stage(f"F2L pair {si + 1}", seg)

    # —— OLL: try algorithm set until U face is all yellow ——
    if not _u_face_all_yellow(cc) and time.time() < deadline:
        best = None
        for alg in OLL_TRY:
            trial = cc.copy()
            moves = _parse_alg(alg) if alg else []
            _apply(trial, moves)
            # Allow U setup moves
            for setup in [[], ["U"], ["U2"], ["U'"]]:
                t2 = trial.copy()
                _apply(t2, setup)
                if _u_face_all_yellow(t2):
                    best = setup + moves
                    break
            if best is not None:
                break
            # try alg then setup
            for setup in [["U"], ["U2"], ["U'"]]:
                t2 = cc.copy()
                _apply(t2, setup + moves)
                if _u_face_all_yellow(t2):
                    best = setup + moves
                    break
            if best is not None:
                break
        if best:
            add_stage("OLL (orient last layer)", best)

    # —— PLL: try until solved ——
    if not _is_solved(cc) and time.time() < deadline:
        best = None
        for alg in PLL_ALGS:
            for setup in [[], ["U"], ["U2"], ["U'"]]:
                for auf in [[], ["U"], ["U2"], ["U'"]]:
                    trial = cc.copy()
                    seq = setup + alg + auf
                    _apply(trial, seq)
                    if _is_solved(trial):
                        best = seq
                        break
                if best is not None:
                    break
            if best is not None:
                break
        if best:
            add_stage("PLL (permute last layer)", best)

    # Finish with two-phase if needed
    if not _is_solved(cc):
        from .solver import Search

        rest = Search()
        rest.start = cc
        idx = rest.solve_optimized(
            cc, timeout_s=max(2.0, deadline - time.time()), target=24
        )
        if idx:
            moves = [MOVE_NAMES[m] for m in idx]
            add_stage("Finish (cleanup)", moves)
        else:
            raise TimeoutError(
                "CFOP could not finish this scramble in time. Try Kociemba or IDA*."
            )

    return all_moves, stages
