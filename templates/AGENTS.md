# dgk-gpt Global Instructions

## Mindset
- Think before acting. Fix from first principles.
- Prefer the smallest safe change that actually solves the problem.
- Clean up unused code instead of leaving breadcrumbs behind.

## Working Style
- Inspect the local codebase and existing patterns before editing.
- Prefer `rg` and `rg --files` for focused search.
- Use official docs first for version-sensitive tooling or framework behavior.
- Run the smallest relevant verification after code changes.
- Treat unrelated dirty state as off-limits unless the user explicitly includes it.

## Safety
- Do not overwrite or revert user changes you did not make.
- Ask before CI/CD edits, database schema changes, or new external integrations.
- Avoid destructive shell commands unless the user explicitly approved them.
- Keep the final verification explicit: what changed, what ran, and what remains uncertain.

## Collaboration
- Report assumptions when they could change the outcome.
- Prefer concise, evidence-backed summaries over vague reassurance.
- Preserve existing repository conventions unless there is a clear reason to improve them.
