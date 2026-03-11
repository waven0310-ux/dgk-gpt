#!/usr/bin/env bash
# setup-codex.sh - Codex CLI 설치/점검 헬퍼
# dgk-gpt는 Codex 자체를 강제 설치하지 않는다. 이 스크립트는 필요할 때만 실행한다.

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
skip() { echo -e "  ${YELLOW}·${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }

echo "=== Codex CLI ==="

if ! command -v npm &>/dev/null; then
  warn "npm not found. fnm/Node.js 설치 후 다시 실행: bash ~/.local/bin/setup-codex.sh"
  exit 1
fi

if command -v codex &>/dev/null; then
  skip "codex $(codex --version 2>/dev/null || echo 'installed')"
else
  echo -e "  ${YELLOW}↓${NC} Codex CLI 설치 중..."
  npm install -g @openai/codex@latest 2>/dev/null \
    && ok "codex $(codex --version 2>/dev/null)" \
    || warn "Codex CLI 설치 실패 (수동: npm install -g @openai/codex)"
fi

FNM_BIN="$HOME/.local/share/fnm/aliases/default/bin"
if [ -e "$FNM_BIN/codex" ] && [ ! -e "$HOME/.local/bin/codex" ]; then
  ln -sf "$FNM_BIN/codex" "$HOME/.local/bin/codex"
  ok "symlink: codex → $FNM_BIN/codex"
fi

if command -v codex &>/dev/null; then
  if codex login status >/dev/null 2>&1; then
    ok "Codex login active"
  else
    warn "Codex login required on this machine: codex login"
  fi
fi

echo ""
echo "=== Optional helpers ==="
if command -v uvx >/dev/null 2>&1; then
  ok "uvx available (Serena MCP can use this)"
else
  warn "uvx not found. Serena MCP needs uv/uvx in PATH"
fi

if command -v tmux >/dev/null 2>&1; then
  ok "tmux available (cxt helper ready)"
else
  warn "tmux not found. cxt helper is optional and only needed for tmux launches"
fi
