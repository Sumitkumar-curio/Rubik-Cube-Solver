#!/usr/bin/env python3
"""TWENTY — near-optimal Rubik's Cube solver HTTP server (stdlib only)."""

from __future__ import annotations

import json
import mimetypes
import os
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
sys.path.insert(0, str(Path(__file__).resolve().parent))

from cube.solver import (  # noqa: E402
    solve_with_method,
    scramble,
    apply_moves,
    METHODS,
)
from cube.facecube import colors_to_facelets  # noqa: E402
from cube.tables import TABLES  # noqa: E402
from cube.validate import validate_cube_state  # noqa: E402


# 0.0.0.0 so cloud hosts / LAN can reach the app; override with HOST / PORT env
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8765"))


class Handler(BaseHTTPRequestHandler):
    server_version = "TWENTY/1.0"

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/health":
            primary = ["kociemba", "ida", "cfop"]
            self._json(
                200,
                {
                    "ok": True,
                    "tables_ready": TABLES.ready,
                    "gods_number": 20,
                    "methods": {
                        k: {
                            "name": METHODS[k]["name"],
                            "blurb": METHODS[k]["blurb"],
                            "option": METHODS[k].get("option"),
                        }
                        for k in primary
                    },
                },
            )
            return
        if path == "/api/scramble":
            facelets, moves = scramble(25)
            self._json(200, {"facelets": facelets, "scramble": moves})
            return
        if path == "/api/methods":
            primary = ["kociemba", "ida", "cfop"]
            self._json(
                200,
                {
                    "methods": [
                        {
                            "id": k,
                            "name": METHODS[k]["name"],
                            "blurb": METHODS[k]["blurb"],
                            "option": METHODS[k].get("option"),
                        }
                        for k in primary
                    ]
                },
            )
            return

        rel = "index.html" if path in ("/", "") else path.lstrip("/")
        file_path = (FRONTEND / rel).resolve()
        if not str(file_path).startswith(str(FRONTEND.resolve())) or not file_path.is_file():
            self._json(404, {"error": "Not found"})
            return
        data = file_path.read_bytes()
        ctype = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        if file_path.suffix == ".js":
            ctype = "text/javascript"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self._json(400, {"error": "Invalid JSON"})
            return

        try:
            if path == "/api/solve":
                self._handle_solve(data)
            elif path == "/api/solve_colors":
                self._handle_solve_colors(data)
            elif path == "/api/validate_colors":
                self._handle_validate_colors(data)
            elif path == "/api/apply":
                facelets = apply_moves(data["facelets"], data.get("moves", []))
                self._json(200, {"facelets": facelets})
            else:
                self._json(404, {"error": "Unknown endpoint"})
        except ValueError as e:
            self._json(400, {"error": str(e)})
        except TimeoutError as e:
            self._json(408, {"error": str(e)})
        except Exception as e:
            traceback.print_exc()
            self._json(500, {"error": str(e)})

    def _result_payload(self, result, facelets: str, method: str) -> dict:
        return {
            "moves": result.moves,
            "move_count": result.move_count,
            "facelets": facelets,
            "phase1_len": result.phase1_len,
            "phase2_len": result.phase2_len,
            "elapsed_ms": result.elapsed_ms,
            "algorithm": result.algorithm,
            "notes": result.notes,
            "method": getattr(result, "method_id", method),
            "stages": result.stages or [],
            "gods_number": 20,
        }

    def _handle_solve(self, data: dict) -> None:
        facelets = data.get("facelets", "").upper().replace(" ", "")
        method = data.get("method", "optimal")
        timeout = data.get("timeout")
        timeout_s = float(timeout) if timeout is not None else None
        result = solve_with_method(facelets, method=method, timeout_s=timeout_s)
        self._json(200, self._result_payload(result, result.facelets, method))

    def _handle_validate_colors(self, data: dict) -> None:
        faces = data.get("faces")
        if not isinstance(faces, dict):
            raise ValueError("Expected {faces: {U:[9], R:[9], ...}}")
        facelets = colors_to_facelets(faces)
        err = validate_cube_state(facelets)
        if err:
            self._json(400, {"ok": False, "error": err, "facelets": facelets})
            return
        self._json(200, {"ok": True, "facelets": facelets})

    def _handle_solve_colors(self, data: dict) -> None:
        faces = data.get("faces")
        if not isinstance(faces, dict):
            raise ValueError("Expected {faces: {U:[9], R:[9], ...}}")
        try:
            facelets = colors_to_facelets(faces)
        except ValueError as e:
            raise ValueError(str(e)) from e
        err = validate_cube_state(facelets)
        if err:
            raise ValueError(err)
        method = data.get("method", "kociemba")
        timeout = data.get("timeout")
        timeout_s = float(timeout) if timeout is not None else None
        result = solve_with_method(facelets, method=method, timeout_s=timeout_s)
        # Include hold reminder colors from centers
        payload = self._result_payload(result, facelets, method)
        payload["hold"] = {
            "up": faces.get("U", [None] * 9)[4],
            "front": faces.get("F", [None] * 9)[4],
            "message": (
                f"Hold cube with {str(faces.get('F', ['?'])[4]).upper()} in FRONT "
                f"and {str(faces.get('U', ['?'])[4]).upper()} on TOP, then follow the moves."
            ),
        }
        self._json(200, payload)


def main() -> None:
    print("[TWENTY] Preloading solver tables…", flush=True)
    TABLES.ensure()
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"[TWENTY] Open http://{HOST}:{PORT}", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[TWENTY] Shutting down")
        httpd.server_close()


if __name__ == "__main__":
    main()
