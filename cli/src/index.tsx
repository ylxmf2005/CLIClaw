import { Command } from 'commander';
import pc from 'picocolors';
import { targets, Target, TargetFilter, TargetId } from './core/paths.js';
import { listSkills, Skill } from './core/skills.js';
import {
  inspect,
  installSkill,
  pruneBrokenOwnLinks,
  pruneRetiredOwnAliases,
  uninstallSkill,
  SkillState,
} from './core/installer.js';
import { blockStatus, listBlocks, removeBlocks, upsertBlocks } from './core/blocks.js';
import { runDoctor } from './core/doctor.js';
import { cleanupLongreinIntegrations } from './core/cleanup.js';
import { LONGREIN_VERSION } from './version.js';
import {
  EXTENSION_COMPONENTS,
  ExtensionComponent,
  ExtensionTarget,
  installExtension,
  resolveExtensionComponents,
} from './core/recommended-extension.js';

const program = new Command();

interface CommonOpts {
  claude?: boolean;
  codex?: boolean;
  pi?: boolean;
}

function activeTargets(opts: CommonOpts): Target[] {
  return targets(opts);
}

function targetFilter(selected: TargetId[]): TargetFilter {
  return {
    claude: selected.includes('claude'),
    codex: selected.includes('codex'),
    pi: selected.includes('pi'),
  };
}

function resolveSkills(names: string[]): Skill[] {
  const all = listSkills();
  if (names.length === 0) return all;
  const byName = new Map(all.map((s) => [s.name, s]));
  const missing = names.filter((n) => !byName.has(n));
  if (missing.length) {
    console.error(pc.red(`unknown skill(s): ${missing.join(', ')}`));
    console.error(pc.dim(`available: ${all.map((s) => s.name).join(', ')}`));
    process.exit(1);
  }
  return names.map((n) => byName.get(n)!);
}

function stateLabel(state: SkillState, stampVersion?: string): string {
  switch (state) {
    case 'linked':
      return pc.green('✓ linked');
    case 'copy-fresh':
      return pc.green(`✓ v${stampVersion ?? '?'}`);
    case 'copy-stale':
      return pc.yellow(`◐ stale v${stampVersion ?? '?'}`);
    case 'foreign-link':
      return pc.red('! foreign link');
    case 'foreign-dir':
      return pc.red('! foreign');
    case 'missing':
      return pc.dim('·');
  }
}

function syncBlocks(active: Target[], quiet = false): void {
  const blocks = listBlocks();
  for (const target of active) {
    const { changed } = upsertBlocks(target.instructionFile, blocks);
    if (!quiet) {
      const owners = blocks.map((b) => b.owner).join(', ');
      console.log(
        `  ${target.label.padEnd(12)} ${target.instructionFile}: ` +
          (changed ? pc.green(`blocks synced (${owners})`) : pc.dim(`blocks already in sync (${owners})`)),
      );
    }
  }
}

function printStatus(opts: CommonOpts): void {
  const active = activeTargets(opts);
  const skills = listSkills();
  const blocks = listBlocks();

  console.log(pc.bold(`\nlongrein v${LONGREIN_VERSION}`));
  console.log(pc.dim(`source: ${skills[0] ? skills[0].dir.replace(/\/skills\/.*$/, '') : '(no skills found)'}\n`));

  const nameWidth = Math.max(...skills.map((s) => s.name.length), 5) + 2;
  const colWidth = 18;
  console.log(
    '  ' + 'skill'.padEnd(nameWidth) + active.map((t) => pc.bold(t.label.padEnd(colWidth))).join(''),
  );
  for (const skill of skills) {
    const cells = active.map((t) => {
      const found = inspect(t, skill);
      // pad on the raw label length (ANSI codes break padEnd)
      const label = stateLabel(found.state, found.stampVersion);
      const rawLen = label.replace(/\u001b\[[0-9;]*m/g, '').length;
      return label + ' '.repeat(Math.max(colWidth - rawLen, 1));
    });
    console.log('  ' + skill.name.padEnd(nameWidth) + cells.join(''));
  }

  console.log(pc.bold('\n  always-on blocks'));
  for (const target of active) {
    const { statuses, orphans } = blockStatus(target.instructionFile, blocks);
    const parts = statuses.map((s) => {
      if (s.state === 'ok') return pc.green(`${s.owner} ✓`);
      if (s.state === 'stale') return pc.yellow(`${s.owner} ◐`);
      return pc.dim(`${s.owner} ·`);
    });
    const orphanNote = orphans.length ? pc.red(`  orphans: ${orphans.join(', ')}`) : '';
    console.log(`  ${target.label.padEnd(nameWidth)}${parts.join('  ')}${orphanNote}`);
    console.log(pc.dim(`  ${''.padEnd(nameWidth)}${target.instructionFile}`));
  }
  console.log();
}

program
  .name('longrein')
  .description('Install and maintain the longrein engineering skills for Claude Code, Codex and Pi.')
  .version(LONGREIN_VERSION);

program
  .command('install [skills...]')
  .description('install skills and always-on instructions into selected agent hosts')
  .option('--link', 'symlink to this checkout instead of copying (development mode)', false)
  .option('--force', 'replace existing unmanaged dirs/links of the same name', false)
  .option('--no-blocks', 'skip syncing the always-on instruction blocks')
  .option('--claude', 'target Claude Code')
  .option('--codex', 'target Codex')
  .option('--pi', 'target Pi')
  .option('-y, --yes', 'non-interactive: install everything requested without the picker', false)
  .option('--extensions', 'also install or update the optional Extension')
  .option('--extension-components <components...>', 'install only selected Extension components')
  .option('--no-extensions', 'skip the optional Extension without prompting')
  .action(async (names: string[], opts) => {
    if (opts.extensionComponents && opts.extensions !== undefined) {
      console.error(pc.red('use either --extensions, --no-extensions or --extension-components, not more than one'));
      process.exitCode = 1;
      return;
    }
    let active = activeTargets(opts);
    const explicitTarget = opts.claude || opts.codex || opts.pi;
    if (!explicitTarget && !opts.yes && process.stdout.isTTY && process.stdin.isTTY) {
      const { pickTargets } = await import('./ui/Picker.js');
      const picked = await pickTargets(targets());
      if (picked === null) {
        console.log(pc.dim('cancelled'));
        return;
      }
      if (picked.length === 0) {
        console.log(pc.dim('nothing selected'));
        return;
      }
      active = targets(targetFilter(picked));
    }
    let skills = resolveSkills(names);

    if (names.length === 0 && !opts.yes && process.stdout.isTTY && process.stdin.isTTY) {
      const { pickSkills } = await import('./ui/Picker.js');
      const picked = await pickSkills(skills, opts.link ? 'link mode' : 'copy mode');
      if (picked === null) {
        console.log(pc.dim('cancelled'));
        return;
      }
      skills = resolveSkills(picked);
    }

    let extensionComponents: ExtensionComponent[] = [];
    if (opts.extensionComponents) {
      try {
        extensionComponents = resolveExtensionComponents(opts.extensionComponents);
      } catch (error) {
        console.error(pc.red(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
        return;
      }
    } else if (opts.extensions === true) {
      extensionComponents = [...EXTENSION_COMPONENTS];
    }
    if (!opts.extensionComponents && opts.extensions === undefined && !opts.yes && process.stdout.isTTY && process.stdin.isTTY) {
      const { pickExtensionComponents } = await import('./ui/Picker.js');
      const picked = await pickExtensionComponents(false);
      if (picked === null) {
        console.log(pc.dim('cancelled'));
        return;
      }
      extensionComponents = picked;
    }

    const extensionTargets = active.map((target) => target.id) as ExtensionTarget[];
    if (skills.length === 0) {
      if (extensionComponents.length === 0) {
        console.log(pc.dim('nothing selected'));
        return;
      }
      installExtension({ components: extensionComponents, targets: extensionTargets, dryRun: false });
      console.log(pc.green('\nExtension installation finished. Restart the selected hosts before using newly installed capabilities.\n'));
      return;
    }

    console.log(pc.bold(`\ninstalling ${skills.length} skill(s) [${opts.link ? 'link' : 'copy'}]\n`));
    let problems = 0;
    for (const target of active) {
      console.log(pc.bold(`  ${target.label}`) + pc.dim(` → ${target.skillsDir}`));
      for (const skill of skills) {
        const result = installSkill(target, skill, { link: opts.link, force: opts.force });
        const icon =
          result.action === 'skipped' ? pc.red('✗') : result.action === 'unchanged' ? pc.dim('=') : pc.green('✓');
        if (result.action === 'skipped') problems++;
        console.log(`    ${icon} ${skill.name.padEnd(14)} ${pc.dim(result.detail)}`);
      }
      for (const removed of pruneBrokenOwnLinks(target)) {
        console.log(`    ${pc.green('✓')} ${removed.padEnd(14)} ${pc.dim('pruned broken longrein link')}`);
      }
      for (const removed of pruneRetiredOwnAliases(target)) {
        console.log(`    ${pc.green('✓')} ${removed.padEnd(14)} ${pc.dim('pruned retired longrein alias')}`);
      }
    }
    if (opts.blocks !== false) {
      console.log(pc.bold('\n  always-on blocks'));
      syncBlocks(active);
    }
    if (extensionComponents.length > 0) {
      console.log(pc.bold('\n  optional Extension'));
      installExtension({ components: extensionComponents, targets: extensionTargets, dryRun: false });
      console.log(pc.dim('  Restart the selected hosts before using newly installed capabilities.'));
    }
    console.log();
    if (problems > 0) {
      console.log(pc.yellow(`${problems} item(s) skipped — rerun with --force to replace them, or see \`longrein doctor\`.\n`));
      process.exitCode = 1;
    }
  });

program
  .command('uninstall [skills...]')
  .description('remove Longrein-managed skills or every Longrein-owned host integration')
  .option('--all', 'remove all Skills, instruction blocks, plugins, marketplaces, legacy MCP and services', false)
  .option('--claude', 'target Claude Code')
  .option('--codex', 'target Codex')
  .option('--pi', 'target Pi')
  .action((names: string[], opts) => {
    if (!opts.all && names.length === 0) {
      console.error(pc.red('specify skill names or --all'));
      process.exit(1);
    }
    const explicitTarget = opts.claude || opts.codex || opts.pi;
    const active = activeTargets(opts);
    const skills = resolveSkills(opts.all ? [] : names);
    console.log();
    for (const target of active) {
      console.log(pc.bold(`  ${target.label}`));
      for (const skill of skills) {
        const result = uninstallSkill(target, skill);
        const icon = result.action === 'removed' ? pc.green('✓') : result.action === 'skipped' ? pc.red('✗') : pc.dim('·');
        console.log(`    ${icon} ${skill.name.padEnd(14)} ${pc.dim(result.detail)}`);
      }
      if (opts.all) {
        for (const removed of pruneRetiredOwnAliases(target)) {
          console.log(`    ${pc.green('✓')} ${removed.padEnd(14)} ${pc.dim('removed retired longrein alias')}`);
        }
        const { changed } = removeBlocks(target.instructionFile);
        console.log(
          `    ${changed ? pc.green('✓') : pc.dim('·')} ${'blocks'.padEnd(14)} ${pc.dim(
            changed ? `removed from ${target.instructionFile}` : 'none present',
          )}`,
        );
      }
    }
    if (opts.all) {
      console.log(pc.bold('\n  host integrations'));
      const selectedTargets = active.map((target) => target.id);
      const includeLegacyServices = !explicitTarget;
      for (const result of cleanupLongreinIntegrations(selectedTargets, includeLegacyServices)) {
        const icon =
          result.state === 'removed'
            ? pc.green('✓')
            : result.state === 'absent'
              ? pc.dim('·')
              : result.state === 'skipped'
                ? pc.yellow('!')
                : pc.red('✗');
        console.log(`    ${icon} ${result.label} ${pc.dim(result.detail)}`);
        if (result.state === 'failed') process.exitCode = 1;
      }
    }
    console.log();
  });

program
  .command('update')
  .description('refresh stale copies and re-sync the always-on blocks')
  .option('--claude', 'target Claude Code')
  .option('--codex', 'target Codex')
  .option('--pi', 'target Pi')
  .action((opts) => {
    const active = activeTargets(opts);
    const skills = listSkills();
    console.log();
    for (const target of active) {
      console.log(pc.bold(`  ${target.label}`));
      let touched = 0;
      for (const skill of skills) {
        const found = inspect(target, skill);
        if (found.state === 'copy-stale') {
          const result = installSkill(target, skill, { link: false, force: false });
          console.log(`    ${pc.green('✓')} ${skill.name.padEnd(14)} ${pc.dim(result.detail)}`);
          touched++;
        }
      }
      for (const removed of pruneBrokenOwnLinks(target)) {
        console.log(`    ${pc.green('✓')} ${removed.padEnd(14)} ${pc.dim('pruned broken longrein link')}`);
        touched++;
      }
      for (const removed of pruneRetiredOwnAliases(target)) {
        console.log(`    ${pc.green('✓')} ${removed.padEnd(14)} ${pc.dim('pruned retired longrein alias')}`);
        touched++;
      }
      if (touched === 0) console.log(pc.dim('    all installed copies up to date'));
    }
    console.log(pc.bold('\n  always-on blocks'));
    syncBlocks(active);
    console.log();
  });

program
  .command('status')
  .description('show install state per skill and target, plus block status')
  .option('--claude', 'target Claude Code')
  .option('--codex', 'target Codex')
  .option('--pi', 'target Pi')
  .action((opts) => printStatus(opts));

program
  .command('list')
  .description('list available skills (plain, scriptable)')
  .action(() => {
    for (const skill of listSkills()) {
      console.log(`${skill.name}\t${skill.description}`);
    }
  });

program
  .command('doctor')
  .description('detect leftovers from old install mechanisms, stale copies and broken markers')
  .option('--fix', 'apply safe fixes automatically', false)
  .option('--claude', 'target Claude Code')
  .option('--codex', 'target Codex')
  .option('--pi', 'target Pi')
  .action((opts) => {
    const findings = runDoctor(activeTargets(opts));
    if (findings.length === 0) {
      console.log(pc.green('\n  ✓ no problems found\n'));
      return;
    }
    console.log();
    let unfixed = 0;
    for (const finding of findings) {
      const tag =
        finding.severity === 'error' ? pc.red('error') : finding.severity === 'warn' ? pc.yellow('warn ') : pc.cyan('info ');
      console.log(`  ${tag} ${finding.message}`);
      if (finding.fix && opts.fix) {
        console.log(`        ${pc.green('fixed:')} ${finding.fix()}`);
      } else if (finding.fix) {
        unfixed++;
      }
    }
    console.log();
    if (unfixed > 0 && !opts.fix) {
      console.log(pc.dim(`  ${unfixed} finding(s) can be fixed automatically: longrein doctor --fix\n`));
    }
    if (findings.some((f) => f.severity === 'error')) process.exitCode = 1;
  });

program.command('extension').description('install the optional FastCtx, CodeGraph, cass and session-search Extension');

// bare `longrein` shows the current installation state.
if (process.argv.length <= 2) {
  printStatus({});
} else {
  await program.parseAsync();
}
