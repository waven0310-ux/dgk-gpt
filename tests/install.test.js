import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function runNode(scriptPath, args = [], options = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...options.env,
    },
    input: options.input,
  });
}

test("cli help prints usage", () => {
  const result = runNode(path.join(repoRoot, "bin", "dgk-gpt.js"), ["--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /--skills-dir <mode>/);
});

test("installer defaults workflow skills to ~/.agents/skills for fresh installs", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "dgk-gpt-home-"));
  const result = runNode(path.join(repoRoot, "bin", "dgk-gpt.js"), ["--yes"], {
    env: { HOME: homeDir },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(homeDir, ".agents", "skills", "fd", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(homeDir, ".agents", "skills", "test", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(homeDir, ".agents", "skills", "rr", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(homeDir, ".codex", "scripts", "codex-tmux.sh")));
  assert.ok(fs.existsSync(path.join(homeDir, ".local", "bin", "setup-codex.sh")));
});

test("installer keeps legacy ~/.codex/skills workflow roots when already in use", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "dgk-gpt-legacy-"));
  const legacySkillDir = path.join(homeDir, ".codex", "skills", "fd");
  fs.mkdirSync(legacySkillDir, { recursive: true });
  fs.writeFileSync(path.join(legacySkillDir, "SKILL.md"), "legacy placeholder\n");

  const result = runNode(path.join(repoRoot, "bin", "dgk-gpt.js"), ["--yes"], {
    env: { HOME: homeDir },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    fs.readFileSync(path.join(homeDir, ".codex", "skills", "fd", "SKILL.md"), "utf8"),
    /Frontend design mode/,
  );
  assert.ok(fs.existsSync(path.join(homeDir, ".agents", "skills", "rr", "SKILL.md")));
});

test("installer treats any populated legacy skill root as in-use", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "dgk-gpt-legacy-custom-"));
  const customSkillDir = path.join(homeDir, ".codex", "skills", "custom-skill");
  fs.mkdirSync(customSkillDir, { recursive: true });
  fs.writeFileSync(path.join(customSkillDir, "SKILL.md"), "custom\n");

  const result = runNode(path.join(repoRoot, "bin", "dgk-gpt.js"), ["--yes"], {
    env: { HOME: homeDir },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(homeDir, ".codex", "skills", "fd", "SKILL.md")));
  assert.ok(!fs.existsSync(path.join(homeDir, ".agents", "skills", "fd", "SKILL.md")));
});

test("installer merges AGENTS.md and config.toml without dropping user settings", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "dgk-gpt-merge-"));
  const codexDir = path.join(homeDir, ".codex");
  fs.mkdirSync(codexDir, { recursive: true });

  fs.writeFileSync(
    path.join(codexDir, "AGENTS.md"),
    "# Existing instructions\n\n- Keep this line.\n",
  );

  fs.writeFileSync(
    path.join(codexDir, "config.toml"),
    [
      'model = "gpt-5.4"',
      "",
      "[features]",
      "undo = false",
      "",
      "[mcp_servers.custom-docs]",
      'command = "npx"',
      'args = ["-y", "custom-docs"]',
      "",
    ].join("\n"),
  );

  const result = runNode(path.join(repoRoot, "bin", "dgk-gpt.js"), ["--yes"], {
    env: { HOME: homeDir },
  });

  assert.equal(result.status, 0, result.stderr);

  const agentsContent = fs.readFileSync(path.join(codexDir, "AGENTS.md"), "utf8");
  assert.match(agentsContent, /Keep this line/);
  assert.match(agentsContent, /dgk-gpt:begin/);
  assert.match(agentsContent, /Think before acting/);

  const configContent = fs.readFileSync(path.join(codexDir, "config.toml"), "utf8");
  assert.match(configContent, /model = "gpt-5\.4"/);
  assert.match(configContent, /undo = false/);
  assert.match(configContent, /\[profiles\.cxt\]/);
  assert.match(configContent, /\[mcp_servers\.context7\]/);
  assert.match(configContent, /\[mcp_servers\.custom-docs\]/);
  assert.match(configContent, /js_repl = true/);
});

test("installer merges tables with inline comments instead of duplicating them", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "dgk-gpt-commented-"));
  const codexDir = path.join(homeDir, ".codex");
  fs.mkdirSync(codexDir, { recursive: true });

  fs.writeFileSync(
    path.join(codexDir, "config.toml"),
    [
      "[features] # keep comment",
      "undo = false",
      "",
      "[mcp_servers.context7] # existing note",
      'command = "npx"',
      'args = ["-y", "old-context7"]',
      "",
    ].join("\n"),
  );

  const result = runNode(path.join(repoRoot, "bin", "dgk-gpt.js"), ["--yes"], {
    env: { HOME: homeDir },
  });

  assert.equal(result.status, 0, result.stderr);

  const configContent = fs.readFileSync(path.join(codexDir, "config.toml"), "utf8");
  assert.equal((configContent.match(/\[features\]/g) ?? []).length, 1);
  assert.equal((configContent.match(/\[mcp_servers\.context7\]/g) ?? []).length, 1);
  assert.match(configContent, /args = \["-y", "@upstash\/context7-mcp@latest"\]/);
});

test("installer reports the correct backup path when updating managed files", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "dgk-gpt-backup-"));
  const codexDir = path.join(homeDir, ".codex");
  fs.mkdirSync(codexDir, { recursive: true });
  fs.writeFileSync(path.join(codexDir, "AGENTS.md"), "# Existing instructions\n");

  const result = runNode(path.join(repoRoot, "bin", "dgk-gpt.js"), ["--yes"], {
    env: { HOME: homeDir },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /백업 위치: ~\/\.codex\/backups\/dgk-gpt\//);
});

test("installer removes stale files from managed skill directories on update", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "dgk-gpt-stale-skill-"));
  const skillDir = path.join(homeDir, ".agents", "skills", "fd");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), "old\n");
  fs.writeFileSync(path.join(skillDir, "EXTRA.txt"), "stale\n");

  const result = runNode(path.join(repoRoot, "bin", "dgk-gpt.js"), ["--yes", "--skills-dir", "user"], {
    env: { HOME: homeDir },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.ok(!fs.existsSync(path.join(skillDir, "EXTRA.txt")));
});

test("installer removes deprecated browser skills and replaces them with test", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "dgk-gpt-deprecated-skill-"));
  const userSkillsDir = path.join(homeDir, ".agents", "skills");
  fs.mkdirSync(path.join(userSkillsDir, "bt"), { recursive: true });
  fs.mkdirSync(path.join(userSkillsDir, "playwright-interactive"), { recursive: true });
  fs.writeFileSync(path.join(userSkillsDir, "bt", "SKILL.md"), "old bt\n");
  fs.writeFileSync(path.join(userSkillsDir, "playwright-interactive", "SKILL.md"), "old playwright\n");

  const result = runNode(path.join(repoRoot, "bin", "dgk-gpt.js"), ["--yes", "--skills-dir", "user"], {
    env: { HOME: homeDir },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.ok(!fs.existsSync(path.join(userSkillsDir, "bt")));
  assert.ok(!fs.existsSync(path.join(userSkillsDir, "playwright-interactive")));
  assert.ok(fs.existsSync(path.join(userSkillsDir, "test", "SKILL.md")));
});

test("cxt helper fails clearly when tmux is unavailable", () => {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "dgk-gpt-bin-"));
  const zshPath = path.join(binDir, "zsh");
  fs.writeFileSync(
    zshPath,
    "#!/bin/bash\nexec /bin/bash \"$@\"\n",
  );
  fs.chmodSync(zshPath, 0o755);

  const result = spawnSync("/bin/bash", [path.join(repoRoot, "assets", "codex-scripts", "codex-tmux.sh")], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      HOME: fs.mkdtempSync(path.join(os.tmpdir(), "dgk-gpt-home-")),
      PATH: binDir,
      SHELL: path.join(binDir, "zsh"),
    },
  });

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /tmux is required/);
});
