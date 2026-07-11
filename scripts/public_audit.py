#!/usr/bin/env python3
"""Scan every reachable Git object without printing matched secret values."""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import re
import subprocess
import threading
from pathlib import Path


CONTENT_PATTERNS = {
    "credential.private-key": rb"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----",
    "credential.aws-access-key": rb"(?<![A-Z0-9])(?:AKIA|ASIA)[A-Z0-9]{16}(?![A-Z0-9])",
    "credential.github-token": rb"(?<![A-Za-z0-9_])gh(?:p|o|u|s|r)_[A-Za-z0-9_]{20,}",
    "credential.gitlab-token": rb"(?<![A-Za-z0-9_-])glpat-[A-Za-z0-9_-]{20,}",
    "credential.slack-token": rb"(?<![A-Za-z0-9-])xox[baprs]-[A-Za-z0-9-]{10,}",
    "credential.openai-key": rb"(?<![A-Za-z0-9])sk-(?:proj-)?[A-Za-z0-9_-]{20,}",
    "credential.google-api-key": rb"(?<![A-Za-z0-9])AIza[A-Za-z0-9_-]{35}(?![A-Za-z0-9_-])",
    "credential.jwt": rb"(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}",
    "credential.url-userinfo": rb"[A-Za-z][A-Za-z0-9+.-]{2,15}://[^\s/@:]{1,64}:[^\s/@]{1,128}@",
    "credential.quoted-assignment": rb"(?i)(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd)\s*[:=]\s*[\"'][^\"'\r\n\s]{8,}[\"']",
    "privacy.unix-home": rb"/(?:home|Users)/[A-Za-z0-9._-]{1,128}/",
    "privacy.windows-home": rb"(?i)[A-Z]:[\\/]+Users[\\/]+[A-Za-z0-9._ -]{1,128}[\\/]",
    "privacy.private-ip": rb"(?<![0-9])(?:10(?:\.[0-9]{1,3}){3}|192\.168(?:\.[0-9]{1,3}){2}|172\.(?:1[6-9]|2[0-9]|3[01])(?:\.[0-9]{1,3}){2})(?![0-9])",
    "privacy.ssh-path": rb"(?i)(?:\.ssh/|id_ed25519|id_rsa|known_hosts)",
    "privacy.temp-path": rb"(?<![A-Za-z0-9])/(?:tmp|private/var/folders)/[A-Za-z0-9._~+/-]{1,512}",
    "privacy.email": rb"(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}(?![A-Za-z0-9.-])",
}

SUSPICIOUS_PATH_PATTERNS = {
    "path.retail-container": r"(?i)\.(?:iso|img|bin|cue|cab|big|bik)$",
    "path.private-config": r"(?i)(?:^|/)(?:\.env(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?|credentials?[^/]*|secrets?[^/]*)$",
    "path.certificate": r"(?i)\.(?:pem|p12|pfx|key|crt|cer|der|jks|keystore)$",
    "path.browser-profile": r"(?i)(?:^|/)(?:User Data|Default|Local State|Login Data|Cookies)(?:/|$)",
    "path.issue-dump": r"(?i)\.cncdump\.json(?:\.zip)?$",
}

COMMANDS = [
    "git for-each-ref --format=%(refname)%09%(objectname) --sort=refname",
    "git rev-list --objects --all",
    "git cat-file --batch-check=%(objectname)%09%(objecttype)%09%(objectsize)",
    "git cat-file --batch",
    "git ls-tree -rz -r --long <each-ref>",
    "git log --all --format=%aN%x09%aE%x09%cN%x09%cE",
]


def git(repo: Path, *args: str, input_bytes: bytes | None = None) -> bytes:
    return subprocess.run(
        ["git", *args],
        cwd=repo,
        input=input_bytes,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
    ).stdout


def read_batch(repo: Path, oids: list[str]) -> dict[str, bytes]:
    proc = subprocess.Popen(
        ["git", "cat-file", "--batch"],
        cwd=repo,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
    )
    assert proc.stdin is not None and proc.stdout is not None

    def write_requests() -> None:
        for oid in oids:
            proc.stdin.write((oid + "\n").encode("ascii"))
        proc.stdin.close()

    writer = threading.Thread(target=write_requests, daemon=True)
    writer.start()
    result: dict[str, bytes] = {}
    for requested_oid in oids:
        header = proc.stdout.readline().decode("ascii", errors="replace").rstrip("\n")
        fields = header.split()
        if len(fields) != 3:
            raise RuntimeError(f"unexpected cat-file header for {requested_oid}: {header}")
        oid, object_type, size_text = fields
        size = int(size_text)
        payload = proc.stdout.read(size)
        if proc.stdout.read(1) != b"\n":
            raise RuntimeError(f"missing cat-file delimiter for {oid}")
        if object_type == "blob":
            result[oid] = payload
    writer.join()
    if proc.wait() != 0:
        raise RuntimeError("git cat-file --batch failed")
    return result


def magic_categories(data: bytes) -> list[str]:
    categories: list[str] = []
    if len(data) >= 0x8006 and data[0x8001:0x8006] == b"CD001":
        categories.append("magic.iso9660")
    if data.startswith(b"MSCF"):
        categories.append("magic.cabinet")
    if data.startswith((b"BIGF", b"BIG4")):
        categories.append("magic.big-archive")
    if data.startswith(b"\x00asm"):
        categories.append("magic.wasm")
    if data.startswith((b"PK\x03\x04", b"7z\xbc\xaf\x27\x1c")):
        categories.append("magic.compressed-archive")
    if data.startswith(b"\x7fELF") or data.startswith(b"MZ"):
        categories.append("magic.native-binary")
    return categories


def parse_ls_tree(data: bytes) -> list[tuple[str, str, str, int | None, str]]:
    rows = []
    for entry in data.split(b"\0"):
        if not entry:
            continue
        metadata, raw_path = entry.split(b"\t", 1)
        mode, object_type, oid, size_text = metadata.decode("ascii").split()
        size = None if size_text == "-" else int(size_text)
        rows.append((mode, object_type, oid, size, raw_path.decode("utf-8", errors="surrogateescape")))
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--tree", default="HEAD")
    parser.add_argument("--fail-current-credentials", action="store_true")
    args = parser.parse_args()

    repo = args.repo.resolve()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)

    refs_text = git(repo, "for-each-ref", "--format=%(refname)\t%(objectname)", "--sort=refname").decode()
    (output / "refs.tsv").write_text(refs_text, encoding="utf-8")
    refs = [line.split("\t", 1) for line in refs_text.splitlines() if line]

    rev_lines = git(repo, "rev-list", "--objects", "--all").decode("utf-8", errors="surrogateescape").splitlines()
    paths_by_oid: dict[str, set[str]] = collections.defaultdict(set)
    ordered_oids: list[str] = []
    seen_oids: set[str] = set()
    for line in rev_lines:
        oid, *path = line.split(" ", 1)
        if oid not in seen_oids:
            seen_oids.add(oid)
            ordered_oids.append(oid)
        if path:
            paths_by_oid[oid].add(path[0])

    check_input = ("\n".join(ordered_oids) + "\n").encode("ascii")
    check_lines = git(
        repo,
        "cat-file",
        "--batch-check=%(objectname)\t%(objecttype)\t%(objectsize)",
        input_bytes=check_input,
    ).decode().splitlines()
    object_info: dict[str, tuple[str, int]] = {}
    for line in check_lines:
        oid, object_type, size_text = line.split("\t")
        object_info[oid] = (object_type, int(size_text))

    blob_oids = [oid for oid in ordered_oids if object_info[oid][0] == "blob"]
    blobs = read_batch(repo, blob_oids)
    compiled_content = {
        category: re.compile(pattern)
        for category, pattern in CONTENT_PATTERNS.items()
    }
    compiled_paths = {
        category: re.compile(pattern)
        for category, pattern in SUSPICIOUS_PATH_PATTERNS.items()
    }

    findings: set[tuple[str, str, str, str, int, str]] = set()

    def record(scope: str, ref: str, category: str, oid: str, path: str) -> None:
        findings.add((scope, ref, category, oid, object_info[oid][1], path))

    for oid, data in blobs.items():
        paths = sorted(paths_by_oid.get(oid) or {"<unmapped>"})
        categories = magic_categories(data)
        categories.extend(
            category
            for category, pattern in compiled_content.items()
            if pattern.search(data)
        )
        for path in paths:
            categories_for_path = list(categories)
            categories_for_path.extend(
                category
                for category, pattern in compiled_paths.items()
                if pattern.search(path)
            )
            for category in set(categories_for_path):
                record("history", "", category, oid, path)

    tree_rows = parse_ls_tree(git(repo, "ls-tree", "-rz", "-r", "--long", args.tree))
    current_blob_oids = {oid for _, object_type, oid, _, _ in tree_rows if object_type == "blob"}
    current_findings: set[tuple[str, str, str, str, int, str]] = set()
    for mode, object_type, oid, _, path in tree_rows:
        if object_type != "blob":
            continue
        data = blobs.get(oid)
        if data is None:
            data = git(repo, "cat-file", "blob", oid)
        categories = magic_categories(data)
        categories.extend(
            category
            for category, pattern in compiled_content.items()
            if pattern.search(data)
        )
        categories.extend(
            category
            for category, pattern in compiled_paths.items()
            if pattern.search(path)
        )
        if mode == "120000" and data.startswith(b"/"):
            categories.append("privacy.absolute-symlink")
        for category in set(categories):
            row = ("current", args.tree, category, oid, len(data), path)
            findings.add(row)
            current_findings.add(row)

    for ref, _ in refs:
        for mode, object_type, oid, _, path in parse_ls_tree(
            git(repo, "ls-tree", "-rz", "-r", "--long", ref)
        ):
            if mode != "120000" or object_type != "blob":
                continue
            data = blobs.get(oid)
            if data is None:
                data = git(repo, "cat-file", "blob", oid)
            if data.startswith(b"/"):
                findings.add(("ref-tree", ref, "privacy.absolute-symlink", oid, len(data), path))

    with (output / "findings.tsv").open("w", encoding="utf-8") as handle:
        handle.write("scope\tref\tcategory\toid\tbytes\tpath\n")
        for row in sorted(findings):
            handle.write("\t".join(map(str, row)) + "\n")

    with (output / "patterns.tsv").open("w", encoding="utf-8") as handle:
        handle.write("category\tregex\n")
        for category, pattern in sorted(CONTENT_PATTERNS.items()):
            handle.write(f"{category}\t{pattern.decode('ascii')}\n")
        for category, pattern in sorted(SUSPICIOUS_PATH_PATTERNS.items()):
            handle.write(f"{category}\t{pattern}\n")

    (output / "commands.txt").write_text("\n".join(COMMANDS) + "\n", encoding="utf-8")

    metadata_rows = git(repo, "log", "--all", "--format=%aN%x09%aE%x09%cN%x09%cE").decode(
        "utf-8", errors="replace"
    ).splitlines()
    metadata_counts: collections.Counter[tuple[str, str, str]] = collections.Counter()
    for line in metadata_rows:
        author_name, author_email, committer_name, committer_email = line.split("\t")
        metadata_counts[("author", author_name, author_email.rsplit("@", 1)[-1])] += 1
        metadata_counts[("committer", committer_name, committer_email.rsplit("@", 1)[-1])] += 1
    with (output / "metadata-domains.tsv").open("w", encoding="utf-8") as handle:
        handle.write("role\tname\temail_domain\tcount\n")
        for (role, name, domain), count in sorted(metadata_counts.items()):
            handle.write(f"{role}\t{name}\t{domain}\t{count}\n")

    category_counts = collections.Counter(row[2] for row in findings)
    current_category_counts = collections.Counter(row[2] for row in current_findings)
    blob_sizes = [object_info[oid][1] for oid in blob_oids]
    summary = {
        "schema": "project-new-shoes.public-audit.v1",
        "tree": args.tree,
        "tree_oid": git(repo, "rev-parse", args.tree).decode().strip(),
        "refs": len(refs),
        "ref_manifest_sha256": hashlib.sha256(refs_text.encode()).hexdigest(),
        "commits": sum(1 for _, (object_type, _) in object_info.items() if object_type == "commit"),
        "trees": sum(1 for _, (object_type, _) in object_info.items() if object_type == "tree"),
        "blobs": len(blob_oids),
        "objects": len(object_info),
        "max_blob_bytes": max(blob_sizes, default=0),
        "blobs_over_1_mib": sum(size > 1024 * 1024 for size in blob_sizes),
        "blobs_over_10_mib": sum(size > 10 * 1024 * 1024 for size in blob_sizes),
        "history_findings": dict(sorted(category_counts.items())),
        "current_findings": dict(sorted(current_category_counts.items())),
    }
    (output / "summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n")

    current_credentials = sum(
        count
        for category, count in current_category_counts.items()
        if category.startswith("credential.")
    )
    print(json.dumps({
        "output": str(output),
        "refs": summary["refs"],
        "objects": summary["objects"],
        "blobs": summary["blobs"],
        "current_credentials": current_credentials,
        "history_url_credentials": category_counts.get("credential.url-userinfo", 0),
    }, sort_keys=True))
    return 1 if args.fail_current_credentials and current_credentials else 0


if __name__ == "__main__":
    raise SystemExit(main())
