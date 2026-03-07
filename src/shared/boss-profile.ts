import * as fs from "node:fs";
import * as path from "node:path";

import { DEFAULT_BOSSES_DIRNAME } from "./defaults.js";
import { parseProfileMarkdown, serializeProfileMarkdown } from "./profile-markdown.js";
import { isValidTokenName, normalizeTokenName } from "./user-permissions.js";

const BOSS_FILENAME = "BOSS.md";
const DEFAULT_VERSION = "1";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export interface BossProfileSnapshot {
  tokenName: string;
  name: string;
  version: string;
  content: string;
  path: string;
  metadata: Record<string, string>;
}

export function getBossProfilePath(cliclawDir: string, tokenNameRaw: string): string {
  const tokenName = normalizeTokenName(tokenNameRaw);
  return path.join(cliclawDir, DEFAULT_BOSSES_DIRNAME, tokenName, BOSS_FILENAME);
}

function normalizeBossProfileFrontmatter(input: {
  tokenName: string;
  frontmatter: Record<string, string>;
  body: string;
  profilePath: string;
}): BossProfileSnapshot {
  const name = (input.frontmatter.name ?? "").trim();
  const version = (input.frontmatter.version ?? "").trim();
  if (!name) {
    throw new Error(`Missing required frontmatter 'name' in ${input.profilePath}`);
  }
  if (!version) {
    throw new Error(`Missing required frontmatter 'version' in ${input.profilePath}`);
  }

  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.frontmatter)) {
    if (key === "name" || key === "version") continue;
    metadata[key] = value;
  }

  return {
    tokenName: input.tokenName,
    name,
    version,
    content: input.body.trim(),
    path: input.profilePath,
    metadata,
  };
}

function defaultBossProfileMarkdown(defaultName: string): string {
  return serializeProfileMarkdown({
    frontmatter: {
      name: defaultName.trim() || "Boss",
      version: DEFAULT_VERSION,
    },
    body: "",
  });
}

export function ensureBossProfile(params: {
  cliclawDir: string;
  tokenName: string;
  defaultName: string;
}): { ok: true; path: string } | { ok: false; error: string } {
  try {
    const tokenName = normalizeTokenName(params.tokenName);
    if (!isValidTokenName(tokenName)) {
      return { ok: false, error: `Invalid token-name: ${params.tokenName}` };
    }
    const profilePath = getBossProfilePath(params.cliclawDir, tokenName);
    fs.mkdirSync(path.dirname(profilePath), { recursive: true });
    if (!fs.existsSync(profilePath)) {
      fs.writeFileSync(profilePath, defaultBossProfileMarkdown(params.defaultName), "utf8");
      return { ok: true, path: profilePath };
    }
    const stat = fs.statSync(profilePath);
    if (!stat.isFile()) {
      return { ok: false, error: `Expected file at ${profilePath}` };
    }
    const raw = fs.readFileSync(profilePath, "utf8");
    const parsed = parseProfileMarkdown(raw);
    if (!parsed) {
      fs.writeFileSync(profilePath, defaultBossProfileMarkdown(params.defaultName), "utf8");
      return { ok: true, path: profilePath };
    }
    normalizeBossProfileFrontmatter({
      tokenName,
      frontmatter: parsed.frontmatter,
      body: parsed.body,
      profilePath,
    });
    return { ok: true, path: profilePath };
  } catch (err) {
    return { ok: false, error: getErrorMessage(err) };
  }
}

export function readBossProfile(params: {
  cliclawDir: string;
  tokenName: string;
  defaultName: string;
}): { ok: true; profile: BossProfileSnapshot } | { ok: false; error: string } {
  try {
    const tokenName = normalizeTokenName(params.tokenName);
    if (!isValidTokenName(tokenName)) {
      return { ok: false, error: `Invalid token-name: ${params.tokenName}` };
    }
    const ensured = ensureBossProfile({
      cliclawDir: params.cliclawDir,
      tokenName,
      defaultName: params.defaultName,
    });
    if (!ensured.ok) return ensured;
    const profilePath = ensured.path;
    const raw = fs.readFileSync(profilePath, "utf8");
    const parsed = parseProfileMarkdown(raw);
    if (!parsed) {
      return { ok: false, error: `Invalid markdown frontmatter in ${profilePath}` };
    }
    return {
      ok: true,
      profile: normalizeBossProfileFrontmatter({
        tokenName,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        profilePath,
      }),
    };
  } catch (err) {
    return { ok: false, error: getErrorMessage(err) };
  }
}

export function writeBossProfile(params: {
  cliclawDir: string;
  tokenName: string;
  name: string;
  version: string;
  content: string;
  metadata?: Record<string, string>;
}): { ok: true; profile: BossProfileSnapshot } | { ok: false; error: string } {
  try {
    const tokenName = normalizeTokenName(params.tokenName);
    if (!isValidTokenName(tokenName)) {
      return { ok: false, error: `Invalid token-name: ${params.tokenName}` };
    }
    const name = params.name.trim();
    const version = params.version.trim();
    if (!name) return { ok: false, error: "Missing required frontmatter field: name" };
    if (!version) return { ok: false, error: "Missing required frontmatter field: version" };

    const profilePath = getBossProfilePath(params.cliclawDir, tokenName);
    fs.mkdirSync(path.dirname(profilePath), { recursive: true });
    const frontmatter: Record<string, string> = {
      name,
      version,
      ...(params.metadata ?? {}),
    };
    fs.writeFileSync(
      profilePath,
      serializeProfileMarkdown({
        frontmatter,
        body: params.content.trim(),
      }),
      "utf8",
    );

    return {
      ok: true,
      profile: {
        tokenName,
        name,
        version,
        content: params.content.trim(),
        path: profilePath,
        metadata: { ...(params.metadata ?? {}) },
      },
    };
  } catch (err) {
    return { ok: false, error: getErrorMessage(err) };
  }
}

export function formatBossProfilesForPrompt(profiles: BossProfileSnapshot[]): string {
  if (profiles.length === 0) return "";
  return profiles.map((profile) => {
    const header = `### ${profile.name} (${profile.tokenName})`;
    if (!profile.content) {
      return `${header}\n(empty)`;
    }
    return `${header}\n${profile.content}`;
  }).join("\n\n");
}

