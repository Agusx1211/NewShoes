#!/usr/bin/env bash
# Build and sanitize a throwaway publication mirror. Never run this in a shared clone.
set -euo pipefail

if [[ $# -lt 3 || $# -gt 4 ]]; then
  echo "usage: $0 <source-repo> <new-mirror-path> <private-replacements> [mailmap]" >&2
  exit 2
fi

SOURCE_REPO="$(realpath "$1")"
MIRROR_PATH="$2"
PRIVATE_REPLACEMENTS="$(realpath "$3")"
MAILMAP="${4:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUDITOR="$SCRIPT_DIR/public_audit.py"

if [[ -e "$MIRROR_PATH" ]]; then
  echo "refusing existing mirror path: $MIRROR_PATH" >&2
  exit 2
fi
if [[ ! -f "$PRIVATE_REPLACEMENTS" ]]; then
  echo "private replacement file is required and must stay outside Git" >&2
  exit 2
fi
if ! git filter-repo -h >/dev/null 2>&1; then
  echo "git-filter-repo is required" >&2
  exit 2
fi

git -C "$SOURCE_REPO" status --porcelain | grep -q . && {
  echo "source repository must be clean" >&2
  exit 2
}

git clone --mirror --no-local "$SOURCE_REPO" "$MIRROR_PATH"
MIRROR_PATH="$(realpath "$MIRROR_PATH")"
AUDIT_ROOT="${MIRROR_PATH%.git}-publication-audit"
mkdir -p "$AUDIT_ROOT/before" "$AUDIT_ROOT/after"

python3 "$AUDITOR"   --repo "$MIRROR_PATH"   --tree refs/heads/main   --output "$AUDIT_ROOT/before"

REPLACEMENTS_FILE="$(mktemp)"
trap 'rm -f "$REPLACEMENTS_FILE"' EXIT
chmod 600 "$REPLACEMENTS_FILE"
cat "$PRIVATE_REPLACEMENTS" > "$REPLACEMENTS_FILE"
printf '%s\n'   'regex:([A-Za-z][A-Za-z0-9+.-]{2,15}://)[^\s/@:]+:[^\s/@]+@==>\1'   >> "$REPLACEMENTS_FILE"

FILTER_ARGS=(
  --force
  --path HANDOFF_DELETE_AFTER_READING_THIS.md
  --path WebAssembly/artifacts
  --path WebAssembly/dist-release
  --path WebAssembly/dist-threaded
  --path WebAssembly/dist-threaded-release
  --path WebAssembly/harness/assets/logos
  --path WebAssembly/harness/assets/zeroh-command-desert.webp
  --invert-paths
  --replace-text "$REPLACEMENTS_FILE"
)
if [[ -n "$MAILMAP" ]]; then
  MAILMAP="$(realpath "$MAILMAP")"
  FILTER_ARGS+=(--mailmap "$MAILMAP")
fi

git -C "$MIRROR_PATH" filter-repo "${FILTER_ARGS[@]}"

python3 "$AUDITOR"   --repo "$MIRROR_PATH"   --tree refs/heads/main   --output "$AUDIT_ROOT/after"   --fail-current-credentials

python3 - "$AUDIT_ROOT/after/summary.json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    summary = json.load(handle)
history_credentials = {
    key: value
    for key, value in summary["history_findings"].items()
    if key.startswith("credential.") and value
}
if history_credentials:
    raise SystemExit(
        "publication mirror still has credential findings: " +
        ", ".join(f"{key}={value}" for key, value in sorted(history_credentials.items()))
    )
if summary["blobs_over_10_mib"]:
    raise SystemExit("publication mirror has blobs larger than 10 MiB")
print(json.dumps({
    "publication_mirror": "ready-for-review",
    "refs": summary["refs"],
    "objects": summary["objects"],
    "history_credentials": history_credentials,
}, sort_keys=True))
PY

echo "sanitized mirror: $MIRROR_PATH"
echo "before/after audit: $AUDIT_ROOT"
echo "review and test this mirror before pushing any ref"
