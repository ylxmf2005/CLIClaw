import fs from 'node:fs';
import path from 'node:path';
import { packageRoot, Target } from './paths.js';
import { Block, blockStatus, listBlocks, upsertBlocks } from './blocks.js';
import { inspect, installSkill, retiredOwnAliases } from './installer.js';
import { listSkills } from './skills.js';

/** Hub paths of retired distribution mechanisms; leftovers get pruned by --fix. */
const LEGACY_HUB_MARKERS = [
  'skills-hubs/gemba/',
  'skills-hubs/AgentCorp/',
  'skills-hubs/AgentCorp.bak/',
  'skills-hubs/SkillsForSolFable/',
];

export interface Finding {
  severity: 'error' | 'warn' | 'info';
  message: string;
  fix?: () => string;
}

export function runDoctor(activeTargets: Target[]): Finding[] {
  const findings: Finding[] = [];
  const skills = listSkills();
  const blocks: Block[] = listBlocks();

  for (const target of activeTargets) {
    // 1) Leftover symlinks from retired sync mechanisms (pre-CLI era).
    if (fs.existsSync(target.skillsDir)) {
      for (const entry of fs.readdirSync(target.skillsDir)) {
        const full = path.join(target.skillsDir, entry);
        let linkTarget: string;
        try {
          linkTarget = fs.readlinkSync(full);
        } catch {
          continue; // not a symlink
        }
        if (LEGACY_HUB_MARKERS.some((m) => linkTarget.includes(m))) {
          findings.push({
            severity: 'warn',
            message: `${target.label}: legacy skills-sync link ${entry} -> ${linkTarget}`,
            fix: () => {
              fs.rmSync(full);
              return `removed ${full}`;
            },
          });
          continue;
        }
        let broken = false;
        try {
          fs.statSync(full);
        } catch {
          broken = true;
        }
        if (broken) {
          if (linkTarget.startsWith(packageRoot() + path.sep)) {
            // Our own link whose skill was renamed or removed from the repo.
            findings.push({
              severity: 'warn',
              message: `${target.label}: broken longrein link ${entry} -> ${linkTarget}`,
              fix: () => {
                fs.rmSync(full);
                return `removed ${full}`;
              },
            });
          }
        }
      }
    }

    for (const alias of retiredOwnAliases(target)) {
      findings.push({
        severity: 'warn',
        message: `${target.label}: retired Longrein Skill alias ${alias.alias} -> ${alias.canonical}`,
        fix: () => {
          fs.rmSync(alias.path);
          return `removed ${alias.path}`;
        },
      });
    }

    // 2) Stale copies and foreign occupants of longrein skill names.
    for (const skill of skills) {
      const found = inspect(target, skill);
      if (found.state === 'copy-stale') {
        findings.push({
          severity: 'warn',
          message: `${target.label}: skill "${skill.name}" copy is stale (run \`longrein update\` or \`longrein doctor --fix\`)`,
          fix: () => {
            const result = installSkill(target, skill, { link: false, force: false });
            return `${skill.name}: ${result.detail}`;
          },
        });
      } else if (found.state === 'foreign-dir' || found.state === 'foreign-link') {
        findings.push({
          severity: 'warn',
          message: `${target.label}: "${skill.name}" exists at ${found.dest} but is not managed by longrein`,
        });
      }
    }

    // 3) Managed instruction blocks: stale content or orphaned owners.
    const { statuses, orphans } = blockStatus(target.instructionFile, blocks);
    for (const s of statuses) {
      if (s.state === 'stale') {
        findings.push({
          severity: 'warn',
          message: `${target.label}: block "${s.owner}" in ${target.instructionFile} differs from source`,
          fix: () => {
            upsertBlocks(target.instructionFile, blocks);
            return `re-synced blocks in ${target.instructionFile}`;
          },
        });
      }
    }
    for (const orphan of orphans) {
      findings.push({
        severity: 'warn',
        message: `${target.label}: orphaned longrein block "${orphan}" in ${target.instructionFile}`,
        fix: () => {
          upsertBlocks(target.instructionFile, blocks);
          return `re-synced blocks in ${target.instructionFile}`;
        },
      });
    }

    // 4) Marker integrity (manual edits that broke pairing).
    if (fs.existsSync(target.instructionFile)) {
      const text = fs.readFileSync(target.instructionFile, 'utf8');
      const begins = (text.match(/<!-- >>> LONGREIN BLOCK: /g) || []).length;
      const ends = (text.match(/<!-- <<< LONGREIN BLOCK: /g) || []).length;
      if (begins !== ends) {
        findings.push({
          severity: 'error',
          message: `${target.label}: unbalanced LONGREIN markers in ${target.instructionFile} (${begins} begin / ${ends} end) — fix manually`,
        });
      }
    }
  }

  return findings;
}
