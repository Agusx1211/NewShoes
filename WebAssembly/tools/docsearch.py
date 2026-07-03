#!/usr/bin/env python3
"""Ranked full-text search over the assets/docs reference library.

Build the index (a few minutes, run after adding/pulling library repos):
    python3 WebAssembly/tools/docsearch.py build

Search (BM25-ranked, FTS5 query syntax: AND/OR/NOT, "exact phrase", NEAR):
    python3 WebAssembly/tools/docsearch.py search "zwriteenable clear depth"
    python3 WebAssembly/tools/docsearch.py search --cat graphics -n 5 lockrect
    python3 WebAssembly/tools/docsearch.py search '"texture stage state"'

Notes:
- The default tokenizer splits identifiers on '_', so searching
  "zwriteenable" matches D3DRS_ZWRITEENABLE.
- The index lives at assets/docs/.docsearch.db (gitignored).
- For exact-string or regex needs, use ripgrep on assets/docs instead.
"""

import argparse
import os
import re
import sqlite3
import sys
import time

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DOCS_ROOT = os.path.join(REPO_ROOT, "assets", "docs")
DB_PATH = os.path.join(DOCS_ROOT, ".docsearch.db")

TEXT_EXTS = {
    ".md", ".txt", ".rst", ".bs", ".adoc",
    ".h", ".hpp", ".hh", ".inl", ".c", ".cc", ".cpp", ".cxx",
    ".cs", ".py", ".js", ".mjs", ".ts",
    ".htm", ".html",
    ".ini", ".cfg", ".glsl", ".frag", ".vert", ".fx", ".hlsl", ".wgsl",
}
SKIP_DIRS = {
    ".git", "node_modules", "public", "dist", "build", "third_party",
    ".docsearch", "__pycache__",
}
MAX_FILE_BYTES = 2 * 1024 * 1024

TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"[ \t\r\f\v]+")


def clean_text(path, data):
    text = data.decode("utf-8", errors="replace")
    if path.endswith((".htm", ".html")):
        text = TAG_RE.sub(" ", text)
    return WS_RE.sub(" ", text)


def build():
    if not os.path.isdir(DOCS_ROOT):
        sys.exit(f"missing {DOCS_ROOT}")
    t0 = time.time()
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    db = sqlite3.connect(DB_PATH)
    db.execute(
        "CREATE VIRTUAL TABLE docs USING fts5(path UNINDEXED, cat UNINDEXED, body)"
    )
    count = skipped = 0
    for dirpath, dirnames, filenames in os.walk(DOCS_ROOT):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for name in sorted(filenames):
            if os.path.splitext(name)[1].lower() not in TEXT_EXTS:
                continue
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, DOCS_ROOT)
            try:
                if os.path.getsize(full) > MAX_FILE_BYTES:
                    skipped += 1
                    continue
                with open(full, "rb") as f:
                    data = f.read()
            except OSError:
                skipped += 1
                continue
            cat = rel.split(os.sep, 1)[0]
            db.execute(
                "INSERT INTO docs(path, cat, body) VALUES (?, ?, ?)",
                (rel, cat, clean_text(rel, data)),
            )
            count += 1
            if count % 5000 == 0:
                db.commit()
                print(f"  {count} files...", file=sys.stderr)
    db.commit()
    db.execute("INSERT INTO docs(docs) VALUES ('optimize')")
    db.commit()
    db.close()
    size_mb = os.path.getsize(DB_PATH) / 1e6
    print(
        f"indexed {count} files ({skipped} skipped) in {time.time() - t0:.0f}s "
        f"-> {DB_PATH} ({size_mb:.0f} MB)"
    )


def search(query, cat, limit, snippets):
    if not os.path.exists(DB_PATH):
        sys.exit("no index; run: python3 WebAssembly/tools/docsearch.py build")
    db = sqlite3.connect(DB_PATH)
    sql = (
        "SELECT path, cat, snippet(docs, 2, '>>>', '<<<', ' ... ', 18) "
        "FROM docs WHERE docs MATCH ?"
    )
    args = [query]
    if cat:
        sql += " AND cat = ?"
        args.append(cat)
    sql += " ORDER BY bm25(docs) LIMIT ?"
    args.append(limit)
    try:
        rows = db.execute(sql, args).fetchall()
    except sqlite3.OperationalError as e:
        sys.exit(f"query error: {e} (quote special chars, e.g. '\"d3d8.h\"')")
    if not rows:
        print("no matches")
        return
    for path, category, snip in rows:
        print(f"[{category}] {path}")
        if snippets:
            print(f"    {snip.strip()}")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("build", help="(re)build the index")
    s = sub.add_parser("search", help="ranked search")
    s.add_argument("query", nargs="+", help="FTS5 query terms")
    s.add_argument("--cat", help="restrict to a top-level category dir")
    s.add_argument("-n", type=int, default=10, help="max results (default 10)")
    s.add_argument("--no-snippets", action="store_true")
    a = p.parse_args()
    if a.cmd == "build":
        build()
    else:
        search(" ".join(a.query), a.cat, a.n, not a.no_snippets)


if __name__ == "__main__":
    main()
