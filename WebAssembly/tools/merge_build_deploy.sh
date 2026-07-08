#!/usr/bin/env bash
# Orchestrator helper: merge a subagent fix branch to main, build BOTH dist and
# dist-release, and deploy both to cnc-gpu for real-Metal verification.
# Usage: bash tools/merge_build_deploy.sh <branch-name>
# Run from the WebAssembly/ directory. Verify the fix on the Mac AFTER this.
set -euo pipefail
BRANCH="${1:?usage: merge_build_deploy.sh <branch>}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

echo "== on main =="
git checkout main
echo "== merge $BRANCH =="
git merge --no-ff "$BRANCH" -m "Merge $BRANCH"

cd "$REPO_ROOT/WebAssembly"
echo "== build:port (dist) =="
npm run build:port 2>&1 | tail -2
echo "== build:port:release (dist-release) =="
npm run build:port:release 2>&1 | tail -2

echo "== deploy both dists to cnc-gpu =="
rsync -az "$REPO_ROOT/WebAssembly/dist/" cnc-gpu:/Volumes/CnCWork/CnC_Generals_Zero_Hour/WebAssembly/dist/
rsync -az "$REPO_ROOT/WebAssembly/dist-release/" cnc-gpu:/Volumes/CnCWork/CnC_Generals_Zero_Hour/WebAssembly/dist-release/
# also sync harness/src source so Mac-side harnesses match
rsync -az --exclude build --exclude node_modules --exclude dist --exclude dist-release --exclude artifacts \
  "$REPO_ROOT/WebAssembly/" cnc-gpu:/Volumes/CnCWork/CnC_Generals_Zero_Hour/WebAssembly/
rsync -az "$REPO_ROOT/GeneralsMD/" cnc-gpu:/Volumes/CnCWork/CnC_Generals_Zero_Hour/GeneralsMD/ 2>/dev/null || true
echo "== DONE: $BRANCH merged + both dists deployed =="