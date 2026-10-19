"""Move tables and pruning tables for Kociemba two-phase search."""

from __future__ import annotations

import pickle
import time
from collections import deque
from itertools import combinations
from pathlib import Path

from .defs import (
    N_TWIST,
    N_FLIP,
    N_MOVE,
    N_CORNERS_PERM,
    N_UD_EDGES,
    N_SLICE_SORTED,
)
from .cubie import CubieCube, MOVE_CUBE, N_SLICE_RAW

CACHE_DIR = Path(__file__).resolve().parent / "_cache"
CACHE_FILE = CACHE_DIR / "tables_v1.pkl"

PHASE2_MOVES = [0, 1, 2, 4, 7, 9, 10, 11, 13, 16]  # U*, R2, F2, D*, L2, B2
ALL_MOVES = list(range(N_MOVE))


class Tables:
    def __init__(self) -> None:
        self.twist_move: list[list[int]] = []
        self.flip_move: list[list[int]] = []
        self.slice_move: list[list[int]] = []
        self.corners_move: list[list[int]] = []
        self.ud_edges_move: list[list[int]] = []
        self.slice_sorted_move: list[list[int]] = []
        self.slice_twist_prun: list[int] = []
        self.slice_flip_prun: list[int] = []
        self.slice_corners_prun: list[int] = []
        self.slice_ud_edges_prun: list[int] = []
        self.ready = False

    def ensure(self) -> None:
        if self.ready:
            return
        if CACHE_FILE.exists():
            try:
                with open(CACHE_FILE, "rb") as f:
                    data = pickle.load(f)
                for k, v in data.items():
                    setattr(self, k, v)
                self.ready = True
                print("[TWENTY] Loaded cached tables", flush=True)
                return
            except Exception:
                pass
        self._build()
        self.ready = True
        try:
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            payload = {k: v for k, v in self.__dict__.items() if k != "ready"}
            with open(CACHE_FILE, "wb") as f:
                pickle.dump(payload, f, protocol=pickle.HIGHEST_PROTOCOL)
        except Exception as exc:
            print(f"[TWENTY] Cache write skipped: {exc}", flush=True)

    def _build(self) -> None:
        t0 = time.time()
        print("[TWENTY] Building move tables (first run ~30–90s)…", flush=True)
        self.twist_move = self._build_twist()
        self.flip_move = self._build_flip()
        self.slice_move = self._build_slice()
        self.slice_sorted_move = self._build_slice_sorted()
        self.corners_move = self._build_corners()
        self.ud_edges_move = self._build_ud_edges()

        print("[TWENTY] Building pruning tables…", flush=True)
        self.slice_twist_prun = self._prun2(
            N_SLICE_RAW,
            N_TWIST,
            self.slice_move,
            self.twist_move,
            ALL_MOVES,
        )
        self.slice_flip_prun = self._prun2(
            N_SLICE_RAW,
            N_FLIP,
            self.slice_move,
            self.flip_move,
            ALL_MOVES,
        )
        self.slice_corners_prun = self._prun2(
            N_SLICE_SORTED,
            N_CORNERS_PERM,
            self.slice_sorted_move,
            self.corners_move,
            PHASE2_MOVES,
        )
        self.slice_ud_edges_prun = self._prun2(
            N_SLICE_SORTED,
            N_UD_EDGES,
            self.slice_sorted_move,
            self.ud_edges_move,
            PHASE2_MOVES,
        )
        print(f"[TWENTY] Tables ready in {time.time() - t0:.1f}s", flush=True)

    def _build_twist(self) -> list[list[int]]:
        t = [[0] * N_MOVE for _ in range(N_TWIST)]
        for i in range(N_TWIST):
            cc = CubieCube()
            cc.set_twist(i)
            for m in range(N_MOVE):
                tmp = cc.copy()
                tmp.multiply(MOVE_CUBE[m])
                t[i][m] = tmp.get_twist()
        return t

    def _build_flip(self) -> list[list[int]]:
        t = [[0] * N_MOVE for _ in range(N_FLIP)]
        for i in range(N_FLIP):
            cc = CubieCube()
            cc.set_flip(i)
            for m in range(N_MOVE):
                tmp = cc.copy()
                tmp.multiply(MOVE_CUBE[m])
                t[i][m] = tmp.get_flip()
        return t

    def _build_slice(self) -> list[list[int]]:
        t = [[0] * N_MOVE for _ in range(N_SLICE_RAW)]
        for i in range(N_SLICE_RAW):
            cc = CubieCube()
            _set_slice(cc, i)
            for m in range(N_MOVE):
                tmp = cc.copy()
                tmp.multiply(MOVE_CUBE[m])
                t[i][m] = tmp.get_slice_unsorted()
        return t

    def _build_slice_sorted(self) -> list[list[int]]:
        t = [[0] * N_MOVE for _ in range(N_SLICE_SORTED)]
        for i in range(N_SLICE_SORTED):
            cc = CubieCube()
            cc.set_slice_sorted(i)
            for m in range(N_MOVE):
                tmp = cc.copy()
                tmp.multiply(MOVE_CUBE[m])
                t[i][m] = tmp.get_slice_sorted()
        return t

    def _build_corners(self) -> list[list[int]]:
        t = [[0] * N_MOVE for _ in range(N_CORNERS_PERM)]
        for i in range(N_CORNERS_PERM):
            cc = CubieCube()
            cc.set_corners(i)
            for m in range(N_MOVE):
                tmp = cc.copy()
                tmp.multiply(MOVE_CUBE[m])
                t[i][m] = tmp.get_corners()
            if i % 8000 == 0:
                print(f"  corners {i}/{N_CORNERS_PERM}", flush=True)
        return t

    def _build_ud_edges(self) -> list[list[int]]:
        t = [[0] * N_MOVE for _ in range(N_UD_EDGES)]
        for i in range(N_UD_EDGES):
            cc = CubieCube()
            # Keep slice edges fixed in place so UD-edge perm is well-defined
            cc.set_ud_edges(i)
            for m in range(N_MOVE):
                tmp = cc.copy()
                tmp.multiply(MOVE_CUBE[m])
                t[i][m] = tmp.get_ud_edges()
            if i % 8000 == 0:
                print(f"  ud_edges {i}/{N_UD_EDGES}", flush=True)
        return t

    def _prun2(
        self,
        n_a: int,
        n_b: int,
        move_a: list[list[int]],
        move_b: list[list[int]],
        moves: list[int],
    ) -> list[int]:
        size = n_a * n_b
        prun = bytearray(b"\xff") * size
        prun[0] = 0
        q: deque[int] = deque([0])
        while q:
            i = q.popleft()
            depth = prun[i]
            a, b = divmod(i, n_b)
            nd = depth + 1
            for m in moves:
                j = move_a[a][m] * n_b + move_b[b][m]
                if prun[j] == 255:
                    prun[j] = nd
                    q.append(j)
        # Convert to list[int]; unreachable → 0 (safe underestimate)
        return [0 if x == 255 else x for x in prun]


def _C(n: int, k: int) -> int:
    if n < k or k < 0:
        return 0
    if k == 0 or n == k:
        return 1
    k = min(k, n - k)
    r = 1
    for i in range(k):
        r = r * (n - i) // (i + 1)
    return r


def _slice_rank(positions: tuple[int, ...] | list[int]) -> int:
    a = 0
    x = 0
    marked = set(positions)
    for j in range(11, -1, -1):
        if j in marked:
            a += _C(11 - j, x + 1)
            x += 1
    return a


_SLICE_UNRANK: list[tuple[int, ...]] | None = None


def _slice_table() -> list[tuple[int, ...]]:
    global _SLICE_UNRANK
    if _SLICE_UNRANK is None:
        _SLICE_UNRANK = [()] * N_SLICE_RAW
        for combo in combinations(range(12), 4):
            _SLICE_UNRANK[_slice_rank(combo)] = combo
    return _SLICE_UNRANK


def _set_slice(cc: CubieCube, idx: int) -> None:
    positions = _slice_table()[idx]
    ep = [0] * 12
    si = 0
    oi = 0
    pos_set = set(positions)
    for p in range(12):
        if p in pos_set:
            ep[p] = 8 + si
            si += 1
        else:
            ep[p] = oi
            oi += 1
    cc.ep = ep
    cc.eo = [0] * 12


TABLES = Tables()
