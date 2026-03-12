#!/usr/bin/env bash
# setup-codex.sh - Codex CLI 설치/점검 헬퍼
# dgk-gpt는 Codex 자체를 강제 설치하지 않는다. 이 스크립트는 필요할 때만 실행한다.

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

AUTO_YES=0
INSTALL_TMUX=0

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
skip() { echo -e "  ${YELLOW}·${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }

print_usage() {
  cat <<'EOF'
Usage:
  bash ~/.local/bin/setup-codex.sh [--install-tmux] [--yes]

Options:
  --install-tmux   Try to install tmux automatically when missing.
  --yes            Skip install confirmations for optional helpers.
  --help, -h       Show this help text.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --install-tmux) INSTALL_TMUX=1 ;;
    --yes) AUTO_YES=1 ;;
    --help|-h)
      print_usage
      exit 0
      ;;
    *)
      warn "unknown option: $arg"
      print_usage
      exit 1
      ;;
  esac
done

can_prompt() {
  [ -t 0 ] && [ -t 1 ]
}

wants_yes() {
  local answer="$1"
  [[ -z "$answer" || "$answer" =~ ^[Yy]([Ee][Ss])?$ ]]
}

find_tmux_installer() {
  if command -v brew >/dev/null 2>&1; then
    echo "brew"
    return 0
  fi
  if command -v apt-get >/dev/null 2>&1; then
    echo "apt-get"
    return 0
  fi
  if command -v dnf >/dev/null 2>&1; then
    echo "dnf"
    return 0
  fi
  if command -v pacman >/dev/null 2>&1; then
    echo "pacman"
    return 0
  fi
  if command -v zypper >/dev/null 2>&1; then
    echo "zypper"
    return 0
  fi
  return 1
}

run_as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return
  fi
  warn "sudo not found. tmux 설치를 자동으로 진행할 수 없습니다."
  return 1
}

install_tmux_with_manager() {
  local manager="$1"
  case "$manager" in
    brew)
      brew install tmux
      ;;
    apt-get)
      run_as_root apt-get update
      run_as_root apt-get install -y tmux
      ;;
    dnf)
      run_as_root dnf install -y tmux
      ;;
    pacman)
      run_as_root pacman -Sy --noconfirm tmux
      ;;
    zypper)
      run_as_root zypper --non-interactive install tmux
      ;;
    *)
      warn "지원하지 않는 tmux installer: $manager"
      return 1
      ;;
  esac
}

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
  ok "uvx available (dgk-gpt will enable Serena MCP)"
else
  warn "uvx not found. dgk-gpt will keep Serena MCP disabled until uv/uvx is installed"
fi

if command -v tmux >/dev/null 2>&1; then
  ok "tmux available (cxt helper ready)"
else
  warn "tmux not found. cxt helper is optional and only needed for tmux launches"
  if installer="$(find_tmux_installer)"; then
    if [ "$INSTALL_TMUX" -eq 1 ] || [ "$AUTO_YES" -eq 1 ]; then
      echo -e "  ${YELLOW}↓${NC} tmux 설치 중... (${installer})"
      if install_tmux_with_manager "$installer" && command -v tmux >/dev/null 2>&1; then
        ok "tmux installed"
      else
        warn "tmux 자동 설치 실패. 수동으로 설치 후 다시 확인하세요."
      fi
    elif can_prompt; then
      printf "  tmux를 지금 설치할까요? [%s] [Y/n] " "$installer"
      read -r answer
      if wants_yes "$answer"; then
        echo -e "  ${YELLOW}↓${NC} tmux 설치 중... (${installer})"
        if install_tmux_with_manager "$installer" && command -v tmux >/dev/null 2>&1; then
          ok "tmux installed"
        else
          warn "tmux 자동 설치 실패. 수동으로 설치 후 다시 확인하세요."
        fi
      else
        skip "tmux install skipped"
      fi
    else
      warn "tmux auto-install available: bash ~/.local/bin/setup-codex.sh --install-tmux --yes"
    fi
  else
    warn "지원되는 패키지 매니저를 찾지 못했습니다. tmux를 수동 설치하세요."
  fi
fi
