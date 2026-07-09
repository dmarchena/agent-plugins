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

function skillMdPath(skill) {
  return path.join(SKILLS_DIR, skill, 'SKILL.md');
}

function hwmSkillMdPath(skill) {
  return path.join(HWM_FIXTURES_DIR, skill, 'SKILL.md');
}

/**
 * Integration entry point: reads the real SKILL.md and the HWM fixture for
 * each of the 4 tracked skills, derives ceilings, and checks budgets.
 *
 * @returns {{ exceeded: Array<{skill: string, count: number, ceiling: number}> }}
 */
export function runGuard() {
  const counts = {};
  const ceilings = {};

  for (const skill of SKILLS) {
    const realContent = fs.readFileSync(skillMdPath(skill), 'utf8');
    const hwmContent = fs.readFileSync(hwmSkillMdPath(skill), 'utf8');

    counts[skill] = estimateTokens(realContent);
    ceilings[skill] = deriveCeiling(estimateTokens(hwmContent));
  }

  return checkBudgets(counts, ceilings);
}

const isEntryPoint =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isEntryPoint) {
  const { exceeded } = runGuard();
  const exceededSkills = new Set(exceeded.map((e) => e.skill));

  for (const skill of SKILLS) {
    if (exceededSkills.has(skill)) {
      const entry = exceeded.find((e) => e.skill === skill);
      console.log(`${entry.skill}: ${entry.count} tok > techo ${entry.ceiling}`);
    } else {
      console.log(`${skill}: OK`);
    }
  }

  process.exit(exceeded.length === 0 ? 0 : 1);
}
