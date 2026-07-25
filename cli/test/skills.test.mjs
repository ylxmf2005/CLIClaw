import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('Skill frontmatter accepts LF and CRLF checkouts', async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'longrein-skills-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const outfile = path.join(temp, 'skills.mjs');

  await build({
    entryPoints: [path.join(root, 'cli/src/core/skills.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    logLevel: 'silent',
  });

  const { parseFrontmatter } = await import(pathToFileURL(outfile).href);
  for (const newline of ['\n', '\r\n']) {
    const source = ['---', 'name: shape', 'description: Shape a task', '---', '# shape', ''].join(newline);
    assert.deepEqual(parseFrontmatter(source), { name: 'shape', description: 'Shape a task' });
  }
});

test('Skill validator follows CommonMark links, code, and containers', async (t) => {
  const validator = await import(pathToFileURL(path.join(root, 'scripts/validate-skills.mjs')).href);
  const source = [
    '[title](docs/file.md "optional title")',
    '[balanced](docs/file(v2).md)',
    '[escaped](docs/file\\(v3\\).md)',
    '[angle](<docs/file (v4).md>)',
    '![image](images/result.png "caption")',
    '[hash](docs/file.md\\#section)',
    '[reference][guide]',
    '',
    '[guide]: docs/guide.md',
    'Paragraph',
    '    [continued paragraph](docs/continued.md)',
    '- List paragraph',
    '    [continued list paragraph](docs/continued-list.md)',
    '',
    '    [second list paragraph](docs/second-list.md)',
    '> Quoted paragraph',
    '>     [continued quoted paragraph](docs/continued-quote.md)',
    '\\`[escaped tick](docs/escaped-tick.md)\\`',
    '`[inline example](missing-inline.md)`',
    '`multiline code span',
    '[multiline example](missing-multiline.md)',
    'still code`',
    '```markdown',
    '```still fenced code',
    '[fenced example](missing-fenced.md)',
    '```',
    '    [indented example](missing-indented.md)',
    '\t[tab example](missing-tab.md)',
    '- ```markdown',
    '  ```still fenced code',
    '  [list example](missing-list.md)',
    '  ```',
    '> ~~~markdown',
    '> ~~~still fenced code',
    '> [quoted example](missing-quoted.md)',
    '> ~~~',
    '> ```markdown',
    '> [implicit quote example](missing-implicit-quote.md)',
    '[after quote fence](docs/after-quote.md)',
    '- ```markdown',
    '  [implicit list example](missing-implicit-list.md)',
    '[after list fence](docs/after-list.md)',
    '',
    '-',
    '    [empty list content](docs/empty-list.md)',
  ].join('\n');

  assert.deepEqual(validator.markdownTargets(source), [
    'docs/file.md',
    'docs/file(v2).md',
    'docs/file(v3).md',
    'docs/file%20(v4).md',
    'images/result.png',
    'docs/file.md#section',
    'docs/guide.md',
    'docs/continued.md',
    'docs/continued-list.md',
    'docs/second-list.md',
    'docs/continued-quote.md',
    'docs/escaped-tick.md',
    'docs/after-quote.md',
    'docs/after-list.md',
    'docs/empty-list.md',
  ]);

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'longrein-markdown-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const markdownFile = path.join(temp, 'source.md');
  const targetFile = path.join(temp, 'target(v2).md');
  fs.writeFileSync(markdownFile, '[escaped](target\\(v2\\).md\\#use-foo "title")\n');
  fs.writeFileSync(targetFile, '   # Use `foo`\n');

  const [rawTarget] = validator.markdownTargets(fs.readFileSync(markdownFile, 'utf8'));
  const resolved = validator.resolveMarkdownTarget(markdownFile, rawTarget);
  assert.equal(rawTarget, 'target(v2).md#use-foo');
  assert.equal(resolved.file, targetFile);
  assert.equal(resolved.anchor, 'use-foo');
  assert.equal(fs.existsSync(resolved.file), true);
  assert.equal(validator.headingAnchors(fs.readFileSync(resolved.file, 'utf8')).has(resolved.anchor), true);
  assert.equal(validator.resolveMarkdownTarget(markdownFile, 'HTTPS://example.com/docs'), null);
});

test('Skill validator generates GitHub-style anchors for CommonMark headings', async () => {
  const validator = await import(pathToFileURL(path.join(root, 'scripts/validate-skills.mjs')).href);
  const source = [
    '# Use `foo`',
    '   ## Three Space [Linked](destination.md)',
    'Setext *Heading*',
    '=================',
    '> ### Quoted heading',
    '- ### Listed heading',
    '# Duplicate',
    '# Duplicate',
    '```markdown',
    '# Hidden fenced heading',
    '```',
    '    # Hidden indented heading',
    '\t# Hidden tab heading',
  ].join('\n');

  assert.deepEqual([...validator.headingAnchors(source)], [
    'use-foo',
    'three-space-linked',
    'setext-heading',
    'quoted-heading',
    'listed-heading',
    'duplicate',
    'duplicate-1',
  ]);
});

test('Shape context lifecycle contract is isolated from unrelated JSON and rejects malformed copies', async () => {
  const validator = await import(pathToFileURL(path.join(root, 'scripts/validate-skills.mjs')).href);
  const rawSource = fs.readFileSync(path.join(root, 'skills/shape/SKILL.md'), 'utf8');
  const crlfSource = rawSource.replace(/\r?\n/g, '\r\n');
  const source = rawSource.replace(/\r\n?/g, '\n');
  const contractMatch = source.match(/```json shape-context-lifecycle-v1\n[\s\S]*?\n```/);
  assert.ok(contractMatch);
  const [contract] = contractMatch;

  assert.deepEqual(validator.validateShapeContextLifecycle(rawSource), []);
  assert.deepEqual(validator.validateShapeContextLifecycle(crlfSource), []);

  const withUnrelatedJson = `${source}\n\`\`\`json\n{"unrelated":true}\n\`\`\`\n`;
  assert.deepEqual(validator.validateShapeContextLifecycle(withUnrelatedJson), []);

  const reversed = source.replace(
    '["explicit_shape_new_task", "create_context_at_task_root"]',
    '["explicit_shape_new_task", "conversation_only"]',
  );
  assert.match(validator.validateShapeContextLifecycle(reversed).join('\n'), /required case priority\/action mapping/);

  const missingMapping = source.replace(
    '  ["discussion_or_view_only", "conversation_only"],\n',
    '',
  );
  assert.match(
    validator.validateShapeContextLifecycle(missingMapping).join('\n'),
    /required case priority\/action mapping/,
  );

  const wrongPriority = source.replace(
    '  ["discussion_or_view_only", "conversation_only"],\n  ["host_auto_route_without_task_start", "conversation_only"],',
    '  ["host_auto_route_without_task_start", "conversation_only"],\n  ["discussion_or_view_only", "conversation_only"],',
  );
  assert.match(
    validator.validateShapeContextLifecycle(wrongPriority).join('\n'),
    /required case priority\/action mapping/,
  );

  const wrongTupleShape = source.replace(
    '["explicit_shape_new_task", "create_context_at_task_root"]',
    '["explicit_shape_new_task", "create_context_at_task_root", "extra"]',
  );
  assert.match(
    validator.validateShapeContextLifecycle(wrongTupleShape).join('\n'),
    /required case priority\/action mapping/,
  );

  const unconditionalExistingWrite = source.replace(
    '["shape_for_existing_task", "read_context_and_revise_if_needed"]',
    '["shape_revision_for_existing_task", "revise_existing_context"]',
  );
  assert.match(
    validator.validateShapeContextLifecycle(unconditionalExistingWrite).join('\n'),
    /required case priority\/action mapping/,
  );

  const missingContract = source.replace(contract, '');
  assert.match(validator.validateShapeContextLifecycle(missingContract).join('\n'), /exactly one.*found 0/);

  const duplicated = `${source}\n${contract}\n`;
  assert.match(validator.validateShapeContextLifecycle(duplicated).join('\n'), /exactly one.*found 2/);

  const wrongInfo = source.replace(
    '```json shape-context-lifecycle-v1',
    '```yaml shape-context-lifecycle-v1',
  );
  assert.match(validator.validateShapeContextLifecycle(wrongInfo).join('\n'), /fence info must be/);
});
