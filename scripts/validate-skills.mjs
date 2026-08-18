import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import GithubSlugger from 'github-slugger';
import MarkdownIt from 'markdown-it';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expectedSkills = ['shape', 'grill', 'dev', 'test', 'review', 'walkthrough', 'evolution', 'frontend-design'];
const failures = [];
const markdown = new MarkdownIt({ html: true });
const shapeContextLifecycleInfo = 'json shape-context-lifecycle-v1';
const expectedShapeContextLifecycle = [
  ['discussion_or_view_only', 'conversation_only'],
  ['host_auto_route_without_task_start', 'conversation_only'],
  ['explicit_shape_new_task', 'create_context_at_task_root'],
  ['shape_for_existing_task', 'read_context_and_revise_if_needed'],
];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function readFile(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
}

function read(relativePath) {
  return readFile(path.join(root, relativePath));
}

function walk(directory, predicate = () => true) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(absolute, predicate);
    return predicate(absolute) ? [absolute] : [];
  });
}

function parseFrontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const fields = new Map();
  for (const line of match[1].split('\n')) {
    const field = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (field) fields.set(field[1], field[2].trim());
  }
  return fields;
}

function singleLineField(source, name) {
  const match = source.match(new RegExp(`^[ \\t]*${name}:[ \\t]*(.*?)[ \\t]*$`, 'm'));
  return match ? match[1] : null;
}

function visitTokens(tokens, visitor) {
  for (const token of tokens) {
    visitor(token);
    if (token.children) visitTokens(token.children, visitor);
  }
}

export function markdownTargets(source) {
  const targets = [];
  visitTokens(markdown.parse(source, {}), (token) => {
    if (token.type !== 'link_open' && token.type !== 'image') return;
    const target = token.attrGet(token.type === 'image' ? 'src' : 'href');
    if (target !== null) targets.push(target);
  });
  return targets;
}

function inlineText(tokens) {
  return tokens
    .map((token) => {
      if (token.type === 'text' || token.type === 'code_inline') return token.content;
      if (token.type === 'softbreak' || token.type === 'hardbreak') return ' ';
      return token.children ? inlineText(token.children) : '';
    })
    .join('');
}

export function headingAnchors(source) {
  const tokens = markdown.parse(source, {});
  const slugger = new GithubSlugger();
  const anchors = new Set();
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index].type !== 'heading_open') continue;
    const content = tokens[index + 1];
    if (content?.type !== 'inline') continue;
    anchors.add(slugger.slug(inlineText(content.children || [])));
  }
  return anchors;
}

export function validateShapeContextLifecycle(source) {
  const lifecycleFences = markdown
    .parse(source, {})
    .filter(
      (token) =>
        token.type === 'fence' && token.info.trim().split(/\s+/).includes('shape-context-lifecycle-v1'),
    );

  if (lifecycleFences.length !== 1) {
    return [`Shape must contain exactly one tagged context lifecycle contract; found ${lifecycleFences.length}`];
  }

  const [contract] = lifecycleFences;
  if (contract.info.trim() !== shapeContextLifecycleInfo) {
    return [`Shape context lifecycle fence info must be ${shapeContextLifecycleInfo}`];
  }

  let actual;
  try {
    actual = JSON.parse(contract.content);
  } catch (error) {
    return [`Shape context lifecycle contract is not valid JSON: ${error.message}`];
  }

  if (JSON.stringify(actual) !== JSON.stringify(expectedShapeContextLifecycle)) {
    return ['Shape context lifecycle contract does not match the required case priority/action mapping'];
  }

  return [];
}

export function resolveMarkdownTarget(fromFile, target) {
  if (/^[A-Za-z][A-Za-z\d+.-]*:/.test(target) || target.startsWith('//')) return null;
  const fragment = target.indexOf('#');
  const encodedPath = fragment === -1 ? target : target.slice(0, fragment);
  const encodedAnchor = fragment === -1 ? '' : target.slice(fragment + 1);
  const decodedPath = decodeURIComponent(encodedPath);
  const file = decodedPath ? path.resolve(path.dirname(fromFile), decodedPath) : fromFile;
  return { file, anchor: decodeURIComponent(encodedAnchor) };
}

const skillsRoot = path.join(root, 'skills');
const installedSkills = fs
  .readdirSync(skillsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(skillsRoot, entry.name, 'SKILL.md')))
  .map((entry) => entry.name)
  .sort();

check(
  JSON.stringify(installedSkills) === JSON.stringify([...expectedSkills].sort()),
  `Skill directories differ from the documented surface: ${installedSkills.join(', ')}`,
);

for (const name of expectedSkills) {
  const skillRoot = path.join(skillsRoot, name);
  const skillFile = path.join(skillRoot, 'SKILL.md');
  const source = readFile(skillFile);
  const frontmatter = parseFrontmatter(source);

  check(frontmatter !== null, `skills/${name}/SKILL.md has no frontmatter`);
  if (frontmatter) {
    check(frontmatter.size === 2, `skills/${name}/SKILL.md frontmatter must contain only name and description`);
    check(frontmatter.get('name') === name, `skills/${name}/SKILL.md name does not match its directory`);
    check(Boolean(frontmatter.get('description')), `skills/${name}/SKILL.md has an empty description`);
  }

  const agentFile = path.join(skillRoot, 'agents/openai.yaml');
  check(fs.existsSync(agentFile), `skills/${name}/agents/openai.yaml is missing`);
  if (fs.existsSync(agentFile)) {
    const agent = readFile(agentFile);
    const displayName = singleLineField(agent, 'display_name');
    const shortDescription = singleLineField(agent, 'short_description');
    const defaultPrompt = singleLineField(agent, 'default_prompt');
    check(Boolean(displayName), `skills/${name}/agents/openai.yaml has no display_name`);
    check(Boolean(shortDescription), `skills/${name}/agents/openai.yaml has no short_description`);
    check(Boolean(defaultPrompt), `skills/${name}/agents/openai.yaml has no default_prompt`);
    check(defaultPrompt?.includes(`$${name}`), `skills/${name}/agents/openai.yaml default prompt does not invoke $${name}`);
  }

  const markdown = walk(skillRoot, (file) => file.endsWith('.md'));
  const markdownSet = new Set(markdown);
  const reachable = new Set([skillFile]);
  const queue = [skillFile];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const target of markdownTargets(readFile(current))) {
      const resolved = resolveMarkdownTarget(current, target);
      if (!resolved || !markdownSet.has(resolved.file) || reachable.has(resolved.file)) continue;
      reachable.add(resolved.file);
      queue.push(resolved.file);
    }
  }
  for (const file of markdown.filter((candidate) => candidate.includes(`${path.sep}references${path.sep}`))) {
    check(reachable.has(file), `${path.relative(root, file)} is not reachable from skills/${name}/SKILL.md`);
  }
}

const checkedMarkdown = [
  path.join(root, 'README.md'),
  path.join(root, 'AGENTS.md'),
  ...walk(path.join(root, 'docs'), (file) => file.endsWith('.md')),
  ...walk(path.join(root, 'evals'), (file) => file.endsWith('.md')),
  ...walk(path.join(root, 'references'), (file) => file.endsWith('.md')),
  ...walk(path.join(root, 'skills'), (file) => file.endsWith('.md')),
];

for (const file of checkedMarkdown) {
  const source = readFile(file);
  check(!source.includes('dev/report.md'), `${path.relative(root, file)} references retired dev/report.md`);
  for (const target of markdownTargets(source)) {
    const resolved = resolveMarkdownTarget(file, target);
    if (!resolved) continue;
    check(fs.existsSync(resolved.file), `${path.relative(root, file)} links to missing ${target}`);
    if (resolved.anchor && fs.existsSync(resolved.file) && resolved.file.endsWith('.md')) {
      const anchors = headingAnchors(readFile(resolved.file));
      check(anchors.has(resolved.anchor), `${path.relative(root, file)} links to missing anchor ${target}`);
    }
  }
}

const readmes = read('README.md');
for (const name of expectedSkills) {
  check(readmes.includes(`skills/${name}/SKILL.md`), `README.md does not link the ${name} Skill`);
}

const referenceIndex = read('references/README.md');
for (const file of fs.readdirSync(path.join(root, 'references'))) {
  if (file === 'README.md' || !file.endsWith('.md')) continue;
  check(referenceIndex.includes(`(${file})`), `references/README.md does not route ${file}`);
}
check(readmes.includes('references/README.md'), 'README.md does not link the research reference index');
const packageFiles = JSON.parse(read('package.json')).files;
check(packageFiles.includes('references'), 'package.json does not publish the research references');

const shape = read('skills/shape/SKILL.md');
const artifacts = read('skills/shape/references/artifacts.md');
const context = read('skills/shape/references/templates/context.demo.md');
check(shape.includes('references/artifacts.md'), 'Shape does not link its artifact contract');
check(shape.includes('references/templates/context.demo.md'), 'Shape does not link the Context template');
check(!/Shape 不自己创建任务|shape\/shape\.md/.test(shape), 'Shape still contains the retired no-create or shape.md contract');
for (const failure of validateShapeContextLifecycle(shape)) check(false, failure);
check(artifacts.includes('[Context Demo](templates/context.demo.md)'), 'Artifact contract does not link the Context template');

for (const heading of [
  '## Original Request',
  '## Reality Coordinates',
  '## Goal',
  '## Scope',
  '## Non-goals',
  '## Acceptance Evidence',
  '## Current Artifacts',
]) {
  check(new RegExp(`^${heading}$`, 'm').test(context), `Context template is missing ${heading}`);
}

const activeSkills = expectedSkills.map((name) => read(`skills/${name}/SKILL.md`)).join('\n');
check(!/shape\/shape\.md|studio\/evolution/.test(activeSkills), 'An active Skill references a retired or undefined artifact path');

for (const [skill, artifact, demo] of [
  ['dev', 'dev/implementation.md', 'skills/dev/references/templates/implementation.demo.md'],
  ['test', 'test/test-plan.md', 'skills/test/references/templates/test-plan.demo.md'],
  ['test', 'test/test-report.md', 'skills/test/references/templates/test-report.demo.md'],
  ['review', 'review/review.md', 'skills/review/references/templates/review.demo.md'],
  ['walkthrough', 'walkthrough/walkthrough.md', 'skills/walkthrough/references/templates/walkthrough.demo.md'],
  ['evolution', 'evolution/evolution.md', 'skills/evolution/references/templates/evolution.demo.md'],
]) {
  check(read(`skills/${skill}/SKILL.md`).includes(artifact), `skills/${skill}/SKILL.md does not define ${artifact}`);
  check(fs.existsSync(path.join(root, demo)), `${artifact} has no ${demo}`);
}

for (const relativePath of ['README.md', 'docs/getting-started.md']) {
  const source = read(relativePath);
  check(source.includes('context.md'), `${relativePath} does not document context.md`);
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`- ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Validated ${expectedSkills.length} Skills and ${checkedMarkdown.length} Markdown files.\n`);
}
