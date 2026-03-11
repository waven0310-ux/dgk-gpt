# dgk-gpt

`dgk-gpt` is a practical Codex CLI setup for teams that want the same working defaults without clobbering each person’s existing environment.

It installs the parts of my current Codex setup that are portable:

- workflow skills for research, finish mode, browser QA, design, and persistence
- a managed block in `~/.codex/AGENTS.md`
- safe merges into `~/.codex/config.toml`
- helper scripts such as `cxt`'s tmux launcher and a Codex install checker

It does **not** blindly overwrite your full Codex config, and it keeps a backup before updating managed files.

## Install

```bash
npx dgk-gpt@latest
```

Or install it globally:

```bash
npm install -g dgk-gpt
```

For a preview without changing files:

```bash
npx dgk-gpt@latest --dry-run
```

If you already keep custom workflow skills under the older legacy path, force that mode explicitly:

```bash
npx dgk-gpt@latest --skills-dir legacy
```

## What It Installs

### Workflow skills

These come from the current Codex setup and are installed into:

- `~/.agents/skills` on fresh installs
- `~/.codex/skills` when the installer detects you already use the legacy skill root

Included workflow skills:

- `re`
- `cp`
- `fd`
- `bt`
- `ralph`
- `playwright-interactive`

### Review skills

These are always installed into the official user skill path `~/.agents/skills`:

- `rr`
- `rrr`

They expect `glm-review` and `ZAI_API_KEY`, so `dgk-gpt` installs the skills but does not auto-install the review CLI.

### AGENTS and config

`dgk-gpt` manages:

- `~/.codex/AGENTS.md`
- `~/.codex/config.toml`

The installer preserves existing content and updates only:

- its managed AGENTS block
- the `[features]` table entries it owns
- named profiles such as `[profiles.cxt]`
- named MCP entries such as `[mcp_servers.context7]`

### Helper scripts

The installer also copies:

- `~/.codex/scripts/codex-tmux.sh`
- `~/.local/bin/setup-codex.sh`

`codex-tmux.sh` is the `cxt` launcher for tmux-heavy flows.

## Managed Defaults

`dgk-gpt` adds or updates these Codex profiles:

- `dgk-fast`
- `dgk-careful`
- `cxt`

It also enables the feature flags that the bundled skills actually need:

- `apply_patch_freeform`
- `apps`
- `js_repl`
- `memories`
- `multi_agent`
- `shell_tool`
- `unified_exec`
- `use_linux_sandbox_bwrap` on Linux/WSL

And it installs these MCP server definitions:

- `context7` enabled by default
- `serena` enabled by default
- `chrome-devtools` installed but disabled by default
- `jina` installed but disabled by default

`chrome-devtools` and `jina` are left disabled because they depend on local runtime state or secrets.

## Existing Users

This installer is designed for people who already have a Codex setup.

Behavior:

- existing AGENTS content is preserved
- existing config sections outside the managed targets are preserved
- existing workflow skills in legacy `~/.codex/skills` keep using that root
- files are backed up under `~/.codex/backups/dgk-gpt/<timestamp>/`

## Platform Notes

- macOS and Linux are straightforward with `npm i -g @openai/codex`.
- Windows support for Codex CLI is still experimental. For the best Windows experience, OpenAI recommends working in WSL.
- `cxt` is a Bash/tmux helper, so it is most useful on macOS, Linux, WSL, or Git Bash setups.

## After Install

1. Restart Codex so it reloads skills and config.
2. If Codex CLI is not installed yet, run:

```bash
bash ~/.local/bin/setup-codex.sh
```

3. If you want `/rr` and `/rrr`, install the review CLI:

```bash
npm install -g glm-review
```

4. If you want Jina MCP, export `JINA_API_KEY` and set `enabled = true` for `[mcp_servers.jina]`.

## Why This Exists

`dgk-claude` packaged my Claude Code operating model.

`dgk-gpt` is the Codex version of the same idea:

- consistent skill set
- consistent AGENTS guidance
- consistent profiles and MCP defaults
- safe installer behavior for people who already have local state

## Release Notes

Useful local release checks:

```bash
npm test
npm run pack:dry-run
npm run smoke:dry-run
```

After bumping the package version, publish the next patch with:

```bash
npm publish
```

## License

MIT
