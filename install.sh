#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  printf '[dgk-gpt] Node.js 18+가 필요합니다. npx dgk-gpt 또는 Node 설치 후 다시 실행하세요.\n' >&2
  exit 1
fi

exec node "$SCRIPT_DIR/lib/install.js" "$@"
