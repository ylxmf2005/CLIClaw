import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cli = path.join(root, 'cli/dist/index.js');
const skills = ['shape', 'grill', 'dev', 'test', 'walkthrough', 'review', 'evolution', 'frontend-design'];

function run(args, env, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  assert.equal(result.status, expectedStatus, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

test('default install, update and uninstall cover every host while preserving user content', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'longrein-uninstall-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const home = path.join(temp, 'home');
  const codexHome = path.join(home, '.codex');
  const fakeBin = path.join(temp, 'bin');
  const commandLog = path.join(temp, 'commands.log');
  fs.mkdirSync(fakeBin, { recursive: true });

  for (const command of ['codex', 'claude', 'launchctl', 'pkill']) {
    const executable = path.join(fakeBin, command);
    fs.writeFileSync(
      executable,
      '#!/bin/sh\nprintf "%s\\n" "$0 $*" >> "$LONGREIN_TEST_LOG"\nexit 0\n',
    );
    fs.chmodSync(executable, 0o755);
  }

  const env = {
    HOME: home,
    CODEX_HOME: codexHome,
    PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
    LONGREIN_TEST_LOG: commandLog,
  };
  fs.mkdirSync(codexHome, { recursive: true });
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(home, '.pi', 'agent'), { recursive: true });
  fs.writeFileSync(path.join(codexHome, 'AGENTS.md'), 'codex user content\n');
  fs.writeFileSync(path.join(home, '.claude', 'CLAUDE.md'), 'claude user content\n');
  fs.writeFileSync(path.join(home, '.pi', 'agent', 'AGENTS.md'), 'pi user content\n');

  run(['install', '--yes'], env);
  for (const base of [path.join(codexHome, 'skills'), path.join(home, '.claude', 'skills'), path.join(home, '.pi', 'agent', 'skills')]) {
    for (const skill of skills) assert.equal(fs.existsSync(path.join(base, skill)), true, `${base}/${skill} should be installed`);
  }

  const codexInstructions = fs.readFileSync(path.join(codexHome, 'AGENTS.md'), 'utf8');
  const soulBlockIndex = codexInstructions.indexOf('LONGREIN BLOCK: soul');
  const jobBlockIndex = codexInstructions.indexOf('LONGREIN BLOCK: job');
  const userContentIndex = codexInstructions.indexOf('codex user content');
  assert.notEqual(soulBlockIndex, -1);
  assert.notEqual(jobBlockIndex, -1);
  assert.notEqual(userContentIndex, -1);
  assert.match(codexInstructions, /^<!-- >>> LONGREIN BLOCK: soul >>> -->/);
  assert.ok(
    soulBlockIndex < jobBlockIndex && jobBlockIndex < userContentIndex,
    'judgment principles and workflow should be injected before user-owned instructions',
  );

  const status = run(['status'], env);
  assert.match(status.stdout, /Claude Code/);
  assert.match(status.stdout, /Codex/);
  assert.match(status.stdout, /Pi/);

  const piShape = path.join(home, '.pi', 'agent', 'skills', 'shape');
  const changedFile = path.join(piShape, 'local-change.txt');
  fs.writeFileSync(changedFile, 'make the managed copy stale\n');
  assert.match(run(['status', '--pi'], env).stdout, /stale/);
  const doctor = run(['doctor', '--pi'], env);
  assert.match(doctor.stdout, /warn\s+Pi: skill "shape" copy is stale/);
  assert.match(doctor.stdout, /can be fixed automatically/);
  run(['doctor', '--fix', '--pi'], env);
  assert.equal(fs.existsSync(changedFile), false);
  assert.doesNotMatch(run(['status', '--pi'], env).stdout, /stale/);

  const codexDev = path.join(codexHome, 'skills', 'dev');
  const updateChangedFile = path.join(codexDev, 'local-change.txt');
  fs.writeFileSync(updateChangedFile, 'make another managed copy stale\n');
  run(['update', '--codex'], env);
  assert.equal(fs.existsSync(updateChangedFile), false);

  for (const base of [path.join(codexHome, 'skills'), path.join(home, '.claude', 'skills'), path.join(home, '.pi', 'agent', 'skills')]) {
    fs.symlinkSync(path.join(root, 'skills', 'dev'), path.join(base, 'dev-v2'));
  }
  fs.writeFileSync(
    path.join(codexHome, 'config.toml'),
    '[mcp_servers.longrein]\ncommand = "/opt/homebrew/bin/longrein"\nargs = ["mcp"]\n',
  );
  fs.writeFileSync(
    path.join(home, '.claude.json'),
    JSON.stringify({ mcpServers: { longrein: { command: '/opt/homebrew/bin/longrein', args: ['mcp'] } } }, null, 2),
  );
  fs.writeFileSync(
    path.join(home, '.pi', 'agent', 'settings.json'),
    `${JSON.stringify({ packages: ['npm:keep-me', path.join(root, 'plugins', 'longrein-extension')] }, null, 2)}\n`,
  );

  run(['uninstall', '--all'], env);

  for (const base of [path.join(codexHome, 'skills'), path.join(home, '.claude', 'skills'), path.join(home, '.pi', 'agent', 'skills')]) {
    for (const skill of skills) assert.equal(fs.existsSync(path.join(base, skill)), false, `${base}/${skill} should be removed`);
    assert.equal(fs.existsSync(path.join(base, 'dev-v2')), false, `${base}/dev-v2 should be removed`);
  }
  for (const [file, content] of [
    [path.join(codexHome, 'AGENTS.md'), 'codex user content'],
    [path.join(home, '.claude', 'CLAUDE.md'), 'claude user content'],
    [path.join(home, '.pi', 'agent', 'AGENTS.md'), 'pi user content'],
  ]) {
    const text = fs.readFileSync(file, 'utf8');
    assert.match(text, new RegExp(content));
    assert.doesNotMatch(text, /LONGREIN BLOCK/);
  }
  const piSettings = JSON.parse(fs.readFileSync(path.join(home, '.pi', 'agent', 'settings.json'), 'utf8'));
  assert.deepEqual(piSettings.packages, ['npm:keep-me']);

  const commands = fs.readFileSync(commandLog, 'utf8');
  assert.match(commands, /codex plugin remove longrein-extension@longrein --json/);
  assert.match(commands, /codex plugin marketplace remove longrein --json/);
  assert.match(commands, /codex mcp remove longrein/);
  assert.match(commands, /claude plugin uninstall longrein-extension@longrein --scope user/);
  assert.match(commands, /claude plugin marketplace remove longrein --scope user/);
  assert.match(commands, /claude mcp remove longrein --scope user/);
});

test('default doctor inspects Pi and ignores broken links owned by other systems', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'longrein-doctor-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const home = path.join(temp, 'home');
  const codexHome = path.join(home, '.codex');
  const piSkills = path.join(home, '.pi', 'agent', 'skills');
  const claudeSkills = path.join(home, '.claude', 'skills');
  fs.mkdirSync(path.join(piSkills, 'shape'), { recursive: true });
  fs.writeFileSync(path.join(piSkills, 'shape', 'foreign.txt'), 'not managed by Longrein\n');
  fs.mkdirSync(claudeSkills, { recursive: true });
  fs.symlinkSync(path.join(home, 'another-tool', 'missing-skill'), path.join(claudeSkills, 'foreign-broken-link'));

  const result = run(['doctor'], {
    HOME: home,
    CODEX_HOME: codexHome,
    PI_CODING_AGENT_DIR: path.join(home, '.pi', 'agent'),
  });
  assert.match(result.stdout, /Pi: "shape" exists .*not managed by longrein/);
  assert.doesNotMatch(result.stdout, /foreign-broken-link/);
});

test('explicit Codex install prunes matching aliases without affecting other hosts', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'longrein-alias-prune-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const home = path.join(temp, 'home');
  const codexHome = path.join(home, '.codex');
  const skillsDir = path.join(codexHome, 'skills');
  fs.mkdirSync(skillsDir, { recursive: true });
  fs.symlinkSync(path.join(root, 'skills', 'dev'), path.join(skillsDir, 'dev-v2'));
  fs.mkdirSync(path.join(skillsDir, 'shape-v2'));
  fs.writeFileSync(path.join(skillsDir, 'shape-v2', 'keep.txt'), 'foreign content\n');

  run(['install', '--yes', '--codex'], { HOME: home, CODEX_HOME: codexHome });

  assert.equal(fs.existsSync(path.join(skillsDir, 'dev-v2')), false);
  assert.equal(fs.existsSync(path.join(skillsDir, 'shape-v2', 'keep.txt')), true);
  assert.equal(fs.existsSync(path.join(home, '.claude', 'skills')), false);
  assert.equal(fs.existsSync(path.join(home, '.pi', 'agent', 'skills')), false);
});
