#!/usr/bin/env bash
set -euo pipefail

# dgk-gpt 원라인 설치 스크립트
# 사용법: curl -fsSL https://raw.githubusercontent.com/dgk-dev/dgk-gpt/main/install-remote.sh | bash

RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { printf '%b[dgk-gpt]%b %s\n' "$BLUE" "$NC" "$*"; }
error() { printf '%b[dgk-gpt]%b %s\n' "$RED" "$NC" "$*" >&2; }

# 필수 도구 확인
for cmd in git node; do
  if ! command -v "$cmd" &>/dev/null; then
    error "$cmd가 필요합니다. 먼저 설치하세요."
    case "$cmd" in
      node) error "  Node.js 18+ 설치: https://nodejs.org/" ;;
      git) error "  https://git-scm.com/downloads" ;;
    esac
    exit 1
  fi
done

TMP="$(mktemp -d 2>/dev/null || mktemp -d -t 'dgk-gpt')"
trap 'rm -rf "$TMP"' EXIT

info "dgk-gpt를 다운로드합니다..."
git clone --depth 1 https://github.com/dgk-dev/dgk-gpt.git "$TMP/dgk-gpt" 2>/dev/null

info "설치를 시작합니다..."
bash "$TMP/dgk-gpt/install.sh" "$@"
