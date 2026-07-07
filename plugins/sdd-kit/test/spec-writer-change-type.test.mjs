// Test for R1.S1-R1.S4 (AC1-AC4): spec-writer's "change type" interview step
// — presenting feat/fix/chore/refactor/docs with a recommendation, flagging
// the dominant-side-vs-split tradeoff for mixed fix+feature one-liners,
// pre-supplied leading-argument-word match-and-echo, and the non-matching
// fallback to asking interactively — plus the supporting template/command
// changes (Change type: line, argument-hint).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// plugins/sdd-kit/test/ -> plugins/sdd-kit/
const PLUGIN_ROOT = path.join(__dirname, '..');

const SKILL_MD = path.join(PLUGIN_ROOT, 'skills', 'spec-writer', 'SKILL.md');
const INTERVIEW_STEPS = path.join(
  PLUGIN_ROOT,
  'skills',
  'spec-writer',
  'assets',
  'interview-steps.md'
);
const SPEC_TEMPLATE = path.join(
  PLUGIN_ROOT,
  'skills',
  'spec-writer',
  'assets',
  'spec-template.md'
);
const SPEC_COMMAND = path.join(PLUGIN_ROOT, 'commands', 'spec.md');

const skillMd = fs.readFileSync(SKILL_MD, 'utf8');
const interviewSteps = fs.readFileSync(INTERVIEW_STEPS, 'utf8');
const specTemplate = fs.readFileSync(SPEC_TEMPLATE, 'utf8');
const specCommand = fs.readFileSync(SPEC_COMMAND, 'utf8');

const TYPE_LIST_RE = /feat.{0,10}fix.{0,10}chore.{0,10}refactor.{0,10}docs/is;

test('ref R1.S1/AC1: SKILL.md and interview-steps.md present feat/fix/chore/refactor/docs as change-type options with one recommended', () => {
  for (const [name, content] of [
    ['SKILL.md', skillMd],
    ['interview-steps.md', interviewSteps],
  ]) {
    assert.match(
      content,
      TYPE_LIST_RE,
      `${name} should list feat/fix/chore/refactor/docs as change-type options`
    );
    assert.match(
      content,
      /recommended/i,
      `${name} should mark one change-type option as recommended`
    );
    assert.match(
      content,
      /Change type:\s*<value>/,
      `${name} should describe recording a "Change type: <value>" line`
    );
  }
});

test('ref R1.S2/AC2: SKILL.md and interview-steps.md flag the dominant-side-vs-split tradeoff for a mixed fix+feature one-liner instead of guessing', () => {
  for (const [name, content] of [
    ['SKILL.md', skillMd],
    ['interview-steps.md', interviewSteps],
  ]) {
    assert.match(
      content,
      /dominant[\/-]larger side/i,
      `${name} should mention classifying by the dominant/larger side of the change`
    );
    assert.match(
      content,
      /split.{0,40}(two separate specs|into two)/is,
      `${name} should mention splitting into two separate specs as the alternative`
    );
    assert.match(
      content,
      /don'?t (guess|silently classify)/i,
      `${name} should say not to guess/silently classify a mixed one-liner`
    );
  }
});

test('ref R1.S3/AC3: SKILL.md and interview-steps.md describe the leading-argument-word match-and-echo behavior with no separate confirmation question', () => {
  for (const [name, content] of [
    ['SKILL.md', skillMd],
    ['interview-steps.md', interviewSteps],
  ]) {
    assert.match(
      content,
      /leading word/i,
      `${name} should reference the leading argument word`
    );
    assert.match(
      content,
      /case-insensitively matches/i,
      `${name} should describe a case-insensitive match against the five types`
    );
    assert.match(
      content,
      /echo/i,
      `${name} should describe echoing the recognized type back`
    );
    // The skip must be explicit, not merely implied.
    assert.match(
      content,
      /skip(s|ped)?( step 2| the change-type question)?/i,
      `${name} should explicitly say the change-type question is skipped`
    );
  }
});

test('ref R1.S4/AC4: SKILL.md and interview-steps.md describe the fallback where a non-matching leading word means the whole text is the one-liner and the question is asked interactively', () => {
  for (const [name, content] of [
    ['SKILL.md', skillMd],
    ['interview-steps.md', interviewSteps],
  ]) {
    assert.match(
      content,
      /doesn'?t match/i,
      `${name} should cover the case where the leading word doesn't match any of the five types`
    );
    assert.match(
      content,
      /whole (argument text|text)/i,
      `${name} should say the whole text is treated as the one-liner in the fallback case`
    );
  }
});

test('ref R1.S1/AC1: spec-template.md has a "Change type: {feat|fix|chore|refactor|docs}" line under Purpose', () => {
  const purposeMatch = specTemplate.match(
    /## Purpose\n([\s\S]*?)(?=\n## )/
  );
  assert.ok(purposeMatch, 'spec-template.md should have a "## Purpose" section');
  assert.match(
    purposeMatch[1],
    /^Change type:\s*\{feat\|fix\|chore\|refactor\|docs\}\s*$/m,
    'the Purpose section should contain a "Change type: {feat|fix|chore|refactor|docs}" line'
  );
});

test('ref R1.S3/R1.S4/AC3/AC4: commands/spec.md argument-hint reflects the optional leading type word', () => {
  const hintMatch = specCommand.match(/argument-hint:\s*"([^"]*)"/);
  assert.ok(hintMatch, 'commands/spec.md should declare an argument-hint');
  assert.match(
    hintMatch[1],
    /\[feat\|fix\|chore\|refactor\|docs\]/,
    'argument-hint should show the type word as an optional bracketed alternative'
  );
});
