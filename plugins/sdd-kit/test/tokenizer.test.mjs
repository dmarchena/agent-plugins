// Guard test for T1-tokenizer (docs/specs/sdd-kit-skill-token-budget).
// Verifies plugins/sdd-kit/scripts/tokenizer.mjs's estimateTokens():
//
//   R1.S1 - determinism + no npm deps/network: calling estimateTokens twice
//           on the same string returns the same integer, AND the source
//           file itself contains no import/require of a node_modules
//           package (only node:* or relative imports are allowed).
//   R1.S2 - basic monotonicity: a text that is a strict superset of another
//           (same text plus extra content) gets a strictly greater count
//           than the subset.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { estimateTokens } from '../scripts/tokenizer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKENIZER_PATH = path.join(__dirname, '..', 'scripts', 'tokenizer.mjs');

test('R1.S1 - estimateTokens is deterministic and tokenizer.mjs is stdlib-only (no node_modules imports)', () => {
  const text = 'The quick brown fox jumps over the lazy dog.';

  const first = estimateTokens(text);
  const second = estimateTokens(text);

  assert.equal(first, second, 'estimateTokens must return the same integer on repeated calls');
  assert.equal(Number.isInteger(first), true, 'estimateTokens must return an integer');

  const source = fs.readFileSync(TOKENIZER_PATH, 'utf8');
  const importLines = source
    .split('\n')
    .filter((line) => /^\s*import\b/.test(line) || /\brequire\(/.test(line));

  const nonStdlibImports = importLines.filter((line) => {
    // Allowed: `import ... from 'node:*'` and relative imports ('./' or '../').
    const isNodeBuiltin = /from\s+['"]node:[^'"]+['"]/.test(line);
    const isRelative = /from\s+['"]\.\.?\//.test(line);
    return !(isNodeBuiltin || isRelative);
  });

  assert.deepEqual(
    nonStdlibImports,
    [],
    'tokenizer.mjs must only import node:* builtins or relative modules, never a node_modules package',
  );
});

test('R1.S2 - estimateTokens is monotonic: superset text gets a strictly greater count than the subset', () => {
  const base = 'A short base sentence for testing.';
  const extended = base + ' And here is quite a bit of extra additional content appended after it.';

  const baseCount = estimateTokens(base);
  const extendedCount = estimateTokens(extended);

  assert.ok(
    extendedCount > baseCount,
    `expected estimateTokens(extended)=${extendedCount} > estimateTokens(base)=${baseCount}`,
  );
});
