// test/exec/extract.test.mjs — T1-extractor (docs/specs/executor-minimal-brief)
//
// Covers extractIds() (scripts/exec/extract.mjs) directly for exact block
// content (R1.S1/R1.S2), and the `extract` CLI subcommand (exec-tools.mjs)
// via spawnSync for the observable exit-code contract: 0 on success, non-zero
// naming the missing ID(s) when any requested ID isn't found in spec.md.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { extractIds } from '../../scripts/exec/extract.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'exec-tools.mjs');

const SPEC = `# Spec: Extractor Fixture

## Functional Requirements

### R2 — Second requirement

Depende de: —

The system SHALL deliver part B.

#### R2.S1 — Happy path
- GIVEN nothing
- WHEN task B runs
- THEN part B is done

#### R2.S2 — Another scenario
- GIVEN something else
- WHEN task C runs
- THEN part C is done

## Acceptance Criteria

- [ ] AC1 → R2.S1 [auto] — part B is delivered
- [ ] AC3 → R2.S2 [auto] — part C is delivered
`;

function writeSpecDir(specText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-test-'));
  fs.writeFileSync(path.join(dir, 'spec.md'), specText, 'utf8');
  return dir;
}

// --- R1.S1: scenario + AC IDs found -> exact verbatim blocks, exit 0 ---

test('extractIds: scenario ID returns the header + bullets, stopping before the next header', () => {
  const { blocks, missing } = extractIds(SPEC, ['R2.S1']);
  assert.deepEqual(missing, []);
  assert.equal(
    blocks.get('R2.S1'),
    '#### R2.S1 — Happy path\n- GIVEN nothing\n- WHEN task B runs\n- THEN part B is done',
  );
  assert.ok(!blocks.get('R2.S1').includes('R2.S2'));
});

test('extractIds: AC ID returns just its single checklist line', () => {
  const { blocks, missing } = extractIds(SPEC, ['AC3']);
  assert.deepEqual(missing, []);
  assert.equal(blocks.get('AC3'), '- [ ] AC3 → R2.S2 [auto] — part C is delivered');
});

test('CLI extract: found IDs print their blocks and exit 0', () => {
  const dir = writeSpecDir(SPEC);
  const res = spawnSync(process.execPath, [CLI, 'extract', dir, 'R2.S1', 'AC3'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /R2\.S1/);
  assert.match(res.stdout, /GIVEN nothing/);
  assert.match(res.stdout, /AC3/);
  assert.match(res.stdout, /part C is delivered/);
  assert.doesNotMatch(res.stdout, /R2\.S2 — Another scenario/);
});

// --- R1.S2: unknown ID -> non-zero exit, missing ID named, no fabricated block ---

test('extractIds: an ID not present in spec.md is reported missing, not fabricated', () => {
  const { blocks, missing } = extractIds(SPEC, ['R9.S9']);
  assert.deepEqual(missing, ['R9.S9']);
  assert.equal(blocks.has('R9.S9'), false);
});

test('CLI extract: unknown ID exits non-zero and names it, without printing an empty/invented block', () => {
  const dir = writeSpecDir(SPEC);
  const res = spawnSync(process.execPath, [CLI, 'extract', dir, 'R9.S9'], { encoding: 'utf8' });
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /R9\.S9/);
  assert.doesNotMatch(res.stdout, /---\s*R9\.S9\s*---/);
});
