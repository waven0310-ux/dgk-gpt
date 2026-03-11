---
name: bt
description: Browser testing wrapper for Codex. Use when the user explicitly says `/bt` or asks to reproduce, verify, regression test, visually inspect, or debug a local web app after implementation. Prefer `$playwright-interactive` for end-to-end and visual QA, and use chrome-devtools MCP only when console, network, DOM, accessibility, or performance diagnosis is needed.
---

# Bt

Use this as a thin browser-QA mode after code changes are done or nearly done. This skill should not replace Codex's normal orchestration; it should bias the agent toward browser verification.

## Default Flow

1. Identify the target app URL from the cwd, dev scripts, project docs, or the user's message.
2. Start or confirm the local dev server.
3. Build a short QA checklist from:
- the user's requested behavior
- the changed UI or flow
- the claims you expect to make in the final response
4. Prefer `$playwright-interactive` for:
- reproducing the issue
- testing the happy path and one or two edge flows
- desktop and mobile verification
- visual QA and screenshots
5. Use `chrome-devtools` only when you need diagnosis that Playwright is not ideal for:
- console errors
- network request inspection
- DOM or accessibility snapshots
- performance or Lighthouse analysis
6. If browser QA reveals a bug and fixing it is in scope, fix it and rerun the relevant browser checks.
7. Finish with a short pass/fail summary and the evidence used.

## Tool Priority

- Default to `$playwright-interactive`.
- Add `chrome-devtools` only when the problem requires diagnosis rather than pure interaction.
- Use both when necessary, but do not force both when one tool is enough.

## Good Targets

- "작업 끝났으니 /bt 해줘"
- "브라우저에서 직접 검증해줘"
- "모바일/데스크톱 둘 다 확인해줘"
- "회귀 테스트해줘"
- "화면에서 진짜 되는지 보고 마무리해줘"

## Avoid

- Do not use this for pure unit or backend tests with no browser surface.
- Do not produce a long QA report unless the user asked for one.
- Do not rerun the whole app matrix if the change was clearly scoped to one app or route.
- Do not treat browser QA as a substitute for code-level tests when those are still required.

## Finish

Return:
- target URL or app tested
- what flows were checked
- whether Playwright only was enough or DevTools was also needed
- pass/fail
- remaining issues or uncertainty
