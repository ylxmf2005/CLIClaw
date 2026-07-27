import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cli = path.join(root, 'cli/dist/index.js');
const skills = ['shape', 'grill', 'dev', 'test', 'walkthrough', 'review', 'evolution'];

function run(args, env, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  assert.equal(result.status, expectedStatus, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

test('uninstall --all removes every Longrein-owned host integration while preserving user content', (t) => {
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

  run(['install', '--yes', '--codex', '--claude', '--pi'], env);
  for (const base of [path.join(codexHome, 'skills'), path.join(home, '.claude', 'skills'), path.join(home, '.pi', 'agent', 'skills')]) {
    for (const skill of skills) assert.equal(fs.existsSync(path.join(base, skill)), true, `${base}/${skill} should be installed`);
  }
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

test('install prunes retired aliases only when they point to the matching Longrein Skill', (t) => {
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
});
