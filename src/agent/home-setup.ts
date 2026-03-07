/**
 * Home directory setup for agents.
 *
 * Creates the agent directory with internal_space/.
 * Provider homes (codex_home/, claude_home/) are eliminated — both CLIs
 * use shared provider homes (forced defaults: ~/.claude, ~/.codex) with system
 * prompts injected via CLI flags.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { assertValidAgentName } from "../shared/validation.js";
import { getCliClawRootDir } from "../shared/cliclaw-paths.js";
import { ensureAgentInternalSpaceLayout } from "../shared/internal-space.js";

/**
 * Get the default cliclaw directory path.
 */
export function getCliClawDir(): string {
  return getCliClawRootDir();
}

/**
 * Get the agent's directory path.
 */
export function getAgentDir(agentName: string, cliclawDir?: string): string {
  assertValidAgentName(agentName);
  const baseDir = cliclawDir ?? getCliClawDir();
  return path.join(baseDir, "agents", agentName);
}

export function getAgentInternalSpaceDir(agentName: string, cliclawDir?: string): string {
  return path.join(getAgentDir(agentName, cliclawDir), "internal_space");
}

function getSharedCodexHomeDir(): string {
  const fromEnv = (process.env.CODEX_HOME ?? "").trim();
  return fromEnv.length > 0 ? fromEnv : path.join(os.homedir(), ".codex");
}

function withCodexMultiAgentEnabled(configText: string): string {
  const newline = configText.includes("\r\n") ? "\r\n" : "\n";
  const sectionHeaderPattern = /^\s*\[([^\]]+)\]\s*$/;
  const lines = configText.split(/\r?\n/);

  let featuresStart = -1;
  let featuresEnd = lines.length;
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index]?.match(sectionHeaderPattern);
    if (!match) continue;
    const sectionName = match[1]?.trim().toLowerCase();
    if (sectionName === "features") {
      featuresStart = index;
      continue;
    }
    if (featuresStart >= 0) {
      featuresEnd = index;
      break;
    }
  }

  if (featuresStart >= 0) {
    for (let index = featuresStart + 1; index < featuresEnd; index++) {
      if (/^\s*multi_agent\s*=/.test(lines[index] ?? "")) {
        return configText;
      }
    }
    lines.splice(featuresEnd, 0, "multi_agent = true");
    return `${lines.join(newline).trimEnd()}${newline}`;
  }

  const trimmed = configText.trim();
  if (trimmed.length < 1) {
    return `[features]${newline}multi_agent = true${newline}`;
  }

  return `${configText.trimEnd()}${newline}${newline}[features]${newline}multi_agent = true${newline}`;
}

function ensureSharedCodexConfigDefaults(): void {
  const codexHomeDir = getSharedCodexHomeDir();
  const codexConfigPath = path.join(codexHomeDir, "config.toml");

  try {
    fs.mkdirSync(codexHomeDir, { recursive: true });
    const current = fs.existsSync(codexConfigPath)
      ? fs.readFileSync(codexConfigPath, "utf8")
      : "";
    const next = withCodexMultiAgentEnabled(current);
    if (next !== current) {
      fs.writeFileSync(codexConfigPath, next, "utf8");
    }
  } catch {
    // Best-effort; do not fail setup on shared Codex config issues.
  }
}

/**
 * Set up the agent's home directory.
 *
 * Creates the agent directory with internal_space/.
 * No per-agent provider home directories are created.
 *
 * @param agentName - The agent's name
 * @param cliclawDir - Optional custom cliclaw directory (defaults to ~/cliclaw; override via CLICLAW_DIR)
 */
export async function setupAgentHome(
  agentName: string,
  cliclawDir?: string,
): Promise<void> {
  const baseDir = cliclawDir ?? getCliClawDir();
  const agentDir = getAgentDir(agentName, cliclawDir);

  // Create agent directory
  fs.mkdirSync(agentDir, { recursive: true });

  // Ensure agent internal space exists (best-effort).
  const ensuredSpace = ensureAgentInternalSpaceLayout({ cliclawDir: baseDir, agentName });
  if (!ensuredSpace.ok) {
    throw new Error(`Failed to initialize agent internal space: ${ensuredSpace.error}`);
  }

  ensureSharedCodexConfigDefaults();
}

/**
 * Check if an agent's home directories exist.
 */
export function agentHomeExists(agentName: string, cliclawDir?: string): boolean {
  const agentDir = getAgentDir(agentName, cliclawDir);
  return fs.existsSync(agentDir);
}

/**
 * Remove an agent's home directories.
 */
export function removeAgentHome(agentName: string, cliclawDir?: string): void {
  const agentDir = getAgentDir(agentName, cliclawDir);
  if (fs.existsSync(agentDir)) {
    fs.rmSync(agentDir, { recursive: true, force: true });
  }
}
