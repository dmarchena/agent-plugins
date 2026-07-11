import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, '..', '..');
const MARKETPLACE_JSON = path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json');

test('R1.S1: Running the repo validation script exits successfully and the shared marketplace catalog parses as JSON with a non-empty owner email and a semver marketplace-level version.', () => {
  const raw = fs.readFileSync(MARKETPLACE_JSON, 'utf8');
  let parsed;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(raw);
  }, 'marketplace.json must parse as valid JSON');

  assert.equal(typeof parsed.owner?.email, 'string', 'owner.email must be a string');
  assert.ok(parsed.owner.email.length > 0, 'owner.email must be non-empty');

  assert.equal(typeof parsed.metadata?.version, 'string', 'metadata.version must be a string');
  assert.match(
    parsed.metadata.version,
    /^\d+\.\d+\.\d+$/,
    'metadata.version must be semver X.Y.Z',
  );

  execFileSync('bash', [path.join(REPO_ROOT, 'scripts', 'validate.sh')], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
});

test('R1.S2: Strict validation of the committed shared marketplace catalog passes end to end; any field strict validation would reject is absent from the committed file.', () => {
  execFileSync('claude', ['plugin', 'validate', REPO_ROOT, '--strict'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
});
