"""Facelet / cubie indices and color constants for a 3×3 cube."""

from __future__ import annotations

# Face colors / centers (also facelet color letters in Kociemba format)
U, R, F, D, L, B = range(6)
COLOR_NAMES = "URFDLB"
COLOR_HEX = {
    "U": "#F5F5F5",  # white
    "R": "#E53935",  # red
    "F": "#43A047",  # green
    "D": "#FDD835",  # yellow
    "L": "#FB8C00",  # orange
    "B": "#1E88E5",  # blue
}

N_CORNER = 8
N_EDGE = 12
N_MOVE = 18  # U,U2,U', R,R2,R', F,F2,F', D,D2,D', L,L2,L', B,B2,B'
N_TWIST = 2187       # 3^7
N_FLIP = 2048        # 2^11
N_SLICE = 495        # C(12,4)
N_CORNERS_PERM = 40320  # 8!
N_UD_EDGES = 40320      # 8!
N_SLICE_SORTED = 24     # 4!

# Facelet indices 0..53 (U:0-8, R:9-17, F:18-26, D:27-35, L:36-44, B:45-53)
FACELET_COUNT = 54

# Corner cubie names → facelet positions (URF, UFL, ULB, UBR, DFR, DLF, DBL, DRB)
CORNER_FACELET = [
    [8, 9, 20],    # URF
    [6, 18, 38],   # UFL
    [0, 36, 47],   # ULB
    [2, 45, 11],   # UBR
    [29, 26, 15],  # DFR
    [27, 44, 24],  # DLF
    [33, 53, 42],  # DBL
    [35, 17, 51],  # DRB
]

# Edge cubie names → facelet positions
# UR UF UL UB DR DF DL DB FR FL BL BR
EDGE_FACELET = [
    [5, 10],   # UR
    [7, 19],   # UF
    [3, 37],   # UL
    [1, 46],   # UB
    [32, 16],  # DR
    [28, 25],  # DF
    [30, 43],  # DL
    [34, 52],  # DB
    [23, 12],  # FR
    [21, 41],  # FL
    [50, 39],  # BL
    [48, 14],  # BR
]

CORNER_COLOR = [
    [U, R, F],
    [U, F, L],
    [U, L, B],
    [U, B, R],
    [D, F, R],
    [D, L, F],
    [D, B, L],
    [D, R, B],
]

EDGE_COLOR = [
    [U, R],
    [U, F],
    [U, L],
    [U, B],
    [D, R],
    [D, F],
    [D, L],
    [D, B],
    [F, R],
    [F, L],
    [B, L],
    [B, R],
]

MOVE_NAMES = [
    "U", "U2", "U'",
    "R", "R2", "R'",
    "F", "F2", "F'",
    "D", "D2", "D'",
    "L", "L2", "L'",
    "B", "B2", "B'",
]

# Axis of each move (for pruning consecutive same-face / opposite-face)
MOVE_AXIS = [0, 0, 0, 1, 1, 1, 2, 2, 2, 0, 0, 0, 1, 1, 1, 2, 2, 2]
