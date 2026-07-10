// Per-skill token budget guard (task T2-budget-guard,
// docs/specs/sdd-kit-skill-token-budget). Derives a token ceiling for each
// SKILL.md from its high-water-mark (HWM) fixture — the commit at which the
// skill was smallest after the R1 slimming pass, c2ca119 — plus a fixed
// maintenance margin, and flags any skill whose current body exceeds it.
//
// Consumes estimateTokens() from tokenizer.mjs; does not reimplement it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { estimateTokens } from './tokenizer.mjs';
import { emitSuccess, parseFlags } from './lib/cli.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SDD_KIT_ROOT = path.join(__dirname, '..');
const SKILLS_DIR = path.join(SDD_KIT_ROOT, 'skills');
const HWM_FIXTURES_DIR = path.join(SDD_KIT_ROOT, 'test', 'fixtures', 'hwm-skills');

const SKILLS = ['spec-writer', 'plan-writer', 'plan-executor', 'verify'];

// Maintenance margin applied on top of the high-water-mark token count when
// deriving each skill's ceiling. Spec default: +5%.
export const MAINTENANCE_MARGIN = 0.05;

/**
 * Derive a token ceiling from a high-water-mark token count.
 *
 * @param {number} hwmTokenCount
 * @returns {number}
 */
export function deriveCeiling(hwmTokenCount) {
  return Math.floor(hwmTokenCount * (1 + MAINTENANCE_MARGIN));
}

/**
 * Pure comparison: for every skill present in `counts`, flag it if its count
 * exceeds its ceiling.
 *
 * @param {Record<string, number>} counts
 * @param {Record<string, number>} ceilings
 * @returns {{ exceeded: Array<{skill: string, count: number, ceiling: number}> }}
 */
export function checkBudgets(counts, ceilings) {
  const exceeded = [];
  for (const skill of Object.keys(counts)) {
    const count = counts[skill];
    const ceiling = ceilings[skill];
    if (count > ceiling) {
      exceeded.push({ skill, count, ceiling });
    }
  }
  return { exceeded };
}

function skillMdPath(skill, skillsDir) {
  return path.join(skillsDir, skill, 'SKILL.md');
}

function hwmSkillMdPath(skill, hwmFixturesDir) {
  return path.join(hwmFixturesDir, skill, 'SKILL.md');
}

/**
 * Integration entry point: reads the real SKILL.md and the HWM fixture for
 * each of the 4 tracked skills, derives ceilings, and checks budgets.
 *
 * `skillsDir`/`hwmFixturesDir` default to the real production locations;
 * they are only ever overridden in tests, to exercise a genuine
 * over-ceiling gate without touching the real skills.
 *
 * @param {{ skillsDir?: string, hwmFixturesDir?: string }} [options]
 * @returns {{
 *   exceeded: Array<{skill: string, count: number, ceiling: number}>,
 *   results: Array<{skill: string, count: number, ceiling: number, withinBudget: boolean}>,
 * }}
 */
export function runGuard({ skillsDir = SKILLS_DIR, hwmFixturesDir = HWM_FIXTURES_DIR } = {}) {
  const counts = {};
  const ceilings = {};

  for (const skill of SKILLS) {
    const realContent = fs.readFileSync(skillMdPath(skill, skillsDir), 'utf8');
    const hwmContent = fs.readFileSync(hwmSkillMdPath(skill, hwmFixturesDir), 'utf8');

    counts[skill] = estimateTokens(realContent);
    ceilings[skill] = deriveCeiling(estimateTokens(hwmContent));
  }

  const { exceeded } = checkBudgets(counts, ceilings);
  const exceededSkills = new Set(exceeded.map((e) => e.skill));

  const results = SKILLS.map((skill) => ({
    skill,
    count: counts[skill],
    ceiling: ceilings[skill],
    withinBudget: !exceededSkills.has(skill),
  }));

  return { exceeded, results };
}

const isEntryPoint =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isEntryPoint) {
  const flags = parseFlags();
  const options = {};
  if (typeof flags['skills-dir'] === 'string') options.skillsDir = flags['skills-dir'];
  if (typeof flags['hwm-dir'] === 'string') options.hwmFixturesDir = flags['hwm-dir'];

  const { results } = runGuard(options);
  const withinBudget = results.every((r) => r.withinBudget);

  emitSuccess({ results, withinBudget });
  process.exit(withinBudget ? 0 : 1);
}
