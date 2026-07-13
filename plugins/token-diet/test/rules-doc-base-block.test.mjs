import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = join(__dirname, '..', 'assets', 'token-diet-rules.md');

function getBaseSectionLines() {
  const content = readFileSync(RULES_PATH, 'utf8');

  const baseHeadingMatch = content.match(/^#{1,3}\s.*(base|caveman).*$/im);
  assert.ok(baseHeadingMatch, 'expected a section heading for the base decalogue ("base"/"caveman")');

  const baseStart = baseHeadingMatch.index + baseHeadingMatch[0].length;
  const rest = content.slice(baseStart);

  const nextHeadingMatch = rest.match(/^#{1,3}\s.*$/m);
  const baseSection = nextHeadingMatch ? rest.slice(0, nextHeadingMatch.index) : rest;

  return baseSection
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && (l.startsWith('-') || l.startsWith('*')));
}

test('R1.S1/AC1 — base section contains exactly 11 non-empty bullet lines', () => {
  const lines = getBaseSectionLines();
  assert.equal(
    lines.length,
    11,
    `expected the base section to hold exactly 11 non-empty bullet lines, found ${lines.length}`
  );
});

test('R1.S1/AC1 — the six new nuances are each identifiable by content in the base section', () => {
  const lines = getBaseSectionLines();
  const joined = lines.join('\n').toLowerCase();

  // 1. explore guardrail: locates, does not audit
  assert.ok(
    /does not audit/.test(joined) && /locates/.test(joined),
    'expected the explore/locate line to state it "locates" but "does not audit"'
  );

  // 2. delegation cost + explicit model pinning
  assert.ok(
    /pin/.test(joined) && /inherits/.test(joined),
    'expected the delegate line to mention pinning the cheap model explicitly and that the default inherits the expensive one'
  );

  // 3. batching threshold
  assert.ok(
    /≥2/.test(joined) && /independent/.test(joined),
    'expected the batch line to state a ≥2 independent-operations threshold'
  );

  // 4. resume-from-disk figures
  assert.ok(
    /~5k/.test(joined),
    'expected the cut-context line to mention the ~5K token figure for a disk-based resume'
  );

  // 5. plans/docs hierarchy (thin index + on-demand detail)
  assert.ok(
    /index/.test(joined),
    'expected the always-loaded-minimal line to extend the principle to plans/docs via a thin index'
  );

  // 6. brand-new line: grep all readers/consumers before a shape change
  assert.ok(
    /grep/.test(joined) && /readers/.test(joined),
    'expected a new line requiring grepping all readers/consumers before changing a shared datum\'s shape'
  );
});

test('R1.S2/AC2 — each of the 10 original semantic points is still present (enriched or verbatim)', () => {
  const lines = getBaseSectionLines();
  const joined = lines.join('\n').toLowerCase();

  const probes = [
    ['re-billed', /re-billed/],                 // context = cost
    ['grep before read', /grep before read/],   // read just enough
    ['batch/ONE message', /batch.*one message/],// batch independent tool calls
    ['script/CLI', /script\/cli/],              // deterministic -> script
    ['filter (verbose output)', /filter/],      // verbose output filtering
    ['cheapest model', /cheapest model/],       // delegate to cheapest model
    ['read-only subagent', /read-only subagent/], // explore via read-only subagent
    ['/clear', /\/clear/],                      // cut context
    ['always-loaded minimal', /always-loaded instructions minimal/], // keep instructions minimal
    ['cache', /break the cache/],               // don't break the cache
  ];

  for (const [label, re] of probes) {
    assert.ok(re.test(joined), `expected the base section to still contain the original "${label}" rule`);
  }
});
