import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, '..', '..');
const LLMS_TXT_PATH = path.join(REPO_ROOT, 'llms.txt');
const PLUGINS_DIR = path.join(REPO_ROOT, 'plugins');

function readLlmsTxt() {
  return fs.readFileSync(LLMS_TXT_PATH, 'utf8');
}

function pluginNames() {
  return fs
    .readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

test('R3.S1/AC7: llms.txt exists at the repo root and is non-empty', () => {
  assert.ok(fs.existsSync(LLMS_TXT_PATH), 'expected llms.txt to exist at the repo root');
  const content = readLlmsTxt();
  assert.ok(content.trim().length > 0, 'expected llms.txt to be non-empty');
});

test('R3.S1/AC7: llms.txt starts with exactly one `# ` H1 line', () => {
  const content = readLlmsTxt();
  const lines = content.split('\n');
  const firstLine = lines[0];
  assert.ok(
    /^# .+/.test(firstLine),
    `expected the first line of llms.txt to start with "# " (single H1), got: ${JSON.stringify(firstLine)}`,
  );
  const h1Lines = lines.filter((line) => /^# /.test(line));
  assert.equal(
    h1Lines.length,
    1,
    `expected exactly one line starting with "# " in llms.txt, found ${h1Lines.length}`,
  );
});

test('R3.S1/AC7: llms.txt contains one Markdown link per plugin directory under plugins/ (by plugin name)', () => {
  const content = readLlmsTxt();
  const names = pluginNames();
  assert.ok(names.length > 0, 'expected at least one plugin directory under plugins/ to check against');

  for (const name of names) {
    const linkPattern = new RegExp(`\\[[^\\]]*${name}[^\\]]*\\]\\([^)]+\\)`);
    assert.ok(
      linkPattern.test(content),
      `expected llms.txt to contain a Markdown link naming plugin "${name}"`,
    );
  }
});
