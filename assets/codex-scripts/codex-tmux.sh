#!/usr/bin/env bash
# cxt - Codex CLI tmux launcher
# 기본값: cxt profile + no approvals + no sandbox
# 현재 디렉터리/현재 브랜치에서 Codex를 띄운다.
set -euo pipefail

MODE="danger-cxt"
PROJECT_DIR="$(pwd)"
CODEX_CMD=()
SESSION_BASE=""
MODE_LABEL=""
CXT_FINISH_PROMPT="/cp"
CXT_INSTALL_NOTE=""
LOGIN_SHELL=""

export PATH="$HOME/.local/bin:$HOME/.local/share/fnm/aliases/default/bin:$HOME/.local/share/pnpm:$PATH"

require_tmux() {
  if command -v tmux >/dev/null 2>&1; then
    return 0
  fi

  echo "[cxt] tmux is required for this helper"
  echo "[cxt] install tmux first or run codex directly"
  exit 1
}

list_sessions() {
  tmux list-sessions -F '#{session_name}|#{session_windows}|#{?session_attached,attached,detached}|#{t:session_created}' 2>/dev/null \
    | awk -F '|' '$1 ~ /^cxt/ { printf "%-20s windows=%-3s %-8s created=%s\n", $1, $2, $3, $4 }'
}

resolve_login_shell() {
  if [[ -n "${SHELL:-}" && -x "${SHELL}" ]]; then
    printf '%s\n' "$SHELL"
    return 0
  fi

  if command -v zsh >/dev/null 2>&1; then
    command -v zsh
    return 0
  fi

  printf '/bin/bash\n'
}

if [[ $# -gt 0 ]]; then
  case "$1" in
    ls|list)
      require_tmux
      if ! list_sessions; then
        echo "No Codex tmux session found."
      fi
      exit 0
      ;;
    safe|full-auto)
      MODE="safe"
      shift
      ;;
    -p|--profile)
      if [[ $# -lt 2 ]]; then
        echo "Usage: cxt [ls|safe|--profile <name>] [project-dir]" >&2
        exit 1
      fi
      MODE="profile:$2"
      shift 2
      ;;
  esac
fi

if [[ $# -gt 0 ]]; then
  PROJECT_DIR="$1"
fi

PROJECT_DIR=$(cd "$PROJECT_DIR" 2>/dev/null && pwd)
require_tmux

case "$MODE" in
  danger-cxt)
    CODEX_CMD=(codex -p cxt --dangerously-bypass-approvals-and-sandbox)
    SESSION_BASE="cxt"
    MODE_LABEL="cxt + bypass approvals + no sandbox"
    ;;
  safe)
    CODEX_CMD=(codex --full-auto)
    SESSION_BASE="cxt-safe"
    MODE_LABEL="full-auto"
    ;;
  profile:*)
    PROFILE_NAME="${MODE#profile:}"
    CODEX_CMD=(codex -p "${PROFILE_NAME}")
    SESSION_BASE="cxt-${PROFILE_NAME}"
    MODE_LABEL="profile:${PROFILE_NAME}"
    ;;
esac

# Keep the interactive launch quiet even if the file-level suppress flag is ignored.
CODEX_CMD+=(-c suppress_unstable_features_warning=true)

bootstrap_project_dependencies() {
  local launch_dir="$1"
  local bootstrap_dir="$launch_dir"

  if git -C "$launch_dir" rev-parse --show-toplevel >/dev/null 2>&1; then
    bootstrap_dir=$(git -C "$launch_dir" rev-parse --show-toplevel)
  fi

  if [[ "${CXT_SKIP_INSTALL:-0}" == "1" ]]; then
    CXT_INSTALL_NOTE="dependency bootstrap skipped (CXT_SKIP_INSTALL=1)"
    return 0
  fi

  if [[ ! -f "$bootstrap_dir/package.json" || ! -f "$bootstrap_dir/pnpm-lock.yaml" ]]; then
    return 0
  fi

  if [[ -d "$bootstrap_dir/node_modules" ]]; then
    return 0
  fi

  echo "[cxt] bootstrapping pnpm dependencies in $bootstrap_dir"
  (
    cd "$bootstrap_dir"
    pnpm install --frozen-lockfile
  )
  CXT_INSTALL_NOTE="pnpm install --frozen-lockfile completed in $bootstrap_dir"
}

current_branch() {
  git -C "$PROJECT_DIR" branch --show-current 2>/dev/null || true
}

print_banner() {
  local branch_name

  branch_name=$(current_branch)

  printf '[cxt] mode: %s\n' "$MODE_LABEL"
  printf '[cxt] safe mode: cxt safe'
  if [[ -n "${PROJECT_DIR:-}" ]]; then
    printf '  |  cwd: %s' "$PROJECT_DIR"
  fi
  printf '\n'
  if [[ -n "$branch_name" ]]; then
    printf '[cxt] branch: %s\n' "$branch_name"
  fi
  printf '[cxt] finish skill: %s\n' "$CXT_FINISH_PROMPT"
  if [[ -n "${CXT_INSTALL_NOTE:-}" ]]; then
    printf '[cxt] deps: %s\n' "$CXT_INSTALL_NOTE"
  fi
}

run_codex_and_recover_shell() {
  local codex_status=0

  set +e
  "${CODEX_CMD[@]}"
  codex_status=$?
  set -e

  if [[ $codex_status -ne 0 && $codex_status -ne 130 ]]; then
    printf '[cxt] codex exited with status %s; reopening %s\n' "$codex_status" "$LOGIN_SHELL"
  fi

  exec "$LOGIN_SHELL" -il
}

bootstrap_project_dependencies "$PROJECT_DIR"
LOGIN_SHELL=$(resolve_login_shell)

if [ -n "${TMUX:-}" ]; then
  print_banner
  cd "$PROJECT_DIR"
  run_codex_and_recover_shell
fi

SESSION_NAME="${SESSION_BASE}"
N=1
while tmux has-session -t "$SESSION_NAME" 2>/dev/null; do
  SESSION_NAME="${SESSION_BASE}-${N}"
  ((N++))
done

TMUX_BOOTSTRAP=""
TMUX_BOOTSTRAP+="export PATH=$(printf '%q' "$PATH")"$'\n'
TMUX_BOOTSTRAP+="printf '[cxt] mode: %s\\n' $(printf '%q' "$MODE_LABEL")"$'\n'
TMUX_BOOTSTRAP+="printf '[cxt] safe mode: cxt safe  |  cwd: %s\\n' $(printf '%q' "$PROJECT_DIR")"$'\n'
branch_name=$(current_branch)
if [[ -n "$branch_name" ]]; then
  TMUX_BOOTSTRAP+="printf '[cxt] branch: %s\\n' $(printf '%q' "$branch_name")"$'\n'
fi
TMUX_BOOTSTRAP+="printf '[cxt] finish skill: %s\\n' $(printf '%q' "$CXT_FINISH_PROMPT")"$'\n'
if [[ -n "${CXT_INSTALL_NOTE:-}" ]]; then
  TMUX_BOOTSTRAP+="printf '[cxt] deps: %s\\n' $(printf '%q' "$CXT_INSTALL_NOTE")"$'\n'
fi
TMUX_BOOTSTRAP+="set +e"$'\n'
TMUX_BOOTSTRAP+="$(printf '%q ' "${CODEX_CMD[@]}")"$'\n'
TMUX_BOOTSTRAP+="exec $(printf '%q' "$LOGIN_SHELL") -il"$'\n'

tmux new-session -s "$SESSION_NAME" -c "$PROJECT_DIR" \
  "bash -lc $(printf '%q' "$TMUX_BOOTSTRAP")"
