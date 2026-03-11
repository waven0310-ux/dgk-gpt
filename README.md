# dgk-gpt

Codex 기본도 강합니다.

그런데 팀으로 쓰기 시작하면 금방 갈립니다.

누군가는 스킬이 없고,<br />
누군가는 MCP가 비어 있고,<br />
누군가는 `AGENTS.md` 규칙이 없고,<br />
누군가는 기존 셋업이 망가질까 봐 설치를 미룹니다.

`dgk-gpt`는 그걸 줄이기 위해 만든 실전 Codex 셋업입니다.

내가 실제로 쓰는 Codex 운영 방식 중에서 팀에 바로 옮겨도 되는 것만 추려서,
기존 개인 셋업을 최대한 보존하는 설치기로 묶었습니다.

한 줄로 말하면 이겁니다.

> 팀 전체 Codex 작업 방식을 한 번에 맞추되, 각자 이미 쓰던 환경은 최대한 안 깨는 설치기

## 팀원에게 이렇게 보내면 됩니다

그냥 아래 문구 그대로 보내도 됩니다.

```text
Codex 쓰는 사람은 아래 한 줄만 실행하면 됩니다.

npx dgk-gpt@latest

기존 ~/.codex/config.toml, ~/.codex/AGENTS.md, 스킬 폴더를 통째로 덮어쓰지 않고
필요한 설정만 안전하게 병합합니다.

먼저 어떤 변경이 들어가는지 보고 싶으면:
npx dgk-gpt@latest --dry-run
```

## 설치

가장 간단한 방법:

```bash
npx dgk-gpt@latest
```

전역 설치:

```bash
npm install -g dgk-gpt
```

변경 예정만 먼저 보기:

```bash
npx dgk-gpt@latest --dry-run
```

Pix 팀용 DevTools layer까지 같이 설치:

```bash
npx dgk-gpt@latest --with-pix-devtools
```

이미 예전 방식으로 `~/.codex/skills`를 쓰고 있다면 강제로 legacy 모드 지정:

```bash
npx dgk-gpt@latest --skills-dir legacy
```

원라인 설치:

```bash
curl -fsSL https://raw.githubusercontent.com/dgk-dev/dgk-gpt/main/install-remote.sh | bash
```

직접 clone해서 설치:

```bash
git clone https://github.com/dgk-dev/dgk-gpt.git
cd dgk-gpt
./install.sh
```

## 설치하면 바로 들어가는 것

### 워크플로우 스킬

기본 워크플로우 스킬은 fresh install이면 `~/.agents/skills`에,
이미 legacy root를 쓰고 있으면 `~/.codex/skills`에 설치됩니다.

- `/re`: 먼저 조사하고 들어가는 리서치 + 구현 모드
- `/cp`: 이번 세션에서 건드린 파일만 안전하게 commit + push
- `/fd`: UI/UX를 더 보기 좋게 다듬는 디자인 모드
- `/ralph`: 중간에 끊지 않고 끝까지 밀어붙이는 마감 모드
- `/test`: 기존 테스트 스택, 브라우저 검증, DevTools 진단까지 묶어서 끝까지 반복하는 검증 모드

### 리뷰 스킬

리뷰 스킬은 항상 공식 user skill 경로인 `~/.agents/skills`에 설치됩니다.

- `/rr`: 무료 GLM 기반 코드 리뷰
- `/rrr`: 더 깊게 보는 GLM-5 리뷰

주의:
- `dgk-gpt`는 리뷰 스킬만 설치합니다.
- 실제 리뷰 실행에는 `glm-review`와 `ZAI_API_KEY`가 필요합니다.

```bash
npm install -g glm-review
```

### Codex 설정 병합

`dgk-gpt`는 아래 두 파일을 관리합니다.

- `~/.codex/AGENTS.md`
- `~/.codex/config.toml`

하지만 통째로 갈아엎지 않습니다.

업데이트 범위는 아래로 제한됩니다.

- `AGENTS.md` 안의 `dgk-gpt` managed block
- `config.toml`의 `[features]`
- `profiles.dgk-fast`, `profiles.dgk-careful`, `profiles.cxt`
- `mcp_servers.context7`, `mcp_servers.serena`, `mcp_servers.chrome-devtools`, `mcp_servers.jina`

`--with-pix-devtools`를 함께 쓰면 여기에 아래도 추가됩니다.

- `mcp_servers.tauri-devtools`
- Pix DevTools용 AGENTS 안내 블록

### 헬퍼 스크립트

같이 설치되는 스크립트:

- `~/.codex/scripts/codex-tmux.sh`
- `~/.local/bin/setup-codex.sh`

`codex-tmux.sh`는 `cxt` 류 tmux 워크플로우용 헬퍼입니다.

## Pix DevTools 옵션

Pix 팀원이 WSL에서 브라우저와 Tauri desktop까지 Codex로 바로 검증하고 싶다면 이 옵션을 같이 쓰면 됩니다.

```bash
npx dgk-gpt@latest --with-pix-devtools
```

이 옵션이 추가로 설치하는 것:

- `~/.local/bin/chrome`
- `~/.local/bin/tauri-pix`
- `~/.config/powershell/tauri-dev.ps1`
- `mcp_servers.tauri-devtools`
- `chrome-devtools` 활성화
- Pix DevTools용 AGENTS 안내

의도는 이겁니다.

- `chrome`를 실행하면 `127.0.0.1:9333`용 Chrome remote debugging target이 뜸
- `tauri-pix`를 실행하면 Pix Tauri app이 `127.0.0.1:9334`로 뜸
- `/test`가 필요할 때 `chrome-devtools`, `tauri-devtools`를 자연스럽게 붙일 수 있음

전제:

- WSL2 + Windows 조합
- `powershell.exe` 접근 가능
- mirrored networking 사용
- Pix 저장소가 기본 경로 `~/ws/pix`에 있거나 `PIX_PROJECT_DIR`로 override 가능

중요:

- 이 옵션은 Pix 팀용 WSL add-on입니다.
- 개인 chezmoi 전체를 공유하는 대신, 팀에 필요한 portable subset만 떼어낸 표면입니다.
- 이후 업데이트 때도 기존 `chrome` / `tauri-pix` 설치 흔적을 감지해서 계속 유지합니다.

## 왜 이걸 쓰는가

Codex를 혼자 잠깐 쓰는 것과, 팀에서 계속 굴리는 것은 다릅니다.

보통 여기서 갈립니다.

- 사람마다 스킬과 규칙이 달라서 결과물이 들쭉날쭉함
- 기존 셋업이 있는 사람은 설치기가 무서워서 통일이 안 됨
- macOS, Intel Mac, Linux, WSL, Windows가 섞이면 설명 비용이 커짐
- 코드 리뷰용 도구나 MCP 기본값이 사람마다 달라짐

`dgk-gpt`는 이걸 줄이는 데 집중합니다.

- 공통 스킬 세트
- 공통 AGENTS 규칙
- 공통 프로필
- 공통 MCP 기본값
- 기존 셋업을 보존하는 안전한 설치

## 이미 셋업 있는 사람도 괜찮은 이유

이 설치기는 "새로 깔기 전용"이 아니라 "이미 뭔가 쓰고 있는 사람도 붙일 수 있게" 만든 쪽입니다.

보존되는 것:

- 기존 `AGENTS.md` 내용은 유지되고 managed block만 넣거나 갱신됨
- 기존 `config.toml`의 다른 섹션은 유지됨
- 이미 `~/.codex/skills`를 쓰는 사람은 그 경로를 계속 사용함
- 바꾸기 전 파일은 `~/.codex/backups/dgk-gpt/<timestamp>/` 아래로 백업됨

즉, 그냥 덮어쓰는 설치기가 아닙니다.

## 플랫폼

- Apple Silicon Mac: 일반적으로 바로 사용 가능
- Intel Mac: 일반적으로 바로 사용 가능
- Linux: 일반적으로 바로 사용 가능
- WSL: Windows 사용자에게 가장 추천되는 경로
- Native Windows: 가능은 하지만 Codex CLI와 Bash/tmux 헬퍼 경험은 WSL 쪽이 더 안정적

정리하면, 팀 기준 기본 권장은 이렇습니다.

- macOS면 그대로 설치
- Linux면 그대로 설치
- Windows면 가능하면 WSL에서 설치

## 설치 후 3분 체크리스트

1. Codex를 재시작해서 스킬과 설정을 다시 읽게 합니다.
2. Codex CLI가 아직 없다면 아래 스크립트를 실행합니다.

```bash
bash ~/.local/bin/setup-codex.sh
```

3. `/rr`, `/rrr`를 쓸 사람은 `glm-review`를 설치합니다.

```bash
npm install -g glm-review
```

4. Jina MCP를 쓸 사람은 `JINA_API_KEY`를 export하고 `[mcp_servers.jina]`를 `enabled = true`로 켭니다.
5. `cxt` 같은 tmux 기반 흐름을 쓸 사람은 `tmux`가 설치되어 있어야 합니다.
6. Pix desktop까지 Codex에서 검사할 사람은 필요할 때 `chrome`, `tauri-pix`를 먼저 띄웁니다.

## 옵션

자주 쓰는 옵션:

```bash
npx dgk-gpt@latest --dry-run
npx dgk-gpt@latest --yes
npx dgk-gpt@latest --with-pix-devtools
npx dgk-gpt@latest --skills-dir auto
npx dgk-gpt@latest --skills-dir user
npx dgk-gpt@latest --skills-dir legacy
```

## 이 패키지가 실제로 켜는 기본값

프로필:

- `dgk-fast`
- `dgk-careful`
- `cxt`

기능 플래그:

- `apply_patch_freeform`
- `apps`
- `js_repl`
- `memories`
- `multi_agent`
- `shell_tool`
- `unified_exec`
- Linux/WSL에서는 `use_linux_sandbox_bwrap`

MCP 정의:

- `context7` 기본 활성화
- `serena` 기본 활성화
- `chrome-devtools` 기본 비활성화
- `jina` 기본 비활성화

`chrome-devtools`와 `jina`는 로컬 런타임 상태나 시크릿에 의존하므로 기본은 꺼 둡니다.

예외:

- `--with-pix-devtools`를 쓰면 `chrome-devtools`와 `tauri-devtools`는 팀용 WSL Pix 디버깅 표면으로 활성화됩니다.

## 유지보수 메모

로컬 릴리즈 체크:

```bash
npm test
npm run pack:dry-run
npm run smoke:dry-run
```

버전 올린 뒤 배포:

```bash
npm publish
```

## License

MIT
