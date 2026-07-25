import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { skillsRoot } from './paths.js';

export const STAMP_FILE = '.longrein.json';

export const RETIRED_SKILL_ALIASES: Readonly<Record<string, string>> = {
  'shape-v2': 'shape',
  'grill-v2': 'grill',
  'dev-v2': 'dev',
  'walkthrough-v2': 'walkthrough',
  'review-v2': 'review',
  'evolution-v2': 'evolution',
};

export interface Skill {
  name: string;
  dir: string;
  description: string;
}

export function parseFrontmatter(markdown: string): Record<string, string> {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out: Record<string, string> = {};
  if (!match) return out;
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

export function listSkills(): Skill[] {
  const root = skillsRoot();
  if (!fs.existsSync(root)) return [];
  const skills: Skill[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const skillMd = path.join(root, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillMd)) continue;
    const fm = parseFrontmatter(fs.readFileSync(skillMd, 'utf8'));
    skills.push({
      name: fm.name || entry.name,
      dir: path.join(root, entry.name),
      description: fm.description || '',
    });
  }
  return skills;
}

/** Stable content hash of a skill directory (stamp file excluded). */
export function hashSkillDir(dir: string): string {
  const files: string[] = [];
  const walk = (rel: string) => {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const relPath = rel ? path.join(rel, entry.name) : entry.name;
      if (entry.name === STAMP_FILE) continue;
      if (entry.isDirectory()) walk(relPath);
      else if (entry.isFile()) files.push(relPath);
    }
  };
  walk('');
  files.sort();
  const hash = crypto.createHash('sha256');
  for (const rel of files) {
    hash.update(rel);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(dir, rel)));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}
