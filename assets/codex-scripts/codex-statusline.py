#!/usr/bin/env python3
"""Track the latest user request for a running Codex process and mirror it into tmux."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path


IGNORE_PREFIXES = (
    "# AGENTS.md instructions for ",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="codex-statusline",
        description="Mirror the latest user request from a Codex rollout into tmux.",
    )
    parser.add_argument("--pid", type=int, help="Codex process id to inspect for the rollout file")
    parser.add_argument(
        "--parent-pid",
        type=int,
        help="Parent shell pid whose descendants should be searched for the active Codex process",
    )
    parser.add_argument("--rollout-path", help="Use an explicit rollout JSONL path instead of PID detection")
    parser.add_argument("--tmux-target", help="tmux target like session:window")
    parser.add_argument("--width", type=int, default=96, help="Maximum rendered width")
    parser.add_argument("--poll-interval", type=float, default=0.4, help="Polling interval in seconds")
    parser.add_argument("--once", action="store_true", help="Print the current summary once and exit")
    return parser.parse_args()


def process_alive(pid: int) -> bool:
    return Path(f"/proc/{pid}").exists()


def read_ppid(pid: int) -> int | None:
    stat_path = Path(f"/proc/{pid}/stat")
    try:
        raw = stat_path.read_text(encoding="utf-8")
    except OSError:
        return None

    try:
        end = raw.rfind(")")
        fields = raw[end + 2 :].split()
        return int(fields[1])
    except (IndexError, ValueError):
        return None


def descendant_pids(parent_pid: int) -> set[int]:
    children: dict[int, list[int]] = {}
    for proc_dir in Path("/proc").iterdir():
        if not proc_dir.name.isdigit():
            continue
        pid = int(proc_dir.name)
        ppid = read_ppid(pid)
        if ppid is None:
            continue
        children.setdefault(ppid, []).append(pid)

    descendants: set[int] = set()
    stack = [parent_pid]
    while stack:
        current = stack.pop()
        for child in children.get(current, []):
            if child in descendants:
                continue
            descendants.add(child)
            stack.append(child)
    return descendants


def cmdline_for_pid(pid: int) -> str:
    cmdline_path = Path(f"/proc/{pid}/cmdline")
    try:
        raw = cmdline_path.read_bytes()
    except OSError:
        return ""
    return raw.decode("utf-8", "ignore").replace("\x00", " ").strip()


def is_codex_process(pid: int) -> bool:
    cmdline = cmdline_for_pid(pid)
    if not cmdline:
        return False
    return "codex" in cmdline and "@openai/codex" in cmdline


def find_child_codex_pid(parent_pid: int) -> int | None:
    for pid in sorted(descendant_pids(parent_pid)):
        if is_codex_process(pid):
            return pid
    return None


def find_rollout_path(pid: int) -> Path | None:
    fd_dir = Path(f"/proc/{pid}/fd")
    if not fd_dir.exists():
        return None

    for fd_path in fd_dir.iterdir():
        try:
            target = os.readlink(fd_path)
        except OSError:
            continue
        if "/.codex/sessions/" not in target or not target.endswith(".jsonl"):
            continue
        path = Path(target)
        if path.exists():
            return path
    return None


def compact_text(text: str) -> str:
    return " ".join(text.split())


def clean_user_text(text: str) -> str:
    stripped = text.strip()
    if not stripped:
        return ""

    for prefix in IGNORE_PREFIXES:
        if stripped.startswith(prefix):
            return ""

    return stripped


def render_summary(text: str, width: int) -> str:
    compact = compact_text(text)
    if not compact:
        return ""
    if len(compact) <= width:
        return compact
    return compact[: max(width - 3, 1)].rstrip() + "..."


def message_text(payload: dict[str, object]) -> str:
    if payload.get("type") != "message" or payload.get("role") != "user":
        return ""

    content = payload.get("content")
    if not isinstance(content, list):
        return ""

    parts: list[str] = []
    for item in content:
        if not isinstance(item, dict):
            continue
        item_type = item.get("type")
        if item_type not in {"input_text", "output_text"}:
            continue
        text = item.get("text")
        if isinstance(text, str):
            cleaned = clean_user_text(text)
            if cleaned:
                parts.append(cleaned)
    return "\n".join(parts).strip()


class RolloutTail:
    def __init__(self, path: Path, width: int) -> None:
        self.path = path
        self.width = width
        self.offset = 0
        self.latest_summary = ""

    def refresh(self) -> str:
        if not self.path.exists():
            return self.latest_summary

        size = self.path.stat().st_size
        if size < self.offset:
            self.offset = 0

        with self.path.open("r", encoding="utf-8") as handle:
            handle.seek(self.offset)
            for raw_line in handle:
                raw_line = raw_line.strip()
                if not raw_line:
                    continue
                try:
                    record = json.loads(raw_line)
                except json.JSONDecodeError:
                    continue

                payload = record.get("payload")
                if not isinstance(payload, dict):
                    continue

                text = message_text(payload)
                if not text:
                    continue

                summary = render_summary(text, self.width)
                if summary:
                    self.latest_summary = summary

            self.offset = handle.tell()

        return self.latest_summary


def set_tmux_window_name(target: str, summary: str) -> None:
    if not summary:
        return

    label = f"rq: {summary}"
    subprocess.run(
        ["tmux", "set-window-option", "-t", target, "automatic-rename", "off"],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    subprocess.run(
        ["tmux", "rename-window", "-t", target, label],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def print_or_tmux(target: str | None, summary: str) -> None:
    if target:
        set_tmux_window_name(target, summary)
        return
    print(summary)


def main() -> int:
    args = parse_args()

    rollout_path = Path(args.rollout_path).expanduser() if args.rollout_path else None
    codex_pid = args.pid
    if rollout_path is None and codex_pid is None and args.parent_pid is None:
        print("codex-statusline requires --pid, --parent-pid, or --rollout-path", file=sys.stderr)
        return 2

    tail: RolloutTail | None = None
    last_published = ""

    while True:
        if codex_pid is None and args.parent_pid is not None and process_alive(args.parent_pid):
            codex_pid = find_child_codex_pid(args.parent_pid)

        if rollout_path is None and codex_pid is not None:
            rollout_path = find_rollout_path(codex_pid)

        if rollout_path is not None and tail is None:
            tail = RolloutTail(rollout_path, args.width)

        if tail is not None:
            summary = tail.refresh()
            if summary and summary != last_published:
                print_or_tmux(args.tmux_target, summary)
                last_published = summary
            if args.once:
                return 0

        if codex_pid is not None and not process_alive(codex_pid):
            return 0

        if codex_pid is None and args.parent_pid is not None and not process_alive(args.parent_pid):
            return 0

        if codex_pid is None and args.parent_pid is None and args.once:
            return 0

        time.sleep(args.poll_interval)


if __name__ == "__main__":
    raise SystemExit(main())
