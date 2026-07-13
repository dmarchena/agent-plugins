// Content-assertion test for R4/R4.S1 (docs/specs/token-estimator-calibration):
// plan-writer's "Token budget estimate" guidance in task-fields-detail.md must
// (a) instruct weighting accumulated prior context to read over a task's
// nominal complexity when estimating, and (b) link to the calibration
// snapshot by a relative path that actually resolves on disk.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.join(
  __dirname,
  '..',
  'skills',
  'plan-writer',
  'assets',
  'task-fields-detail.md'
);

const content = fs.readFileSync(DOC_PATH, 'utf8');

test('R4.S1 — guidance instructs weighting prior context to read over nominal task complexity', () => {
  assert.match(
    content,
    /prior context/i,
    'should reference "prior context" as the estimation driver'
  );
  assert.match(
    content,
    /nominal complexity/i,
    'should name "nominal complexity" as the thing NOT to estimate by'
  );
  // The instruction must favor prior context over nominal complexity, not
  // just mention both terms in unrelated sentences.
  assert.match(
    content,
    /weigh|prioriti[sz]e|favor/i,
    'should contain a weighting/prioritization instruction, not just a mention'
  );
});

test('R4.S1 — guidance contains a relative-path link to the calibration snapshot, and the linked file exists', () => {
  const linkMatch = content.match(/([\w./-]*calibration-snapshot\.md)/);
  assert.ok(linkMatch, 'should contain a reference to calibration-snapshot.md');

  const linkPath = linkMatch[1];
  assert.ok(
    !path.isAbsolute(linkPath),
    'the calibration-snapshot.md reference should be a relative path, not absolute'
  );

  const resolved = path.resolve(path.dirname(DOC_PATH), linkPath);
  assert.ok(
    fs.existsSync(resolved),
    `the linked file should exist on disk at ${resolved}`
  );
});
