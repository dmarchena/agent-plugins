import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, '..');
const REPO_ROOT = join(PLUGIN_ROOT, '..', '..');

const PLUGIN_JSON_PATH = join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json');
const MARKETPLACE_JSON_PATH = join(REPO_ROOT, '.claude-plugin', 'marketplace.json');
const COMMANDS_DIR = join(PLUGIN_ROOT, 'commands');

function findCommandFile() {
  if (!existsSync(COMMANDS_DIR)) return null;
  const entries = readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.md'));
  return entries.length > 0 ? join(COMMANDS_DIR, entries[0]) : null;
}

test('AC1/AC2/AC5/AC6 scaffold — plugin.json exists, parses, and pins the current version', () => {
  assert.ok(existsSync(PLUGIN_JSON_PATH), `expected ${PLUGIN_JSON_PATH} to exist`);
  const raw = readFileSync(PLUGIN_JSON_PATH, 'utf8');
  let parsed;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(raw);
  }, 'plugin.json must be valid JSON');
  assert.equal(parsed.name, 'token-diet');
  assert.equal(
    parsed.version,
    '1.2.0',
    'plugin.json version must match the attribution mark version used in commands/install.md'
  );
});

test('scaffold — README.md, CHANGELOG.md, AGENTS.md exist following the sibling-plugin convention', () => {
  for (const name of ['README.md', 'CHANGELOG.md', 'AGENTS.md']) {
    assert.ok(existsSync(join(PLUGIN_ROOT, name)), `expected ${name} to exist under ${PLUGIN_ROOT}`);
  }
});

test('scaffold — token-diet is registered in .claude-plugin/marketplace.json', () => {
  assert.ok(existsSync(MARKETPLACE_JSON_PATH), `expected ${MARKETPLACE_JSON_PATH} to exist`);
  const parsed = JSON.parse(readFileSync(MARKETPLACE_JSON_PATH, 'utf8'));
  const entry = (parsed.plugins || []).find((p) => p.name === 'token-diet');
  assert.ok(entry, 'expected a "token-diet" entry in marketplace.json plugins[]');
  assert.equal(entry.source, './plugins/token-diet');
  assert.equal(typeof entry.description, 'string');
  assert.ok(entry.description.length > 0);
});

test('command file — exists as the single explicit-invocation entry point under commands/', () => {
  const cmdPath = findCommandFile();
  assert.ok(cmdPath, `expected at least one .md command file under ${COMMANDS_DIR}`);
});

test('R1 — command resolves target: project ./CLAUDE.md vs user ~/.claude/CLAUDE.md, asking when both exist', () => {
  const cmdPath = findCommandFile();
  const content = readFileSync(cmdPath, 'utf8');
  assert.ok(content.includes('./CLAUDE.md'), 'expected a reference to the project target ./CLAUDE.md');
  assert.ok(content.includes('~/.claude/CLAUDE.md'), 'expected a reference to the user target ~/.claude/CLAUDE.md');
});

test('R1.S1 — no policy / no mark literal report strings are present', () => {
  const cmdPath = findCommandFile();
  const content = readFileSync(cmdPath, 'utf8');
  assert.ok(
    content.includes('no token-saving policy detected'),
    'expected the literal R1.S1 "no policy detected" report string'
  );
  assert.ok(
    content.includes('no token-diet mark'),
    'expected the literal R1.S1 "no mark" report string'
  );
});

test('R1 — command checks for the versioned attribution mark literal', () => {
  const cmdPath = findCommandFile();
  const content = readFileSync(cmdPath, 'utf8');
  assert.ok(
    content.includes('Produced with token-diet (v'),
    'expected the command to reference the attribution mark literal it searches for'
  );
});

test('R1.S2 — non-existent target: informs and offers to create it, without aborting with an error', () => {
  const cmdPath = findCommandFile();
  const content = readFileSync(cmdPath, 'utf8');
  const lower = content.toLowerCase();
  assert.ok(
    lower.includes('does not exist'),
    'expected the command to state the target file does not exist'
  );
  assert.ok(
    lower.includes('offer'),
    'expected the command to offer creating the missing target'
  );
  assert.ok(
    lower.includes('without aborting') || lower.includes('do not abort'),
    'expected the command to state it does not abort with an error on a missing target'
  );
});

test('R3 — command copies plugins/token-diet/assets/rules.md to the chosen destination, with project/user defaults', () => {
  const cmdPath = findCommandFile();
  const content = readFileSync(cmdPath, 'utf8');
  assert.ok(content.includes('assets/rules.md'), 'expected a reference to the rules doc path assets/rules.md');
  assert.ok(content.includes('docs/'), 'expected the project default destination docs/');
  assert.ok(content.includes('~/.claude/'), 'expected the user default destination ~/.claude/');
});

test('R3.S2 — destination outside the repo: "not versioned" warning and absolute pointer', () => {
  const cmdPath = findCommandFile();
  const content = readFileSync(cmdPath, 'utf8');
  const lower = content.toLowerCase();
  assert.ok(
    lower.includes('not versioned') || lower.includes('not be versioned'),
    'expected the R3.S2 "will not be versioned" warning'
  );
  assert.ok(
    lower.includes('absolute path'),
    'expected the R3.S2 absolute-pointer wording'
  );
});

test('command prompt reserves explicit sections for R2 (recommend) and R4 (apply), not implemented here', () => {
  const cmdPath = findCommandFile();
  const content = readFileSync(cmdPath, 'utf8');
  assert.ok(/R2/.test(content), 'expected a placeholder/section marker for R2 (recommendation), added by a later task');
  assert.ok(/R4/.test(content), 'expected a placeholder/section marker for R4 (apply with confirmation), added by a later task');
});
