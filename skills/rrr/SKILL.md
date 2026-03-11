---
name: rrr
description: "GLM-5 코드 리뷰 (유료). /rr의 상위 버전 — GLM-5 744B 모델로 더 깊은 리뷰. /rrr 또는 'GLM-5 리뷰' 요청 시 사용."
allowed-tools: [Bash, Read, Edit, Glob, Grep]
argument-hint: "review mode or custom instructions (예: 'pr', 'staged', '보안 집중')"
---

# /rrr - GLM-5 Code Review

GLM-5 (744B) 모델로 현재 변경사항을 깊이 있게 코드 리뷰한다.
`/rr` (glm-4.7-flash, 무료)의 상위 버전.

## 사용법

```
/rrr                   # GLM-5 리뷰 (staged + unstaged 변경사항)
/rrr staged            # staged 변경사항만
/rrr pr                # PR diff 리뷰
/rrr 보안 집중          # 커스텀 인스트럭션 추가
```

---

## 실행 방법

`glm-review --model glm-5` CLI를 **반드시 `run_in_background=true` + `dangerouslyDisableSandbox=true`** 로 실행한다.

### 1. 세션 컨텍스트 감지 + diff 생성 (리뷰 실행 전 필수)

멀티 세션 환경(동시 여러 Claude Code가 main에서 커밋/푸시)에서도 정확히 이번 세션의 변경만 리뷰해야 한다.

**우선순위** (위에서부터 시도):

**케이스 A: 이미 커밋됨** (가장 흔함) → `--mode commit --ref` 사용
```bash
# 가장 간단하고 정확. 커밋 해시만 알면 됨.
glm-review --model glm-5 --mode commit --ref <COMMIT_HASH>
```

**케이스 B: 이미 커밋됨 + 특정 파일만** → `--mode commit --ref --files` 사용
```bash
glm-review --model glm-5 --mode commit --ref <COMMIT_HASH> --files src/a.ts src/b.rs
```

**케이스 C: 이미 커밋됨 + `--diff-file`** (커밋이 여러 개이거나 cherry-pick 필요 시)
```bash
GIT_ROOT=$(git rev-parse --show-toplevel)
cd "$GIT_ROOT" && git show <COMMIT_HASH> -- <file1> <file2> ... > /tmp/glm-review-diff.patch
glm-review --model glm-5 --diff-file /tmp/glm-review-diff.patch
```

**케이스 D: 미커밋 (uncommitted 상태)** → 기본 모드 또는 `--diff-file`
```bash
# 단독 세션이면 기본 모드
glm-review --model glm-5

# 멀티 세션이면 특정 파일만 diff 생성
GIT_ROOT=$(git rev-parse --show-toplevel)
cd "$GIT_ROOT" && git diff HEAD -- <file1> <file2> ... > /tmp/glm-review-diff.patch
glm-review --model glm-5 --diff-file /tmp/glm-review-diff.patch
```

diff가 비어있으면 → "리뷰할 변경사항 없음" 안내 후 종료

### 2. 사전 확인 (선택)

헬스 체크로 API 연결 확인:

```bash
glm-review --model glm-5 --health
```

### 3. 리뷰 실행

```bash
# ★ 최우선: 커밋된 변경사항 리뷰 (가장 간단, 가장 정확)
glm-review --model glm-5 --mode commit --ref <COMMIT_HASH>

# diff 파일로 리뷰 (여러 커밋 합산 등)
glm-review --model glm-5 --diff-file /tmp/glm-review-diff.patch

# 기본 리뷰 (uncommitted 변경사항, 단독 세션일 때)
glm-review --model glm-5

# 모드 지정
glm-review --model glm-5 --mode staged
glm-review --model glm-5 --mode pr

# 커스텀 인스트럭션 추가
glm-review --model glm-5 --mode commit --ref abc1234 "보안 취약점 집중 검토"
```

**실행 우선순위** (자동 결정):
1. 커밋됨 → `--mode commit --ref <hash>` (가장 간단하고 정확)
2. 커밋됨 + 복수 커밋/특정 파일 → `--diff-file` (git show로 diff 생성 후 전달)
3. 미커밋 + 멀티 세션 → `--diff-file` (git diff HEAD로 생성 후 전달)
4. 단독 세션 → 기본 모드 (`glm-review --model glm-5` 그대로)

**실행 파라미터 매핑** (사용자 인자 → CLI 플래그):
- `staged` → `--mode staged`
- `pr` → `--mode pr`
- 그 외 텍스트 → positional 인자로 전달 (따옴표로 감싸기)
- 빠른 리뷰 원할 시 → `--no-thinking` 추가 (thinking mode 비활성화, 속도 향상)
- **모델 고정**: 항상 `--model glm-5` 포함

### 4. 백그라운드 실행 패턴 (필수)

```
Bash tool 호출:
  command: "glm-review --model glm-5 [args]"
  run_in_background: true
  dangerouslyDisableSandbox: true
```

### 5. 실행 후 즉시 턴 종료

백그라운드 실행 직후 사용자에게 안내하고 **즉시 턴을 종료**한다:

> "GLM-5 리뷰가 백그라운드에서 진행 중입니다. 완료되면 알림을 통해 결과를 전달합니다."

자동 완료 알림이 오면 **검증 + 수정 단계**를 진행한다.

### 6. 검증 + 수정 (완료 알림 후 필수)

/rr과 동일한 검증 + 수정 프로세스를 따른다:

1. **오탐 필터링**: 지적한 각 이슈를 실제 코드(Read)와 대조하여 검증
2. **유효 이슈 정리**: 검증된 이슈만 사용자에게 Severity별로 보고
3. **수정 실행**: Critical/Warning 이슈는 사용자 확인 후 직접 Edit으로 수정
4. **결과 보고**: 수정 완료 후 최종 요약 제시

---

## 버전

1.2.0
