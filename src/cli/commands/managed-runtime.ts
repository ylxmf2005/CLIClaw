import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { getDefaultConfig } from "../../daemon/daemon.js";
import { getSettingsPath } from "../../shared/settings-io.js";

export type ManagedDaemonAction = "start" | "stop" | "status";
type DeploymentMode = "pm2";

interface DeploymentConfig {
  mode: DeploymentMode;
  outputDir: string;
}

interface RunCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  quiet?: boolean;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function quoteForCmd(value: string): string {
  return /[\s"]/u.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

function runCommand(command: string, args: string[], options: RunCommandOptions = {}): string {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });

  const stdout = (result.stdout ?? "").trim();
  const stderr = (result.stderr ?? "").trim();

  if (!options.quiet) {
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
  }

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status}${
        stderr ? `: ${stderr}` : ""
      }`
    );
  }

  return stdout;
}

function readDeploymentConfig(): DeploymentConfig | null {
  const daemonConfig = getDefaultConfig();
  const settingsPath = getSettingsPath(daemonConfig.dataDir);
  if (!fs.existsSync(settingsPath)) return null;

  const rawText = fs.readFileSync(settingsPath, "utf8");
  let rawJson: unknown;
  try {
    rawJson = JSON.parse(rawText);
  } catch {
    throw new Error(`Invalid settings JSON at ${settingsPath}`);
  }

  if (!isObject(rawJson)) return null;
  const runtimeRaw = rawJson.runtime;
  if (!isObject(runtimeRaw)) return null;
  const deploymentRaw = runtimeRaw.deployment;
  if (deploymentRaw === undefined || deploymentRaw === null) return null;
  if (!isObject(deploymentRaw)) {
    throw new Error("Invalid settings.runtime.deployment: expected an object");
  }

  const mode = typeof deploymentRaw.mode === "string" ? deploymentRaw.mode.trim().toLowerCase() : "";
  if (mode !== "pm2") {
    throw new Error("Invalid settings.runtime.deployment.mode: expected 'pm2'");
  }

  const outputDirRaw =
    typeof deploymentRaw["output-dir"] === "string"
      ? deploymentRaw["output-dir"]
      : typeof deploymentRaw.outputDir === "string"
        ? deploymentRaw.outputDir
        : "";
  const outputDir = outputDirRaw.trim();
  if (!outputDir) {
    throw new Error("Invalid settings.runtime.deployment.output-dir: expected a non-empty path");
  }

  return {
    mode,
    outputDir: path.resolve(outputDir),
  };
}

function shouldBypassManagedRuntime(): boolean {
  const explicit = (process.env.CLICLAW_MANAGED_RUNTIME ?? "").trim().toLowerCase();
  if (explicit === "1" || explicit === "true" || explicit === "force") {
    return false;
  }
  if (explicit === "0" || explicit === "false" || explicit === "off") {
    return true;
  }

  if ((process.env.IS_SANDBOX ?? "").trim() === "1") {
    return true;
  }

  return false;
}

function resolvePm2Command(): string {
  if (process.platform !== "win32") return "pm2";

  const candidates = [
    process.env.PM2_BIN,
    process.env.NVM_SYMLINK ? path.join(process.env.NVM_SYMLINK, "pm2.cmd") : undefined,
    "C:\\nvm4w\\nodejs\\pm2.cmd",
    "pm2.cmd",
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (!candidate.includes("\\") && !candidate.includes("/")) {
      return candidate;
    }
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return "pm2.cmd";
}

const PM2_COMMAND = resolvePm2Command();

function runPm2Command(args: string[], options: RunCommandOptions = {}): string {
  if (process.platform !== "win32") {
    return runCommand(PM2_COMMAND, args, options);
  }

  const cmdline = [quoteForCmd(PM2_COMMAND), ...args.map(quoteForCmd)].join(" ");
  return runCommand("cmd.exe", ["/d", "/s", "/c", cmdline], options);
}

function pm2ProcessExists(name: string, env: NodeJS.ProcessEnv): boolean {
  const result =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/d", "/s", "/c", `${quoteForCmd(PM2_COMMAND)} describe ${quoteForCmd(name)}`], {
          env,
          stdio: ["ignore", "pipe", "pipe"],
          encoding: "utf8",
        })
      : spawnSync(PM2_COMMAND, ["describe", name], {
          env,
          stdio: ["ignore", "pipe", "pipe"],
          encoding: "utf8",
        });
  return result.status === 0;
}

function runPm2(action: ManagedDaemonAction, outputDir: string): void {
  const ecosystemPath = path.join(outputDir, "ecosystem.config.cjs");
  const daemonConfig = getDefaultConfig();
  const cliclawDir = (process.env.CLICLAW_DIR ?? "").trim() || daemonConfig.dataDir;
  const pm2Env: NodeJS.ProcessEnv = {
    ...process.env,
    CLICLAW_DIR: cliclawDir,
    PM2_HOME: (process.env.PM2_HOME ?? "").trim() || path.join(cliclawDir, ".pm2"),
  };

  if (action === "status") {
    runPm2Command(["describe", "cliclaw-daemon"], { env: pm2Env });
    return;
  }

  if (action === "stop") {
    if (!pm2ProcessExists("cliclaw-daemon", pm2Env)) {
      console.log("cliclaw-daemon is already stopped.");
      return;
    }
    runPm2Command(["stop", "cliclaw-daemon"], { env: pm2Env });
    return;
  }

  if (!fs.existsSync(ecosystemPath)) {
    throw new Error(`ecosystem.config.cjs not found at ${ecosystemPath}. Run 'cliclaw setup' maintenance first.`);
  }

  runPm2Command(["startOrReload", ecosystemPath, "--only", "cliclaw-daemon", "--update-env"], {
    env: pm2Env,
  });
}

export function runManagedDaemonAction(action: ManagedDaemonAction): { handled: boolean; mode?: DeploymentMode } {
  const deployment = readDeploymentConfig();
  if (!deployment) return { handled: false };
  if (shouldBypassManagedRuntime()) {
    return { handled: false };
  }

  runPm2(action, deployment.outputDir);

  if (action !== "status") {
    console.log(`Managed daemon action '${action}' applied via ${deployment.mode}.`);
  }

  return { handled: true, mode: deployment.mode };
}
