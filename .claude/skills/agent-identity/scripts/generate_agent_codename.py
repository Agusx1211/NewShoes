#!/usr/bin/env python3
"""Generate a stable commander-style codename from an agent parent ID."""

from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import re


DOMAIN_SEPARATOR = b"project-new-shoes-agent-codename-v1\0"
SOURCE_PATH = Path(__file__).resolve().parents[4] / "WebAssembly/harness/multiplayer_identity.mjs"


def commander_words(source: str, constant: str) -> tuple[str, ...]:
    match = re.search(
        rf"const {re.escape(constant)} = Object\.freeze\(\[(.*?)\]\);",
        source,
        re.DOTALL,
    )
    if match is None:
        raise RuntimeError(f"could not find {constant} in {SOURCE_PATH}")
    words = tuple(re.findall(r'"([A-Za-z0-9]+)"', match.group(1)))
    if not words:
        raise RuntimeError(f"{constant} in {SOURCE_PATH} is empty")
    return words


def commander_alphabet(source: str) -> str:
    match = re.search(r'const BASE36 = "([0-9A-Z]+)";', source)
    if match is None:
        raise RuntimeError(f"could not find BASE36 in {SOURCE_PATH}")
    return match.group(1)


def resolve_parent_id(explicit_parent_id: str | None) -> str:
    candidates = (
        explicit_parent_id,
        os.environ.get("AGENT_PARENT_ID"),
        os.environ.get("CODEX_AGENT_PARENT_ID"),
        os.environ.get("CODEX_THREAD_ID"),
    )
    for candidate in candidates:
        if candidate:
            return candidate
    raise RuntimeError(
        "no stable agent parent ID found; set AGENT_PARENT_ID, "
        "CODEX_AGENT_PARENT_ID, or CODEX_THREAD_ID, or pass --parent-id"
    )


def generate_codename(parent_id: str) -> str:
    source = SOURCE_PATH.read_text(encoding="utf-8")
    adjectives = commander_words(source, "COMMANDER_ADJECTIVES")
    nouns = commander_words(source, "COMMANDER_NOUNS")
    alphabet = commander_alphabet(source)
    random_bytes = hashlib.sha256(
        DOMAIN_SEPARATOR + parent_id.encode("utf-8")
    ).digest()[:6]
    adjective = adjectives[random_bytes[0] % len(adjectives)]
    noun = nouns[random_bytes[1] % len(nouns)]
    suffix = "".join(alphabet[byte % len(alphabet)] for byte in random_bytes[2:])
    return f"{adjective}{noun}{suffix}"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate a stable Project New Shoes agent codename."
    )
    parser.add_argument(
        "--parent-id",
        help="stable parent agent identifier; defaults to a supported environment variable",
    )
    args = parser.parse_args()
    try:
        print(generate_codename(resolve_parent_id(args.parent_id)))
    except (OSError, RuntimeError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
