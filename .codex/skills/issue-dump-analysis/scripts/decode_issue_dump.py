#!/usr/bin/env python3
"""Decode C&C browser issue dumps.

Accepts either a raw .cncdump.json file or a .zip containing one. Prints a
compact summary JSON to stdout and optionally extracts embedded screenshots,
annotations, logs, redacted issue JSON, video, and replay-ready raw dump files.
"""

from __future__ import annotations

import argparse
import base64
import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path
from typing import Any


DATA_URL_RE = re.compile(r"^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$", re.S)
MIME_EXTENSIONS = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "video/webm": ".webm",
    "application/json": ".json",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Decode a C&C Zero Hour browser .cncdump.json report.",
    )
    parser.add_argument("dump", help="Path to .cncdump.json or .cncdump.json.zip")
    parser.add_argument("--issue", help="Only extract/summarize this issue id")
    parser.add_argument("--out", help="Directory for extracted evidence")
    parser.add_argument(
        "--timeline-radius",
        type=int,
        default=600,
        help="Frame radius for fallback timeline windows when an issue lacks one",
    )
    parser.add_argument(
        "--no-raw",
        action="store_true",
        help="Do not write dump.cncdump.json when --out is set",
    )
    return parser.parse_args()


def safe_name(value: Any, fallback: str = "item") -> str:
    text = str(value or fallback)
    text = re.sub(r"[^a-zA-Z0-9_.-]+", "-", text).strip("-")
    return text[:120] or fallback


def load_dump(path: Path) -> tuple[dict[str, Any], str, str | None]:
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            candidates = [
                name
                for name in archive.namelist()
                if not name.endswith("/")
                and not name.startswith("__MACOSX/")
                and (name.endswith(".json") or ".cncdump" in name)
            ]
            if not candidates:
                raise SystemExit(f"No JSON issue dump found in zip: {path}")

            errors: list[str] = []
            for name in candidates:
                try:
                    raw = archive.read(name).decode("utf-8")
                    dump = json.loads(raw)
                except Exception as error:  # pragma: no cover - diagnostic path
                    errors.append(f"{name}: {error}")
                    continue
                if dump.get("schema") == "cnc.issue-dump.v1":
                    return dump, raw, name
            detail = "; ".join(errors[:4])
            raise SystemExit(f"No cnc.issue-dump.v1 JSON found in zip: {path}. {detail}")

    raw = path.read_text(encoding="utf-8")
    dump = json.loads(raw)
    if dump.get("schema") != "cnc.issue-dump.v1":
        raise SystemExit(f"Unexpected dump schema: {dump.get('schema')!r}")
    return dump, raw, None


def data_url_parts(value: Any) -> tuple[str, bytes] | None:
    if not isinstance(value, str):
        return None
    match = DATA_URL_RE.match(value)
    if not match:
        return None
    mime = match.group(1)
    encoded = re.sub(r"\s+", "", match.group(2))
    try:
        return mime, base64.b64decode(encoded, validate=False)
    except Exception:
        return None


def data_url_summary(value: Any) -> dict[str, Any] | None:
    parts = data_url_parts(value)
    if not parts:
        return None
    mime, payload = parts
    return {
        "redactedDataUrl": True,
        "mime": mime,
        "bytesApprox": len(payload),
    }


def write_data_url(value: Any, path_without_extension: Path) -> str | None:
    parts = data_url_parts(value)
    if not parts:
        return None
    mime, payload = parts
    suffix = MIME_EXTENSIONS.get(mime, ".bin")
    target = path_without_extension.with_suffix(suffix)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(payload)
    return str(target)


def redact_data_urls(value: Any) -> Any:
    summary = data_url_summary(value)
    if summary:
        return summary
    if isinstance(value, dict):
        return {key: redact_data_urls(item) for key, item in value.items()}
    if isinstance(value, list):
        return [redact_data_urls(item) for item in value]
    return value


def finite_number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number or number in (float("inf"), float("-inf")):
        return None
    return number


def frame_value(event: dict[str, Any]) -> float | None:
    direct = finite_number(event.get("frame"))
    if direct is not None:
        return direct
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    for path in (
        ("frame", "framesCompleted"),
        ("state", "frame"),
        ("result", "frame", "framesCompleted"),
        ("result", "state", "frame"),
    ):
        cursor: Any = data
        for key in path:
            cursor = cursor.get(key) if isinstance(cursor, dict) else None
        nested = finite_number(cursor)
        if nested is not None:
            return nested
    return None


def fallback_timeline_window(
    timeline: list[dict[str, Any]],
    marker_frame: Any,
    radius: int,
) -> list[dict[str, Any]]:
    marker = finite_number(marker_frame)
    if marker is None:
        return []
    selected = []
    for event in timeline:
        frame = frame_value(event)
        if frame is not None and abs(frame - marker) <= radius:
            selected.append(event)
    return selected


def log_line(entry: Any) -> str:
    if isinstance(entry, dict):
        message = entry.get("message", "")
        time = entry.get("time")
        if time is None:
            return str(message)
        return f"{time} {message}"
    return str(entry)


def sample_frame(sample: dict[str, Any]) -> int | None:
    frame = sample.get("frame") if isinstance(sample.get("frame"), dict) else {}
    state = sample.get("state") if isinstance(sample.get("state"), dict) else {}
    value = frame.get("framesCompleted", state.get("frame"))
    number = finite_number(value)
    return int(number) if number is not None else None


def sample_logic_frame(sample: dict[str, Any]) -> int | None:
    frame = sample.get("frame") if isinstance(sample.get("frame"), dict) else {}
    gameplay = frame.get("gameplay") if isinstance(frame.get("gameplay"), dict) else {}
    number = finite_number(gameplay.get("logicFrame"))
    return int(number) if number is not None else None


def range_summary(values: list[int | None]) -> dict[str, int | None]:
    concrete = [value for value in values if value is not None]
    if not concrete:
        return {"first": None, "last": None, "min": None, "max": None}
    return {
        "first": concrete[0],
        "last": concrete[-1],
        "min": min(concrete),
        "max": max(concrete),
    }


def event_type_counts(timeline: list[dict[str, Any]]) -> dict[str, int]:
    counts: Counter[str] = Counter()
    for event in timeline:
        event_type = event.get("type") if isinstance(event, dict) else None
        counts[str(event_type or "unknown")] += 1
    return dict(sorted(counts.items()))


def issue_summary(issue: dict[str, Any], paths: dict[str, Any] | None = None) -> dict[str, Any]:
    annotation = issue.get("annotation") if isinstance(issue.get("annotation"), dict) else {}
    screenshot = issue.get("screenshot") if isinstance(issue.get("screenshot"), dict) else {}
    deep_snapshot = issue.get("deepSnapshot") if isinstance(issue.get("deepSnapshot"), dict) else None
    summary = {
        "id": issue.get("id"),
        "title": issue.get("title"),
        "comment": issue.get("comment"),
        "commentLength": len(issue.get("comment") or ""),
        "createdAt": issue.get("createdAt"),
        "markerFrame": issue.get("markerFrame"),
        "screenshot": {
            "width": screenshot.get("width"),
            "height": screenshot.get("height"),
            "dataUrl": data_url_summary(screenshot.get("dataUrl")),
        },
        "annotation": {
            "strokeCount": annotation.get("strokeCount", len(annotation.get("strokes") or [])),
            "annotatedMime": annotation.get("annotatedMime"),
            "annotatedDataUrl": data_url_summary(annotation.get("annotatedDataUrl")),
        },
        "timelineWindowEvents": len(issue.get("timelineWindow") or []),
        "logsTailEntries": len(issue.get("logsTail") or []),
        "deepSnapshotKeys": sorted(deep_snapshot.keys()) if deep_snapshot else [],
        "hasVideoContext": False,
    }
    if paths:
        summary["paths"] = paths
    return summary


def summarize_dump(
    dump: dict[str, Any],
    issue_filter: str | None = None,
    extracted_paths: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    manifest = dump.get("manifest") if isinstance(dump.get("manifest"), dict) else {}
    build = manifest.get("build") if isinstance(manifest.get("build"), dict) else {}
    server = build.get("server") if isinstance(build.get("server"), dict) else {}
    git = server.get("git") if isinstance(server.get("git"), dict) else {}
    browser = manifest.get("browser") if isinstance(manifest.get("browser"), dict) else {}
    webgl = browser.get("webgl") if isinstance(browser.get("webgl"), dict) else {}
    counts = manifest.get("counts") if isinstance(manifest.get("counts"), dict) else {}
    timeline = dump.get("timeline") if isinstance(dump.get("timeline"), list) else []
    frame_samples = dump.get("frameSamples") if isinstance(dump.get("frameSamples"), list) else []
    issues = dump.get("issues") if isinstance(dump.get("issues"), list) else []
    if issue_filter:
        issues = [issue for issue in issues if issue.get("id") == issue_filter]
    frame_values = [sample_frame(sample) for sample in frame_samples if isinstance(sample, dict)]
    logic_values = [sample_logic_frame(sample) for sample in frame_samples if isinstance(sample, dict)]
    media = dump.get("media") if isinstance(dump.get("media"), dict) else {}
    video = media.get("video") if isinstance(media.get("video"), dict) else None

    return {
        "schema": dump.get("schema"),
        "id": dump.get("id") or manifest.get("id"),
        "reason": dump.get("reason"),
        "generatedAt": dump.get("generatedAt") or manifest.get("generatedAt"),
        "sourcePage": browser.get("pageUrl"),
        "time": {
            "createdAt": manifest.get("createdAt"),
            "generatedAt": manifest.get("generatedAt"),
            "localString": (manifest.get("wallClock") or {}).get("localString")
            if isinstance(manifest.get("wallClock"), dict)
            else None,
            "timezone": (manifest.get("wallClock") or {}).get("timezone")
            if isinstance(manifest.get("wallClock"), dict)
            else browser.get("timezone"),
            "timezoneOffsetMinutes": (manifest.get("wallClock") or {}).get("timezoneOffsetMinutes")
            if isinstance(manifest.get("wallClock"), dict)
            else browser.get("timezoneOffsetMinutes"),
        },
        "build": {
            "latestLastModified": build.get("latestLastModified"),
            "assetCount": len(build.get("assets") or []),
            "serverGit": {
                "available": git.get("available"),
                "commit": git.get("commit"),
                "shortCommit": git.get("shortCommit"),
                "branch": git.get("branch"),
                "describe": git.get("describe"),
                "dirty": git.get("dirty"),
                "statusCount": len(git.get("status") or []),
            }
            if server
            else None,
        },
        "browser": {
            "userAgent": browser.get("userAgent"),
            "platform": browser.get("platform"),
            "language": browser.get("language"),
            "screen": browser.get("screen"),
            "viewport": browser.get("viewport"),
            "canvas": browser.get("canvas"),
            "webgl": {
                "vendor": webgl.get("vendor"),
                "renderer": webgl.get("renderer"),
            },
        },
        "counts": {
            "manifest": counts,
            "timeline": len(timeline),
            "frameSamples": len(frame_samples),
            "issues": len(dump.get("issues") or []),
            "logs": len(dump.get("logs") or []),
        },
        "timeline": {
            "eventTypes": event_type_counts(timeline),
            "first": redact_data_urls(timeline[0]) if timeline else None,
            "last": redact_data_urls(timeline[-1]) if timeline else None,
        },
        "frames": {
            "engine": range_summary(frame_values),
            "logic": range_summary(logic_values),
        },
        "issues": [
            issue_summary(issue, (extracted_paths or {}).get(str(issue.get("id"))))
            for issue in issues
            if isinstance(issue, dict)
        ],
        "media": {
            "video": data_url_summary(video.get("dataUrl")) if video else None,
            "videoMime": video.get("mime") if video else None,
            "videoBytesApprox": video.get("bytesApprox") if video else None,
        },
        "replay": dump.get("replay"),
    }


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def extract_issue(
    issue: dict[str, Any],
    timeline: list[dict[str, Any]],
    issue_dir: Path,
    timeline_radius: int,
) -> dict[str, Any]:
    paths: dict[str, Any] = {}
    screenshot = issue.get("screenshot") if isinstance(issue.get("screenshot"), dict) else {}
    annotation = issue.get("annotation") if isinstance(issue.get("annotation"), dict) else {}
    deep_snapshot = issue.get("deepSnapshot") if isinstance(issue.get("deepSnapshot"), dict) else None

    screenshot_path = write_data_url(screenshot.get("dataUrl"), issue_dir / "screenshot")
    if screenshot_path:
        paths["screenshot"] = screenshot_path

    annotated_path = write_data_url(annotation.get("annotatedDataUrl"), issue_dir / "annotated")
    if annotated_path:
        paths["annotated"] = annotated_path

    if deep_snapshot:
        deep_shot = deep_snapshot.get("screenshotAfterDeepFrames")
        if isinstance(deep_shot, dict):
            deep_screenshot = deep_shot.get("screenshot") if isinstance(deep_shot.get("screenshot"), dict) else {}
            deep_path = write_data_url(deep_screenshot.get("dataUrl"), issue_dir / "screenshot-after-deep")
            if deep_path:
                paths["screenshotAfterDeepFrames"] = deep_path
        write_json(issue_dir / "deep-snapshot.redacted.json", redact_data_urls(deep_snapshot))
        paths["deepSnapshot"] = str(issue_dir / "deep-snapshot.redacted.json")

    timeline_window = issue.get("timelineWindow")
    if not timeline_window:
        timeline_window = fallback_timeline_window(timeline, issue.get("markerFrame"), timeline_radius)
    write_json(issue_dir / "timeline-window.json", redact_data_urls(timeline_window or []))
    paths["timelineWindow"] = str(issue_dir / "timeline-window.json")

    logs_tail = issue.get("logsTail") or []
    logs_path = issue_dir / "logs-tail.txt"
    logs_path.parent.mkdir(parents=True, exist_ok=True)
    logs_path.write_text("\n".join(log_line(entry) for entry in logs_tail) + ("\n" if logs_tail else ""), encoding="utf-8")
    paths["logsTail"] = str(logs_path)

    write_json(issue_dir / "issue.redacted.json", redact_data_urls(issue))
    paths["issueJson"] = str(issue_dir / "issue.redacted.json")
    return paths


def extract_dump(
    dump: dict[str, Any],
    raw_text: str,
    out_dir: Path,
    issue_filter: str | None,
    timeline_radius: int,
    write_raw: bool,
) -> dict[str, dict[str, Any]]:
    out_dir.mkdir(parents=True, exist_ok=True)
    if write_raw:
        (out_dir / "dump.cncdump.json").write_text(raw_text, encoding="utf-8")

    timeline = dump.get("timeline") if isinstance(dump.get("timeline"), list) else []
    logs = dump.get("logs") if isinstance(dump.get("logs"), list) else []
    (out_dir / "logs.txt").write_text("\n".join(log_line(entry) for entry in logs) + ("\n" if logs else ""), encoding="utf-8")
    write_json(out_dir / "timeline.event-counts.json", event_type_counts(timeline))

    paths_by_issue: dict[str, dict[str, Any]] = {}
    issues = dump.get("issues") if isinstance(dump.get("issues"), list) else []
    for issue in issues:
        if not isinstance(issue, dict):
            continue
        issue_id = str(issue.get("id") or f"issue-{len(paths_by_issue) + 1:03d}")
        if issue_filter and issue_id != issue_filter:
            continue
        issue_dir = out_dir / "issues" / safe_name(issue_id, "issue")
        paths_by_issue[issue_id] = extract_issue(issue, timeline, issue_dir, timeline_radius)

    media = dump.get("media") if isinstance(dump.get("media"), dict) else {}
    video = media.get("video") if isinstance(media.get("video"), dict) else None
    if video:
        video_path = write_data_url(video.get("dataUrl"), out_dir / "media" / "video")
        if video_path:
            write_json(out_dir / "media" / "video.json", redact_data_urls(video))

    return paths_by_issue


def main() -> int:
    args = parse_args()
    dump_path = Path(args.dump)
    dump, raw_text, zip_member = load_dump(dump_path)
    if args.issue and not any(
        isinstance(issue, dict) and issue.get("id") == args.issue
        for issue in dump.get("issues") or []
    ):
        raise SystemExit(f"Issue {args.issue!r} not found in dump")

    extracted_paths: dict[str, dict[str, Any]] = {}
    if args.out:
        out_dir = Path(args.out)
        extracted_paths = extract_dump(
            dump,
            raw_text,
            out_dir,
            args.issue,
            args.timeline_radius,
            not args.no_raw,
        )
    summary = summarize_dump(dump, args.issue, extracted_paths)
    summary["source"] = {
        "path": str(dump_path),
        "zipMember": zip_member,
    }
    if args.out:
        summary["outputDirectory"] = str(Path(args.out))
        write_json(Path(args.out) / "summary.json", summary)
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
