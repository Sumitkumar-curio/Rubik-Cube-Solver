# Rubik-Cube-Solver (TWENTY)

**Solve any scrambled 3×3 Rubik’s cube in the fewest practical moves** — upload or photograph all 6 faces, pick an algorithm, and follow the animated 3D solution with teaching arrows.

Live idea: anyone can open the site → **camera / upload faces** → get a short solution to copy on a physical cube.

Repo: [Sumitkumar-curio/Rubik-Cube-Solver](https://github.com/Sumitkumar-curio/Rubik-Cube-Solver)

---

## Features

- **Camera or photo upload** for all 6 faces (mobile-friendly)
- **Face guide** (Up / Down / Front / Back / Right / Left)
- **Three.js** 3D cube with speed control, Next/Prev step, CW·CCW·180° arrows
- **Three solvers**
  - **A — Kociemba Two-Phase** — best everyday choice (~18–25 moves)
  - **B — IDA\* + Pattern Databases** — aims for optimal ≤20
  - **C — CFOP** — Cross → F2L → OLL → PLL (teachable, longer)
- Pure **Python stdlib** backend (no `pip install` required to run locally)

---

## Quick start (local)

```bash
git clone https://github.com/Sumitkumar-curio/Rubik-Cube-Solver.git
cd Rubik-Cube-Solver
./start.sh
```

Open **http://127.0.0.1:8765**

First run builds solver tables (~10s), then caches them in `backend/cube/_cache/`.

> Camera works on `localhost`. On a public URL you need **HTTPS** (browsers block camera on plain HTTP).

---

## Deploy for public access (free)

So **anyone** can open a link, use the camera, and solve:

### Option 1 — Render (recommended)

1. Push this repo to GitHub (already done if you’re reading this).
2. Go to [https://render.com](https://render.com) → **New** → **Blueprint** (or Web Service from this repo).
3. Use the included `Dockerfile` / `render.yaml`.
4. After deploy you get an `https://….onrender.com` URL — share that.

### Option 2 — Docker anywhere

```bash
docker build -t rubik-solver .
docker run -p 8765:8765 rubik-solver
```

### Option 3 — Railway / Fly.io / any Python host

Set env:

- `HOST=0.0.0.0`
- `PORT` = whatever the platform provides

Start command:

```bash
python3 backend/server.py
```

---

## How to use

1. Choose algorithm (**Kociemba** for fewest practical moves).
2. Capture or upload **U, R, F, D, L, B** faces (same cube orientation).
3. Tap **Solve cube**.
4. Use **Next step** + on-screen arrows to turn your physical cube.
5. Or hit **Demo scramble** to try without a real cube.

---

## God’s number

| Method | Typical moves |
|--------|----------------|
| Beginner layer methods | 60–120 |
| Human CFOP | ~50 |
| **Kociemba (this app)** | **~18–25, often ≤20** |
| Proven God’s number (2010) | **≤20 for every scramble** |

Some positions need exactly 20 moves — you cannot guarantee fewer than 20 for *every* scramble.

Research PDFs in this repo: `rubik.pdf`, `researc.pdf`.

---

## API

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health + methods |
| `GET /api/scramble` | Random scramble |
| `POST /api/solve` | `{ "facelets": "<54 chars>", "method": "kociemba"\|"ida"\|"cfop" }` |
| `POST /api/solve_colors` | `{ "faces": { "U":[9], … }, "method": "…" }` |
| `POST /api/apply` | Apply moves to a facelet string |

Facelets: 54 chars, order **U R F D L B**, 9 stickers each (row-major).

---

## Project layout

```
backend/          Python solver + HTTP server
frontend/         UI, Three.js cube, camera/vision
tests/            Sanity checks
Dockerfile        Public deploy
start.sh          Local launcher
```

## License

MIT — use it, teach with it, improve it.
