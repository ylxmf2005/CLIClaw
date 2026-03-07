import * as os from "node:os";
import * as path from "node:path";

import { CLICLAW_DIR_ENV } from "./env.js";
import {
  DEFAULT_AGENTS_DIRNAME,
  DEFAULT_BOSSES_DIRNAME,
  DEFAULT_DAEMON_DIRNAME,
  DEFAULT_DB_FILENAME,
  DEFAULT_MEDIA_DIRNAME,
  DEFAULT_SOCKET_FILENAME,
  DEFAULT_PID_FILENAME,
  getDefaultCliClawDir,
} from "./defaults.js";

function expandTilde(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

function resolveRootDirFromEnvVar(envName: string): { ok: true; dir: string } | { ok: false; error: string } | null {
  const raw = (process.env[envName] ?? "").trim();
  if (!raw) return null;
  const expanded = expandTilde(raw);
  if (!path.isAbsolute(expanded)) {
    return { ok: false, error: `Invalid ${envName} (must be an absolute path or start with ~): ${raw}` };
  }
  return { ok: true, dir: expanded };
}

function resolveRootDirFromEnv(): { ok: true; dir: string } | { ok: false; error: string } {
  const modern = resolveRootDirFromEnvVar(CLICLAW_DIR_ENV);
  if (modern) return modern;
  return { ok: true, dir: getDefaultCliClawDir() };
}

export function resolveCliClawDbPath(daemonDir: string): string {
  return path.join(daemonDir, DEFAULT_DB_FILENAME);
}

export interface CliClawPaths {
  rootDir: string;
  daemonDir: string;
  agentsDir: string;
  bossesDir: string;
  mediaDir: string;
  dbPath: string;
  socketPath: string;
  pidPath: string;
}

export function getCliClawPaths(): CliClawPaths {
  const resolved = resolveRootDirFromEnv();
  if (!resolved.ok) {
    // Keep CLI output predictable: fail fast with a single-line error.
    console.error("error:", resolved.error);
    process.exit(1);
  }

  const rootDir = resolved.dir;
  const daemonDir = path.join(rootDir, DEFAULT_DAEMON_DIRNAME);

  return {
    rootDir,
    daemonDir,
    agentsDir: path.join(rootDir, DEFAULT_AGENTS_DIRNAME),
    bossesDir: path.join(rootDir, DEFAULT_BOSSES_DIRNAME),
    mediaDir: path.join(rootDir, DEFAULT_MEDIA_DIRNAME),
    dbPath: resolveCliClawDbPath(daemonDir),
    socketPath: path.join(daemonDir, DEFAULT_SOCKET_FILENAME),
    pidPath: path.join(daemonDir, DEFAULT_PID_FILENAME),
  };
}

export function getCliClawRootDir(): string {
  return getCliClawPaths().rootDir;
}
