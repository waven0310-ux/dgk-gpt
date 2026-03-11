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

test("installer defaults workflow skills to ~/.agents/skills for fresh installs", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "dgk-gpt-home-"));
  const result = runNode(path.join(repoRoot, "bin", "dgk-gpt.js"), ["--yes"], {
    env: { HOME: homeDir },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(homeDir, ".agents", "skills", "fd", "SKILL.md")));
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
