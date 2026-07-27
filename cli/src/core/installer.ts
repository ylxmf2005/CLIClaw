import fs from 'node:fs';
import path from 'node:path';
import { packageRoot, packageVersion, Target } from './paths.js';
import { hashSkillDir, RETIRED_SKILL_ALIASES, Skill, STAMP_FILE } from './skills.js';

export type SkillState =
  | 'missing'
  | 'linked' // symlink to this package's skill dir
  | 'copy-fresh' // managed copy, content matches the source
  | 'copy-stale' // managed copy, source has moved on
  | 'foreign-link' // symlink owned by something else
  | 'foreign-dir'; // real dir without our stamp — never touched without --force

export interface Inspection {
  state: SkillState;
  dest: string;
  linkTarget?: string;
  stampVersion?: string;
}

interface Stamp {
  name: string;
  version: string;
  hash: string;
  source: string;
  installedAt: string;
}

function readStamp(dir: string): Stamp | undefined {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, STAMP_FILE), 'utf8'));
  } catch {
    return undefined;
  }
}

export function inspect(target: Target, skill: Skill): Inspection {
  const dest = path.join(target.skillsDir, skill.name);
  let lst: fs.Stats;
  try {
    lst = fs.lstatSync(dest);
  } catch {
    return { state: 'missing', dest };
  }
  if (lst.isSymbolicLink()) {
    const linkTarget = fs.readlinkSync(dest);
    let resolved: string | undefined;
    try {
      resolved = fs.realpathSync(dest);
    } catch {
      resolved = undefined; // broken link
    }
    if (resolved && resolved === fs.realpathSync(skill.dir)) return { state: 'linked', dest, linkTarget };
    return { state: 'foreign-link', dest, linkTarget };
  }
  if (lst.isDirectory()) {
    const stamp = readStamp(dest);
    if (!stamp) return { state: 'foreign-dir', dest };
    const sourceHash = hashSkillDir(skill.dir);
    const fresh = stamp.hash === sourceHash && hashSkillDir(dest) === sourceHash;
    return { state: fresh ? 'copy-fresh' : 'copy-stale', dest, stampVersion: stamp.version };
  }
  return { state: 'foreign-dir', dest };
}

export interface InstallOptions {
  link: boolean;
  force: boolean;
}

export interface InstallResult {
  action: 'installed' | 'updated' | 'unchanged' | 'skipped';
  detail: string;
}

export function installSkill(target: Target, skill: Skill, opts: InstallOptions): InstallResult {
  const before = inspect(target, skill);
  const dest = before.dest;
  const wanted: SkillState = opts.link ? 'linked' : 'copy-fresh';

  if (before.state === wanted) return { action: 'unchanged', detail: opts.link ? 'already linked' : 'up to date' };

  const ours = before.state === 'linked' || before.state === 'copy-fresh' || before.state === 'copy-stale';
  if (!ours && before.state !== 'missing' && !opts.force) {
    return {
      action: 'skipped',
      detail: `${dest} exists and is not managed by longrein (use --force to replace)`,
    };
  }

  if (before.state !== 'missing') fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(target.skillsDir, { recursive: true });

  if (opts.link) {
    fs.symlinkSync(skill.dir, dest);
  } else {
    fs.cpSync(skill.dir, dest, { recursive: true });
    const stamp: Stamp = {
      name: skill.name,
      version: packageVersion(),
      hash: hashSkillDir(skill.dir),
      source: skill.dir,
      installedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(dest, STAMP_FILE), JSON.stringify(stamp, null, 2) + '\n');
  }
  const detail = opts.link ? `linked -> ${skill.dir}` : `copied v${packageVersion()}`;
  return { action: before.state === 'missing' ? 'installed' : 'updated', detail };
}

/** Remove broken symlinks that point into this package (skill renamed/removed). */
export function pruneBrokenOwnLinks(target: Target): string[] {
  const removed: string[] = [];
  if (!fs.existsSync(target.skillsDir)) return removed;
  for (const entry of fs.readdirSync(target.skillsDir)) {
    const full = path.join(target.skillsDir, entry);
    let linkTarget: string;
    try {
      linkTarget = fs.readlinkSync(full);
    } catch {
      continue;
    }
    if (!linkTarget.startsWith(packageRoot() + path.sep)) continue;
    try {
      fs.statSync(full);
    } catch {
      fs.rmSync(full);
      removed.push(entry);
    }
  }
  return removed;
}

export interface RetiredSkillAlias {
  alias: string;
  canonical: string;
  path: string;
}

/** Find retired aliases only when they still resolve to the matching current Longrein Skill. */
export function retiredOwnAliases(target: Target): RetiredSkillAlias[] {
  const found: RetiredSkillAlias[] = [];
  for (const [alias, canonical] of Object.entries(RETIRED_SKILL_ALIASES)) {
    const aliasPath = path.join(target.skillsDir, alias);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(aliasPath);
    } catch {
      continue;
    }
    if (!stat.isSymbolicLink()) continue;
    try {
      const actual = fs.realpathSync(aliasPath);
      const expected = fs.realpathSync(path.join(packageRoot(), 'skills', canonical));
      if (actual === expected) found.push({ alias, canonical, path: aliasPath });
    } catch {
      // Broken aliases are handled by pruneBrokenOwnLinks.
    }
  }
  return found;
}

export function pruneRetiredOwnAliases(target: Target): string[] {
  const removed: string[] = [];
  for (const alias of retiredOwnAliases(target)) {
    fs.rmSync(alias.path);
    removed.push(alias.alias);
  }
  return removed;
}

export interface UninstallResult {
  action: 'removed' | 'absent' | 'skipped';
  detail: string;
}

export function uninstallSkill(target: Target, skill: Skill): UninstallResult {
  const found = inspect(target, skill);
  switch (found.state) {
    case 'missing':
      return { action: 'absent', detail: 'not installed' };
    case 'linked':
    case 'copy-fresh':
    case 'copy-stale':
      fs.rmSync(found.dest, { recursive: true, force: true });
      return { action: 'removed', detail: found.dest };
    default:
      return { action: 'skipped', detail: `${found.dest} is not managed by longrein` };
  }
}
