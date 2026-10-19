"""Kociemba two-phase solver with multi-pass length optimization."""

from __future__ import annotations

import time
from dataclasses import dataclass

from .defs import MOVE_NAMES, MOVE_AXIS, N_TWIST, N_FLIP, N_CORNERS_PERM, N_UD_EDGES
from .cubie import CubieCube, MOVE_CUBE, from_facelets, N_SLICE_RAW
from .tables import TABLES, PHASE2_MOVES
from .validate import validate_facelets, validate_cube_state


@dataclass
class SolveResult:
    moves: list[str]
    move_count: int
    facelets: str
    phase1_len: int
    phase2_len: int
    elapsed_ms: float
    algorithm: str
    notes: str
    stages: list | None = None
    method_id: str = "kociemba"


class Search:
    def __init__(self) -> None:
        TABLES.ensure()
        self.T = TABLES
        self.solution: list[int] | None = None
        self.max_depth = 0
        self.n_nodes = 0

    def solve(self, cc: CubieCube, max_length: int = 31, timeout_s: float = 8.0) -> list[int] | None:
        """Return move indices or None."""
        self.deadline = time.time() + timeout_s
        twist = cc.get_twist()
        flip = cc.get_flip()
        slice_ = cc.get_slice_unsorted()

        # Phase-1 lower bound
        for depth in range(0, max_length + 1):
            self.max_depth = depth
            self.solution = None
            self.n_nodes = 0
            ok = self._phase1(twist, flip, slice_, depth, -1, [])
            if self.solution is not None:
                return self.solution
            if time.time() > self.deadline:
                break
            if not ok:
                # exhausted this depth without timeout
                pass
        return None

    def solve_optimized(
        self,
        cc: CubieCube,
        timeout_s: float = 12.0,
        target: int = 20,
    ) -> list[int] | None:
        """
        Find a short solution by exploring multiple phase-1 lengths.
        Returns the first solution quickly, then spends remaining time shortening it.
        """
        TABLES.ensure()
        self.deadline = time.time() + timeout_s
        twist = cc.get_twist()
        flip = cc.get_flip()
        slice_ = cc.get_slice_unsorted()

        best: list[int] | None = None
        lb = max(
            self.T.slice_twist_prun[slice_ * N_TWIST + twist],
            self.T.slice_flip_prun[slice_ * N_FLIP + flip],
        )
        # Pass A: first solution fast. Pass B: refine while time remains.
        for refine in (False, True):
            if time.time() > self.deadline:
                break
            if best is not None and len(best) <= target and refine:
                # Already at God's-number bound — optional short refine only
                self.deadline = min(self.deadline, time.time() + 1.5)
            for p1_depth in range(lb, 13):
                if time.time() > self.deadline:
                    break
                if best is not None and p1_depth >= len(best):
                    break
                self.max_p1 = p1_depth
                self.max_total = len(best) - 1 if best is not None else 24
                self.best = best
                self.solution = None
                self.stop_p1 = not refine
                self._phase1_opt(twist, flip, slice_, p1_depth, -1, [])
                if self.best is not None:
                    best = self.best
                    if len(best) <= target and not refine:
                        break
                    if not refine:
                        break
            if best is not None and len(best) <= target and not refine:
                # Quick extra polish, then stop
                continue
            if best is not None and not refine:
                continue
        return best

    def _phase1(
        self,
        twist: int,
        flip: int,
        slice_: int,
        depth: int,
        last_axis: int,
        path: list[int],
    ) -> bool:
        if time.time() > self.deadline:
            return False
        self.n_nodes += 1
        if depth == 0:
            if twist == 0 and flip == 0 and slice_ == 0:
                # Enter phase 2
                return self._start_phase2(path)
            return True

        # Pruning
        est = max(
            self.T.slice_twist_prun[slice_ * N_TWIST + twist],
            self.T.slice_flip_prun[slice_ * N_FLIP + flip],
        )
        if est > depth:
            return True

        for m in range(18):
            axis = MOVE_AXIS[m]
            if axis == last_axis:
                continue
            # Prefer not to do D before U on same axis pair etc. — skip opposite if prev was lower face
            if last_axis != -1 and axis == last_axis:
                continue
            # Consecutive moves on same face already blocked by axis==last_axis for U/D sharing axis 0
            # But U then D is same axis — we block both which is correct for reducing branching
            # Actually U then D should be allowed (different faces). MOVE_AXIS maps U and D both to 0!
            # Fix: use face index instead
            pass

        for m in range(18):
            face = m // 3
            if path:
                prev_face = path[-1] // 3
                if face == prev_face:
                    continue
                # Same axis opposite faces: force order (U before D, R before L, F before B)
                if face % 3 == prev_face % 3 and face < prev_face:
                    continue

            twist2 = self.T.twist_move[twist][m]
            flip2 = self.T.flip_move[flip][m]
            slice2 = self.T.slice_move[slice_][m]
            path.append(m)
            if not self._phase1(twist2, flip2, slice2, depth - 1, face, path):
                path.pop()
                return False
            path.pop()
            if self.solution is not None:
                return True
        return True

    def _phase1_opt(
        self,
        twist: int,
        flip: int,
        slice_: int,
        depth: int,
        last_face: int,
        path: list[int],
    ) -> None:
        if time.time() > self.deadline:
            return
        if getattr(self, "stop_p1", False) and self.best is not None:
            return
        if depth == 0:
            if twist == 0 and flip == 0 and slice_ == 0:
                self._phase2_opt(path)
            return

        est = max(
            self.T.slice_twist_prun[slice_ * N_TWIST + twist],
            self.T.slice_flip_prun[slice_ * N_FLIP + flip],
        )
        if est > depth:
            return

        for m in range(18):
            face = m // 3
            if path:
                prev_face = path[-1] // 3
                if face == prev_face:
                    continue
                if face % 3 == prev_face % 3 and face < prev_face:
                    continue
            twist2 = self.T.twist_move[twist][m]
            flip2 = self.T.flip_move[flip][m]
            slice2 = self.T.slice_move[slice_][m]
            path.append(m)
            self._phase1_opt(twist2, flip2, slice2, depth - 1, face, path)
            path.pop()
            if (getattr(self, "stop_p1", False) and self.best is not None) or time.time() > self.deadline:
                return

    def _start_phase2(self, path: list[int]) -> bool:
        # Apply path to identity coords for phase2 state
        # Reconstruct from moves on a cubie — expensive but rare at depth boundary
        # Better: track corners / ud_edges / slice_sorted through phase1
        # For simplicity apply moves to fresh solved and... we need start state.
        # We'll store initial cubie on Search
        cc = self.start.copy()
        for m in path:
            cc.multiply(MOVE_CUBE[m])
        corners = cc.get_corners()
        ud = cc.get_ud_edges()
        ss = cc.get_slice_sorted()
        # Phase2 depth limit
        remaining = self.max_depth  # when used from first solver this is leftover 0
        # In simple solve(), phase1 used exact depth so remaining for phase2 needs separate budget
        return True  # placeholder — use opt path

    def _phase2_opt(self, p1_path: list[int]) -> None:
        cc = self.start.copy()
        for m in p1_path:
            cc.multiply(MOVE_CUBE[m])
        corners = cc.get_corners()
        ud = cc.get_ud_edges()
        ss = cc.get_slice_sorted()

        max_p2 = self.max_total - len(p1_path)
        if max_p2 < 0:
            return
        lb = max(
            self.T.slice_corners_prun[ss * N_CORNERS_PERM + corners],
            self.T.slice_ud_edges_prun[ss * N_UD_EDGES + ud],
        )
        if lb > max_p2:
            return

        for depth in range(lb, max_p2 + 1):
            p2: list[int] = []
            if self._phase2_search(corners, ud, ss, depth, -1, p2):
                sol = p1_path + p2
                if self.best is None or len(sol) < len(self.best):
                    self.best = sol
                    self.solution = sol
                    self.max_total = len(sol) - 1
                    if getattr(self, "stop_p1", False):
                        self.stop_p1 = True  # signal phase1 to bail after this hit
                return

    def _phase2_search(
        self,
        corners: int,
        ud: int,
        ss: int,
        depth: int,
        last_face: int,
        path: list[int],
    ) -> bool:
        if time.time() > self.deadline:
            return False
        if depth == 0:
            return corners == 0 and ud == 0 and ss == 0

        est = max(
            self.T.slice_corners_prun[ss * N_CORNERS_PERM + corners],
            self.T.slice_ud_edges_prun[ss * N_UD_EDGES + ud],
        )
        if est > depth:
            return False

        for m in PHASE2_MOVES:
            face = m // 3
            if last_face == face:
                continue
            if last_face != -1 and face % 3 == last_face % 3 and face < last_face:
                continue
            c2 = self.T.corners_move[corners][m]
            u2 = self.T.ud_edges_move[ud][m]
            s2 = self.T.slice_sorted_move[ss][m]
            path.append(m)
            if self._phase2_search(c2, u2, s2, depth - 1, face, path):
                return True
            path.pop()
        return False


METHODS = {
    "kociemba": {
        "name": "Kociemba Two-Phase",
        "blurb": "Best practical starting point — short solutions (~18–25 turns), not always shortest.",
        "option": "A",
        "timeout": 12.0,
        "target": 22,
    },
    "ida": {
        "name": "IDA* + Pattern Databases",
        "blurb": "Searches for a shortest path (≤20). Heavier compute; best when you need optimal.",
        "option": "B",
        "timeout": 22.0,
        "target": 20,
    },
    "cfop": {
        "name": "CFOP Algorithm Library",
        "blurb": "Cross → F2L → OLL → PLL. Human-readable for teaching — not globally optimal.",
        "option": "C",
        "timeout": 35.0,
        "target": 80,
    },
    # Aliases kept for older clients
    "optimal": {"alias": "kociemba"},
    "fast": {"alias": "kociemba"},
    "beginner": {"alias": "cfop"},
}


def solve(facelets: str, timeout_s: float = 10.0) -> SolveResult:
    return solve_optimized(facelets, timeout_s=timeout_s)


def _resolve_method(method: str) -> str:
    method = (method or "kociemba").lower().strip()
    meta = METHODS.get(method)
    if meta is None:
        raise ValueError(
            f"Unknown method '{method}'. Choose: kociemba, ida, cfop"
        )
    if "alias" in meta:
        return meta["alias"]
    return method


def solve_with_method(
    facelets: str,
    method: str = "kociemba",
    timeout_s: float | None = None,
) -> SolveResult:
    """Dispatch to the chosen solving method."""
    method = _resolve_method(method)
    meta = METHODS[method]
    t = timeout_s if timeout_s is not None else float(meta["timeout"])

    if method == "cfop":
        return _solve_cfop_result(facelets, timeout_s=t)
    if method == "ida":
        return _solve_ida_result(facelets, timeout_s=t)

    result = solve_optimized(
        facelets,
        timeout_s=t,
        target=int(meta["target"]),
        algorithm_label=meta["name"],
    )
    result.method_id = "kociemba"
    return result


def _solve_ida_result(facelets: str, timeout_s: float = 22.0) -> SolveResult:
    err = validate_cube_state(facelets)
    if err:
        raise ValueError(err)
    t0 = time.time()
    if facelets == "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB":
        return SolveResult(
            moves=[], move_count=0, facelets=facelets,
            phase1_len=0, phase2_len=0, elapsed_ms=0.0,
            algorithm=METHODS["ida"]["name"],
            notes="Cube is already solved.",
        )

    from .ida_optimal import solve_ida

    moves = solve_ida(facelets, timeout_s=timeout_s, max_depth=20)
    if moves is None:
        raise TimeoutError(
            "IDA* did not finish in time. Try Kociemba Two-Phase, or increase timeout."
        )
    elapsed = (time.time() - t0) * 1000
    return SolveResult(
        moves=moves,
        move_count=len(moves),
        facelets=facelets,
        phase1_len=0,
        phase2_len=len(moves),
        elapsed_ms=round(elapsed, 1),
        algorithm=METHODS["ida"]["name"],
        notes=(
            f"IDA* + pattern databases found {len(moves)} moves. "
            "Aims for a shortest solution (God's number ≤20)."
        ),
        method_id="ida",
    )


def _solve_cfop_result(facelets: str, timeout_s: float = 35.0) -> SolveResult:
    err = validate_cube_state(facelets)
    if err:
        raise ValueError(err)
    t0 = time.time()
    if facelets == "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB":
        return SolveResult(
            moves=[], move_count=0, facelets=facelets,
            phase1_len=0, phase2_len=0, elapsed_ms=0.0,
            algorithm=METHODS["cfop"]["name"],
            notes="Cube is already solved.",
        )

    from .cfop import solve_cfop

    moves, stages = solve_cfop(facelets, timeout_s=timeout_s)
    elapsed = (time.time() - t0) * 1000
    stage_txt = " → ".join(s["name"] for s in stages) if stages else "CFOP"
    return SolveResult(
        moves=moves,
        move_count=len(moves),
        facelets=facelets,
        phase1_len=0,
        phase2_len=len(moves),
        elapsed_ms=round(elapsed, 1),
        algorithm=METHODS["cfop"]["name"],
        notes=(
            f"CFOP ({stage_txt}) — {len(moves)} moves. "
            "Built for teaching; follow the arrows on each step."
        ),
        stages=stages,
        method_id="cfop",
    )


def _solve_beginner_result(facelets: str, timeout_s: float = 25.0) -> SolveResult:
    err = validate_facelets(facelets)
    if err:
        raise ValueError(err)
    t0 = time.time()
    cc = from_facelets(facelets)
    verr = cc.verify()
    if verr:
        raise ValueError(verr)
    if facelets == "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB":
        return SolveResult(
            moves=[],
            move_count=0,
            facelets=facelets,
            phase1_len=0,
            phase2_len=0,
            elapsed_ms=0.0,
            algorithm=METHODS["beginner"]["name"],
            notes="Cube is already solved.",
        )

    from .beginner import solve_beginner

    moves = solve_beginner(facelets, timeout_s=timeout_s)
    # Verify
    from .facecube import FaceCube

    check = from_facelets(facelets)
    name_to_idx = {n: i for i, n in enumerate(MOVE_NAMES)}
    for mv in moves:
        check.multiply(MOVE_CUBE[name_to_idx[mv]])
    final = FaceCube.from_cubie(check).to_string()
    solved = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"
    if final != solved:
        # Finish with two-phase
        rest = Search()
        rest.start = check
        idx = rest.solve_optimized(check, timeout_s=max(3.0, timeout_s * 0.4), target=24)
        if idx:
            moves = moves + [MOVE_NAMES[m] for m in idx]
        else:
            raise TimeoutError(
                "Beginner method could not finish this scramble in time. "
                "Try Near-optimal instead."
            )

    elapsed = (time.time() - t0) * 1000
    return SolveResult(
        moves=moves,
        move_count=len(moves),
        facelets=facelets,
        phase1_len=0,
        phase2_len=len(moves),
        elapsed_ms=round(elapsed, 1),
        algorithm=METHODS["beginner"]["name"],
        notes=(
            f"Beginner layer-by-layer found {len(moves)} moves. "
            "Expect more moves than near-optimal — easier to follow on a physical cube."
        ),
    )


def solve_optimized(
    facelets: str,
    timeout_s: float = 12.0,
    target: int = 20,
    algorithm_label: str | None = None,
) -> SolveResult:
    """Solve a 54-char facelet cube string; return near-optimal moves."""
    err = validate_cube_state(facelets)
    if err:
        raise ValueError(err)

    t0 = time.time()
    cc = from_facelets(facelets)

    # Already solved?
    if facelets == "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB":
        return SolveResult(
            moves=[],
            move_count=0,
            facelets=facelets,
            phase1_len=0,
            phase2_len=0,
            elapsed_ms=0.0,
            algorithm="Kociemba two-phase (optimized)",
            notes="Cube is already solved.",
        )

    search = Search()
    search.start = cc
    moves_idx = search.solve_optimized(cc, timeout_s=timeout_s, target=target)
    elapsed = (time.time() - t0) * 1000

    if moves_idx is None:
        raise TimeoutError(
            "No solution found within time limit. "
            "Try again with a longer timeout, or check that face colors were read correctly."
        )

    moves = [MOVE_NAMES[m] for m in moves_idx]
    # Determine phase split: first state where twist=flip=slice=0
    tmp = cc.copy()
    p1 = 0
    for i, m in enumerate(moves_idx):
        tmp.multiply(MOVE_CUBE[m])
        p1 = i + 1
        if tmp.get_twist() == 0 and tmp.get_flip() == 0 and tmp.get_slice_unsorted() == 0:
            break

    label = algorithm_label or "Kociemba two-phase (multi-pass optimized)"
    note = (
        f"God's number is 20 — every cube is solvable in ≤20 face turns. "
        f"This run found {len(moves)} moves via optimized two-phase search."
    )
    if len(moves) > 20:
        note += " Increase timeout for a shorter solution."

    return SolveResult(
        moves=moves,
        move_count=len(moves),
        facelets=facelets,
        phase1_len=p1,
        phase2_len=len(moves) - p1,
        elapsed_ms=round(elapsed, 1),
        algorithm=label,
        notes=note,
    )


def apply_moves(facelets: str, moves: list[str]) -> str:
    from .facecube import FaceCube

    cc = from_facelets(facelets)
    name_to_idx = {n: i for i, n in enumerate(MOVE_NAMES)}
    for mv in moves:
        cc.multiply(MOVE_CUBE[name_to_idx[mv]])
    return FaceCube.from_cubie(cc).to_string()


def scramble(n: int = 25) -> tuple[str, list[str]]:
    """Generate a random scramble and the resulting facelet string."""
    import random
    from .facecube import FaceCube

    moves: list[str] = []
    last_face = -1
    for _ in range(n):
        while True:
            m = random.randrange(18)
            face = m // 3
            if face != last_face:
                break
        moves.append(MOVE_NAMES[m])
        last_face = face

    cc = CubieCube()
    name_to_idx = {n: i for i, n in enumerate(MOVE_NAMES)}
    for mv in moves:
        cc.multiply(MOVE_CUBE[name_to_idx[mv]])
    return FaceCube.from_cubie(cc).to_string(), moves
