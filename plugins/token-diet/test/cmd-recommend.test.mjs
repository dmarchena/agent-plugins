import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, '..');
const COMMANDS_DIR = join(PLUGIN_ROOT, 'commands');

function findCommandFile() {
  if (!existsSync(COMMANDS_DIR)) return null;
  const entries = readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.md'));
  return entries.length > 0 ? join(COMMANDS_DIR, entries[0]) : null;
}

function readCommand() {
  const cmdPath = findCommandFile();
  assert.ok(cmdPath, `expected at least one .md command file under ${COMMANDS_DIR}`);
  return readFileSync(cmdPath, 'utf8');
}

test('R2 — command emits exactly one recommendation from {add, replace, extend, update, none}', () => {
  const content = readCommand();
  for (const outcome of ['add', 'replace', 'extend', 'update', 'none']) {
    assert.ok(
      new RegExp('`' + outcome + '`').test(content),
      `expected the recommendation vocabulary to enumerate \`${outcome}\``
    );
  }
  assert.ok(
    /exactly one recommendation/i.test(content),
    'expected the command to state it emits exactly one recommendation'
  );
});

test('R2 — recommendation logic maps each analysis case to its outcome', () => {
  const content = readCommand();
  const lower = content.toLowerCase();
  assert.ok(
    lower.includes('no token-saving policy') && /`add`/.test(content),
    'expected: no policy -> add'
  );
  assert.ok(
    (lower.includes('foreign') || lower.includes('conflicting')) && /`replace`/.test(content),
    'expected: foreign/conflicting policy -> replace'
  );
  assert.ok(
    lower.includes('incomplete') && /`extend`/.test(content),
    'expected: own but incomplete policy -> extend'
  );
});

test('R2.S1 / AC3 — mark present with version EQUAL to current (v1.2.0) -> recommend none, no change proposed', () => {
  const content = readCommand();
  assert.ok(
    content.includes('already covered by token-diet v1.2.0'),
    'expected the exact R2.S1 reason literal "already covered by token-diet v1.2.0"'
  );
  const lower = content.toLowerCase();
  assert.ok(
    lower.includes('propose no change') || lower.includes('no change'),
    'expected the command to state that no change is proposed when the recommendation is none'
  );
});

test('R2.S2 / AC4 — mark present with version OLDER than current -> recommend update, naming the version jump v1.0.0 -> v1.2.0', () => {
  const content = readCommand();
  assert.ok(/`update`/.test(content), 'expected the update outcome to be documented');
  assert.ok(
    /v1\.0\.0\s*(→|->)\s*v1\.2\.0/.test(content),
    'expected the command to name the concrete version jump v1.0.0 -> v1.2.0 as an example'
  );
});
