#!/usr/bin/env bash
# Run this in your own terminal (agent sandbox cannot reach GitHub DNS).
set -euo pipefail
cd "$(dirname "$0")"

echo "→ Pushing to https://github.com/Sumitkumar-curio/Rubik-Cube-Solver"
git push -u origin main --force

echo ""
echo "→ Making repository public (needs GitHub CLI)…"
if command -v gh >/dev/null 2>&1; then
  gh repo edit Sumitkumar-curio/Rubik-Cube-Solver --visibility public --accept-visibility-change-consequences
  echo "Repo is public."
else
  echo "Install gh (https://cli.github.com/) or set visibility manually:"
  echo "  GitHub → Settings → General → Danger Zone → Change visibility → Public"
fi

echo ""
echo "Done. Repo: https://github.com/Sumitkumar-curio/Rubik-Cube-Solver"
echo ""
echo "For anyone on the internet to use camera/upload (HTTPS):"
echo "  1. Open https://render.com → New → Web Service"
echo "  2. Connect this GitHub repo"
echo "  3. Runtime: Docker (uses Dockerfile)"
echo "  4. Share the https://….onrender.com link"
