import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");

const colors = {
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  reset: "\x1b[0m",
  yellow: "\x1b[33m",
};

const workflowSkillNames = [
  "cp",
  "fd",
  "ralph",
  "re",
  "test",
];

const deprecatedWorkflowSkillNames = [
  "bt",
  "playwright-interactive",
];

const officialSkillNames = [
  "rr",
  "rrr",
];

const managedAgentsStart = "<!-- dgk-gpt:begin -->";
const managedAgentsEnd = "<!-- dgk-gpt:end -->";

function info(message) {
  console.log(`${colors.blue}[dgk-gpt]${colors.reset} ${message}`);
}

function success(message) {
  console.log(`${colors.green}[dgk-gpt]${colors.reset} ${message}`);
}

function warn(message) {
  console.log(`${colors.yellow}[dgk-gpt]${colors.reset} ${message}`);
}

function dim(message) {
  console.log(`${colors.cyan}[dgk-gpt]${colors.reset} ${message}`);
}

function printUsage() {
  console.log(`
Usage:
  npx dgk-gpt [--yes] [--dry-run] [--skills-dir auto|user|legacy]

Options:
  --yes                 Skip the confirmation prompt.
  --dry-run             Show what would change without writing files.
  --skills-dir <mode>   auto (default), user (~/.agents/skills), legacy (~/.codex/skills)
  --help, -h            Show this help text.
`.trim());
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    skipPrompt: false,
    skillsDirMode: "auto",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--yes") {
      options.skipPrompt = true;
      continue;
    }
    if (value === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (value === "--skills-dir") {
      const nextValue = argv[index + 1];
      if (!nextValue || !["auto", "user", "legacy"].includes(nextValue)) {
        throw new Error("--skills-dir expects one of: auto, user, legacy");
      }
      options.skillsDirMode = nextValue;
      index += 1;
      continue;
    }
    if (value === "--help" || value === "-h") {
      printUsage();
      process.exit(0);
    }
    throw new Error(`unknown option: ${value}`);
  }

  return options;
}

function detectRuntime() {
  const platform = process.platform;
  const osName =
    platform === "darwin" ? "macos" :
    platform === "linux" ? "linux" :
    platform === "win32" ? "windows" :
    platform;
  return {
    isWsl: platform === "linux" && Boolean(process.env.WSL_DISTRO_NAME),
    osName,
    platform,
  };
}

function ensureDir(targetPath) {
  mkdirSync(targetPath, { recursive: true });
}

function normalizeNewlines(text) {
  return text.replace(/\r\n/g, "\n");
}

function readTextFileIfExists(targetPath) {
  if (!existsSync(targetPath)) {
    return null;
  }
  return normalizeNewlines(readFileSync(targetPath, "utf8"));
}

function hashFile(targetPath) {
  const hash = createHash("sha256");
  hash.update(readFileSync(targetPath));
  return hash.digest("hex");
}

function listRelativeFiles(rootPath) {
  const relativeFiles = [];

  function walk(currentPath) {
    const entries = readdirSync(currentPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      relativeFiles.push(path.relative(rootPath, absolutePath));
    }
  }

  walk(rootPath);
  return relativeFiles;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function directoriesDiffer(sourcePath, targetPath) {
  if (!existsSync(targetPath)) {
    return true;
  }

  const sourceStat = statSync(sourcePath);
  const targetStat = statSync(targetPath);
  if (!sourceStat.isDirectory() || !targetStat.isDirectory()) {
    return true;
  }

  const sourceFiles = listRelativeFiles(sourcePath);
  const targetFiles = listRelativeFiles(targetPath);
  if (JSON.stringify(sourceFiles) !== JSON.stringify(targetFiles)) {
    return true;
  }

  for (const relativeFile of sourceFiles) {
    const sourceFile = path.join(sourcePath, relativeFile);
    const targetFile = path.join(targetPath, relativeFile);
    if (hashFile(sourceFile) !== hashFile(targetFile)) {
      return true;
    }
  }

  return false;
}

function copyDirectory(sourcePath, targetPath) {
  rmSync(targetPath, { force: true, recursive: true });
  cpSync(sourcePath, targetPath, { force: true, recursive: true });
}

function relativeToHome(homeDir, targetPath) {
  if (targetPath.startsWith(homeDir)) {
    return `~/${path.relative(homeDir, targetPath)}`;
  }
  return targetPath;
}

function timestampStamp() {
  return new Date().toISOString().replaceAll(":", "-");
}

function backupPathFor(homeDir, backupDir, targetPath) {
  const relativePath = targetPath.startsWith(homeDir)
    ? path.relative(homeDir, targetPath)
    : path.join("__external__", path.basename(targetPath));
  return path.join(backupDir, relativePath);
}

function backupTarget(homeDir, backupDir, targetPath) {
  if (!existsSync(targetPath)) {
    return null;
  }
  const backupPath = backupPathFor(homeDir, backupDir, targetPath);
  ensureDir(path.dirname(backupPath));
  cpSync(targetPath, backupPath, { force: true, recursive: true });
  return backupPath;
}

function actionForDirectory(sourcePath, targetPath) {
  if (!existsSync(targetPath)) {
    return "install";
  }
  return directoriesDiffer(sourcePath, targetPath) ? "update" : "skip";
}

function actionForFile(sourcePath, targetPath) {
  if (!existsSync(targetPath)) {
    return "install";
  }
  return hashFile(sourcePath) === hashFile(targetPath) ? "skip" : "update";
}

function actionForRemoval(targetPath) {
  return existsSync(targetPath) ? "remove" : "skip";
}

function resolveLegacyAwareSkillsRoot(homeDir, mode) {
  const userSkillsDir = path.join(homeDir, ".agents", "skills");
  const legacySkillsDir = path.join(homeDir, ".codex", "skills");

  if (mode === "user") {
    return userSkillsDir;
  }
  if (mode === "legacy") {
    return legacySkillsDir;
  }

  let legacySignal = false;
  if (existsSync(legacySkillsDir)) {
    const entries = readdirSync(legacySkillsDir, { withFileTypes: true });
    legacySignal = entries.some((entry) => {
      if (entry.name.startsWith(".")) {
        return false;
      }
      if (entry.isDirectory()) {
        return existsSync(path.join(legacySkillsDir, entry.name, "SKILL.md"));
      }
      return true;
    });
  }
  return legacySignal ? legacySkillsDir : userSkillsDir;
}

function buildFeatureMap(runtime, existingEntries) {
  const merged = {
    ...existingEntries,
    apply_patch_freeform: "true",
    apps: "true",
    js_repl: "true",
    memories: "true",
    multi_agent: "true",
    shell_tool: "true",
    unified_exec: "true",
  };

  if (runtime.platform === "linux") {
    merged.use_linux_sandbox_bwrap = "true";
  }

  return merged;
}

function tableRange(content, header) {
  const lines = normalizeNewlines(content).split("\n");
  const headerPattern = new RegExp(`^\\s*\\[${escapeRegExp(header)}\\](?:\\s+#.*)?\\s*$`);
  const start = lines.findIndex((line) => headerPattern.test(line));
  if (start === -1) {
    return null;
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*\[\[?.+\]\]?\s*$/.test(lines[index])) {
      end = index;
      break;
    }
  }

  return { end, lines, start };
}

function readTableEntries(content, header) {
  const range = tableRange(content, header);
  if (!range) {
    return [];
  }
  return range.lines.slice(range.start + 1, range.end);
}

function upsertTable(content, header, bodyLines) {
  const normalized = normalizeNewlines(content);
  const range = tableRange(normalized, header);
  const block = [`[${header}]`, ...bodyLines, ""];

  if (!range) {
    if (!normalized.trim()) {
      return `${block.join("\n")}\n`;
    }
    return `${normalized.replace(/\s*$/, "")}\n\n${block.join("\n")}\n`;
  }

  const nextLines = [
    ...range.lines.slice(0, range.start),
    ...block,
    ...range.lines.slice(range.end),
  ];
  return `${nextLines.join("\n").replace(/\s+$/, "")}\n`;
}

function parseTableKeyValues(lines) {
  const entries = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!match) {
      continue;
    }
    entries[match[1]] = match[2];
  }
  return entries;
}

function buildManagedConfig(runtime) {
  const profiles = new Map([
    ["profiles.dgk-fast", [
      'approval_policy = "never"',
      'sandbox_mode = "workspace-write"',
      'model_reasoning_effort = "low"',
      'model_verbosity = "low"',
    ]],
    ["profiles.dgk-careful", [
      'approval_policy = "untrusted"',
      'sandbox_mode = "read-only"',
      'personality = "pragmatic"',
      'web_search = "live"',
      'model_reasoning_effort = "high"',
      'model_verbosity = "high"',
    ]],
    ["profiles.cxt", [
      'approval_policy = "on-request"',
      'sandbox_mode = "danger-full-access"',
      'personality = "pragmatic"',
      'web_search = "live"',
    ]],
  ]);

  const mcpServers = new Map([
    ["mcp_servers.context7", [
      'command = "npx"',
      'args = ["-y", "@upstash/context7-mcp@latest"]',
      "enabled = true",
    ]],
    ["mcp_servers.serena", [
      'command = "uvx"',
      'args = ["--from", "git+https://github.com/oraios/serena", "serena", "start-mcp-server", "--context", "codex"]',
      "enabled = true",
      "startup_timeout_sec = 20",
      "tool_timeout_sec = 120",
    ]],
    ["mcp_servers.chrome-devtools", [
      'command = "npx"',
      'args = ["-y", "chrome-devtools-mcp@latest", "--browser-url=http://127.0.0.1:9333"]',
      "enabled = false",
    ]],
    ["mcp_servers.jina", [
      'url = "https://mcp.jina.ai/v1"',
      'bearer_token_env_var = "JINA_API_KEY"',
      "enabled = false",
    ]],
  ]);

  return { mcpServers, profiles };
}

function mergeConfig(runtime, existingContent) {
  let nextContent = existingContent ?? "";
  if (!nextContent.trim()) {
    nextContent = "# Managed in part by dgk-gpt. Existing custom sections are preserved.\n";
  }

  const { mcpServers, profiles } = buildManagedConfig(runtime);
  const existingFeatureEntries = parseTableKeyValues(readTableEntries(nextContent, "features"));
  const mergedFeatures = buildFeatureMap(runtime, existingFeatureEntries);
  const featureLines = Object.keys(mergedFeatures)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => `${key} = ${mergedFeatures[key]}`);
  nextContent = upsertTable(nextContent, "features", featureLines);

  for (const [header, bodyLines] of profiles) {
    nextContent = upsertTable(nextContent, header, bodyLines);
  }

  for (const [header, bodyLines] of mcpServers) {
    nextContent = upsertTable(nextContent, header, bodyLines);
  }

  return `${normalizeNewlines(nextContent).replace(/\s+$/, "")}\n`;
}

function mergeAgents(existingContent, managedContent) {
  const managedBlock = `${managedAgentsStart}\n${managedContent.trim()}\n${managedAgentsEnd}\n`;
  if (!existingContent || !existingContent.trim()) {
    return managedBlock;
  }

  const normalized = normalizeNewlines(existingContent);
  const pattern = new RegExp(
    `${managedAgentsStart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${managedAgentsEnd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n?`,
    "m",
  );

  if (pattern.test(normalized)) {
    return `${normalized.replace(pattern, managedBlock).replace(/\s+$/, "")}\n`;
  }

  return `${normalized.replace(/\s+$/, "")}\n\n${managedBlock}`;
}

function collectPlans(runtime, options, homeDir) {
  const codexDir = path.join(homeDir, ".codex");
  const agentsDir = path.join(homeDir, ".agents");
  const configPath = path.join(codexDir, "config.toml");
  const agentsPath = path.join(codexDir, "AGENTS.md");
  const codexScriptsDir = path.join(codexDir, "scripts");
  const localBinDir = path.join(homeDir, ".local", "bin");
  const legacyAwareSkillsRoot = resolveLegacyAwareSkillsRoot(homeDir, options.skillsDirMode);
  const officialSkillsRoot = path.join(agentsDir, "skills");

  const skills = [];
  for (const skillName of workflowSkillNames) {
    const source = path.join(packageRoot, "skills", skillName);
    const target = path.join(legacyAwareSkillsRoot, skillName);
    skills.push({
      action: actionForDirectory(source, target),
      group: "workflow",
      name: skillName,
      source,
      target,
    });
  }

  const deprecatedSkills = [];
  for (const skillName of deprecatedWorkflowSkillNames) {
    deprecatedSkills.push({
      action: actionForRemoval(path.join(legacyAwareSkillsRoot, skillName)),
      name: skillName,
      target: path.join(legacyAwareSkillsRoot, skillName),
    });
  }

  for (const skillName of officialSkillNames) {
    const source = path.join(packageRoot, "skills", skillName);
    const target = path.join(officialSkillsRoot, skillName);
    skills.push({
      action: actionForDirectory(source, target),
      group: "review",
      name: skillName,
      source,
      target,
    });
  }

  const scripts = [
    {
      action: actionForFile(
        path.join(packageRoot, "assets", "codex-scripts", "codex-tmux.sh"),
        path.join(codexScriptsDir, "codex-tmux.sh"),
      ),
      source: path.join(packageRoot, "assets", "codex-scripts", "codex-tmux.sh"),
      target: path.join(codexScriptsDir, "codex-tmux.sh"),
    },
    {
      action: actionForFile(
        path.join(packageRoot, "assets", "bin", "setup-codex.sh"),
        path.join(localBinDir, "setup-codex.sh"),
      ),
      source: path.join(packageRoot, "assets", "bin", "setup-codex.sh"),
      target: path.join(localBinDir, "setup-codex.sh"),
    },
  ];

  return {
    agentsPath,
    configPath,
    homeDir,
    legacyAwareSkillsRoot,
    officialSkillsRoot,
    paths: { agentsDir, codexDir, codexScriptsDir, localBinDir },
    runtime,
    scripts,
    skills,
    deprecatedSkills,
  };
}

function summarizeActions(items) {
  const summary = { install: 0, skip: 0, update: 0 };
  for (const item of items) {
    summary[item.action] += 1;
  }
  return summary;
}

function summarizeRemovalActions(items) {
  const summary = { remove: 0, skip: 0 };
  for (const item of items) {
    summary[item.action] += 1;
  }
  return summary;
}

function describePlan(plans) {
  const skillSummary = summarizeActions(plans.skills);
  const cleanupSummary = summarizeRemovalActions(plans.deprecatedSkills);
  const scriptSummary = summarizeActions(plans.scripts);

  console.log("");
  info(`runtime: ${plans.runtime.osName}${plans.runtime.isWsl ? " (wsl)" : ""}`);
  info(`workflow skills root: ${relativeToHome(plans.homeDir, plans.legacyAwareSkillsRoot)}`);
  info(`review skills root: ${relativeToHome(plans.homeDir, plans.officialSkillsRoot)}`);
  dim(`skills → install ${skillSummary.install}, update ${skillSummary.update}, skip ${skillSummary.skip}`);
  dim(`deprecated skills → remove ${cleanupSummary.remove}, skip ${cleanupSummary.skip}`);
  dim(`scripts → install ${scriptSummary.install}, update ${scriptSummary.update}, skip ${scriptSummary.skip}`);
  dim(`config → ${existsSync(plans.configPath) ? "merge" : "create"} (${relativeToHome(plans.homeDir, plans.configPath)})`);
  dim(`AGENTS → ${existsSync(plans.agentsPath) ? "merge" : "create"} (${relativeToHome(plans.homeDir, plans.agentsPath)})`);
}

async function shouldProceed(options) {
  if (options.skipPrompt) {
    return true;
  }

  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question("Proceed with dgk-gpt install? [y/N] ");
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function applyInstall(plans) {
  const backupDir = path.join(plans.paths.codexDir, "backups", "dgk-gpt", timestampStamp());
  const backups = [];
  let changed = false;

  console.log("");
  info("=== Skills 설치 ===");
  for (const skill of plans.skills) {
    ensureDir(path.dirname(skill.target));
    if (skill.action === "skip") {
      warn(`${skill.name}: 최신 상태 — 스킵`);
      continue;
    }
    if (skill.action === "update") {
      const backup = backupTarget(plans.homeDir, backupDir, skill.target);
      if (backup) {
        backups.push(backup);
      }
    }
    copyDirectory(skill.source, skill.target);
    success(`${skill.name}: ${skill.action === "install" ? "설치" : "업데이트"} 완료`);
    changed = true;
  }

  console.log("");
  info("=== Deprecated skills 정리 ===");
  for (const skill of plans.deprecatedSkills) {
    if (skill.action === "skip") {
      warn(`${skill.name}: 없음 — 스킵`);
      continue;
    }
    const backup = backupTarget(plans.homeDir, backupDir, skill.target);
    if (backup) {
      backups.push(backup);
    }
    rmSync(skill.target, { force: true, recursive: true });
    success(`${skill.name}: 제거 완료`);
    changed = true;
  }

  console.log("");
  info("=== Helper scripts 설치 ===");
  for (const script of plans.scripts) {
    ensureDir(path.dirname(script.target));
    if (script.action === "skip") {
      warn(`${path.basename(script.target)}: 최신 상태 — 스킵`);
      continue;
    }
    if (script.action === "update") {
      const backup = backupTarget(plans.homeDir, backupDir, script.target);
      if (backup) {
        backups.push(backup);
      }
    }
    cpSync(script.source, script.target, { force: true });
    chmodSync(script.target, 0o755);
    success(`${path.basename(script.target)}: ${script.action === "install" ? "설치" : "업데이트"} 완료`);
    changed = true;
  }

  console.log("");
  info("=== AGENTS.md 병합 ===");
  ensureDir(path.dirname(plans.agentsPath));
  const agentsTemplate = readFileSync(path.join(packageRoot, "templates", "AGENTS.md"), "utf8");
  const beforeAgents = readTextFileIfExists(plans.agentsPath);
  const nextAgents = mergeAgents(beforeAgents, agentsTemplate);
  if (beforeAgents !== nextAgents) {
    const backup = backupTarget(plans.homeDir, backupDir, plans.agentsPath);
    if (backup) {
      backups.push(backup);
    }
    writeFileSync(plans.agentsPath, nextAgents, "utf8");
    success("AGENTS.md 병합 완료");
    changed = true;
  } else {
    warn("AGENTS.md: 최신 상태 — 스킵");
  }

  console.log("");
  info("=== config.toml 병합 ===");
  ensureDir(path.dirname(plans.configPath));
  const beforeConfig = readTextFileIfExists(plans.configPath);
  const nextConfig = mergeConfig(plans.runtime, beforeConfig);
  if (beforeConfig !== nextConfig) {
    const backup = backupTarget(plans.homeDir, backupDir, plans.configPath);
    if (backup) {
      backups.push(backup);
    }
    writeFileSync(plans.configPath, nextConfig, "utf8");
    success("config.toml 병합 완료");
    changed = true;
  } else {
    warn("config.toml: 최신 상태 — 스킵");
  }

  console.log("");
  success(changed ? "설치 완료!" : "이미 최신 상태입니다.");
  if (backups.length > 0) {
    info(`백업 위치: ${relativeToHome(plans.homeDir, backupDir)}`);
  }

  console.log("");
  info("다음 단계:");
  info("  1. Codex를 재시작해서 스킬/설정 목록을 새로 읽게 하세요.");
  info("  2. Codex가 아직 없다면: bash ~/.local/bin/setup-codex.sh");
  info("  3. /rr, /rrr까지 쓰려면: npm install -g glm-review  그리고 ZAI_API_KEY 설정");
  info("  4. Jina MCP를 쓰려면 JINA_API_KEY를 export 한 뒤 ~/.codex/config.toml에서 enabled=true 로 바꾸세요.");
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const runtime = detectRuntime();
  const homeDir = os.homedir();
  const plans = collectPlans(runtime, options, homeDir);

  describePlan(plans);
  if (options.dryRun) {
    console.log("");
    info("dry-run 완료 — 파일 변경 없음");
    return;
  }

  if (!(await shouldProceed(options))) {
    warn("설치를 취소했습니다.");
    return;
  }

  applyInstall(plans);
}
