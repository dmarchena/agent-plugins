import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, '..', '..');

const CONTRIBUTING_PATH = path.join(REPO_ROOT, 'CONTRIBUTING.md');
const SECURITY_PATH = path.join(REPO_ROOT, 'SECURITY.md');
const README_PATH = path.join(REPO_ROOT, 'README.md');

test('R4.S1/AC8: CONTRIBUTING.md exists and is non-empty', () => {
  assert.ok(fs.existsSync(CONTRIBUTING_PATH), 'CONTRIBUTING.md must exist');
  const content = fs.readFileSync(CONTRIBUTING_PATH, 'utf8');
  assert.ok(content.trim().length > 0, 'CONTRIBUTING.md must be non-empty');
});

test('R4.S1/AC8: SECURITY.md exists, is non-empty, and names a vulnerability-reporting channel', () => {
  assert.ok(fs.existsSync(SECURITY_PATH), 'SECURITY.md must exist');
  const content = fs.readFileSync(SECURITY_PATH, 'utf8');
  assert.ok(content.trim().length > 0, 'SECURITY.md must be non-empty');
  assert.ok(
    /security advisory|private issue|dmarchena/i.test(content),
    'SECURITY.md must name a vulnerability-reporting channel',
  );
});

test('R4.S1/AC8: README.md contains an install command for each of the three platforms', () => {
  const content = fs.readFileSync(README_PATH, 'utf8');
  assert.ok(
    content.includes('claude plugin marketplace add'),
    'README.md must contain the claude install command',
  );
  assert.ok(
    content.includes('codex plugin marketplace add'),
    'README.md must contain the codex install command',
  );
  assert.ok(
    content.includes('copilot plugin marketplace add'),
    'README.md must contain the copilot install command',
  );
});
