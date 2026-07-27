import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cli = path.join(root, 'cli/dist/index.js');

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
}

test('does not expose removed task, MCP or Dashboard command surfaces', () => {
  const help = run(['--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.doesNotMatch(help.stdout, /^\s+task\b/m);

  const task = run(['task']);
  assert.notEqual(task.status, 0);
  assert.match(task.stderr, /unknown command ['"]task['"]/i);

  const taskHelp = run(['help', 'task']);
  assert.notEqual(taskHelp.status, 0);
  assert.doesNotMatch(taskHelp.stdout, /context \[options\] <task>/);

  for (const command of ['mcp', 'dashboard']) {
    assert.doesNotMatch(help.stdout, new RegExp(`^\\s+${command}\\b`, 'm'));
    const result = run([command]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(`unknown command ['\"]${command}['\"]`, 'i'));
  }
});

test('exposes extension and removes the former setup command surface', () => {
  const help = run(['--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /^\s+extension\b/m);
  assert.doesNotMatch(help.stdout, /^\s+setup\b/m);

  const legacy = run(['setup']);
  assert.notEqual(legacy.status, 0);
  assert.match(legacy.stderr, /unknown command ['"]setup['"]/i);
});
