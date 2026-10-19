#!/usr/bin/env bash
# Simple HTTPS push (no SSH / GitLab key confusion).
set -euo pipefail
cd "$(dirname "$0")"

git remote set-url origin https://github.com/Sumitkumar-curio/Rubik-Cube-Solver.git
echo "Remote: $(git remote get-url origin)"
echo ""
echo "When Git asks for credentials:"
echo "  Username = your GitHub username  (Sumitkumar-curio)"
echo "  Password = a Personal Access Token (NOT your GitHub password)"
echo ""
echo "Create a token: https://github.com/settings/tokens"
echo "  → Generate new token (classic) → check 'repo' → Generate → copy it"
echo ""

git push -u origin main --force

echo ""
echo "Pushed. Make it public:"
echo "  https://github.com/Sumitkumar-curio/Rubik-Cube-Solver/settings"
echo "  → Danger Zone → Change visibility → Public"
