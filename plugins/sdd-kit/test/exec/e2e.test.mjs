// test/exec/e2e.test.mjs — T8-e2e (R-E2E / R-E2E.S1 / AC-E2E)
//
// Recorrido integrador de la fase exec de extremo a extremo. La skill delega el
// ciclo TDD en subagentes LLM (no reproducibles en un test), así que aquí se
// STUBBEA al ejecutor: por cada tarea del fixture se escriben un test y una
// implementación triviales que pasan, y se conduce el CLI exec-tools.mjs con la
// misma secuencia que prescribe SKILL.md (init → next → complete… → report).
// Se verifica la glue real: tandas del DAG (2 en paralelo, 1 después), un commit
// de tarea por tarea en la rama ia/<slug>, estado con las 3 done y consumos
// rellenos, re-run final verde e informe con real vs estimado y ACs cubiertos.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'exec-tools.mjs');
const SLUG = 'e2e-demo';

// --- fixture: spec de 3 requisitos (R1, R2 independientes; R3 depende de ambos) ---

const SPEC = `# Spec: Fixture E2E

## Purpose

Fixture mínimo para el recorrido integrador de la fase exec.

## Scope

**In scope:**
- Tres requisitos: dos independientes y uno dependiente.

**Out of scope (non-goals):**
- Nada más.

## Functional Requirements

### R1 — Primer requisito independiente

Depende de: —

The system SHALL entregar la parte A.

#### R1.S1 — Happy path
- GIVEN nada
- WHEN se ejecuta la tarea A
- THEN la parte A queda hecha

### R2 — Segundo requisito independiente

Depende de: —

The system SHALL entregar la parte B.

#### R2.S1 — Happy path
- GIVEN nada
- WHEN se ejecuta la tarea B
- THEN la parte B queda hecha

### R3 — Requisito dependiente

Depende de: R1, R2

The system SHALL entregar la parte C que combina A y B.

#### R3.S1 — Happy path
- GIVEN A y B hechas
- WHEN se ejecuta la tarea C
- THEN la parte C queda hecha

## Technical Requirements

- **Stack / framework:** N/A (fixture de test).
- **Integraciones:** N/A
- **Rendimiento:** N/A
- **Seguridad / privacidad:** N/A
- **Datos / almacenamiento:** N/A
- **Restricciones adicionales:** N/A

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — la parte A queda hecha
- [ ] AC2 → R2.S1 [auto] — la parte B queda hecha
- [ ] AC3 → R3.S1 [auto] — la parte C queda hecha

## Assumptions & Open Questions

- Ninguna.
`;

const PLAN = {
  plan_id: 'e2e-demo-plan',
  project_name: 'Fixture E2E',
  global_objective: 'Recorrido integrador de la fase exec con 3 tareas.',
  source_spec: 'spec.md',
  confidence: 'low',
  estimated_tokens_total: 3000,
  tasks: [
    {
      task_id: 'task-a',
      source_ids: ['R1.S1'],
      dependencies: [],
      agent_type: 'code_writer',
      subagent: 'general-purpose',
      model: 'sonnet',
      justification: 'Entrega acotada de la parte A con AC claro.',
      instructions: 'Implementa la parte A referenciando el escenario R1.S1 del spec.',
      expected_output_schema: 'Parte A implementada y su test en verde',
      satisfies_acs: ['AC1'],
      estimated_tokens: 1000,
      actual_tokens: null,
      deviation: null,
      test_contract: [
        { ref: 'R1.S1', assertion: 'La parte A queda hecha y su test pasa' },
      ],
    },
    {
      task_id: 'task-b',
      source_ids: ['R2.S1'],
      dependencies: [],
      agent_type: 'code_writer',
      subagent: 'general-purpose',
      model: 'sonnet',
      justification: 'Entrega acotada de la parte B con AC claro.',
      instructions: 'Implementa la parte B referenciando el escenario R2.S1 del spec.',
      expected_output_schema: 'Parte B implementada y su test en verde',
      satisfies_acs: ['AC2'],
      estimated_tokens: 1000,
      actual_tokens: null,
      deviation: null,
      test_contract: [
        { ref: 'R2.S1', assertion: 'La parte B queda hecha y su test pasa' },
      ],
    },
    {
      task_id: 'task-c',
      source_ids: ['R3.S1'],
      dependencies: ['task-a', 'task-b'],
      agent_type: 'code_writer',
      subagent: 'general-purpose',
      model: 'sonnet',
      justification: 'Combina las salidas de task-a y task-b; depende de ambas.',
      instructions: 'Implementa la parte C referenciando R3.S1; combina las salidas de task-a y task-b.',
      expected_output_schema: 'Parte C implementada y su test en verde',
      satisfies_acs: ['AC3'],
      estimated_tokens: 1000,
      actual_tokens: null,
      deviation: null,
      test_contract: [
        { ref: 'R3.S1', assertion: 'La parte C queda hecha y su test pasa' },
      ],
    },
  ],
  coverage: {
    requirements: { R1: ['task-a'], R2: ['task-b'], R3: ['task-c'] },
    acs: { AC1: ['task-a'], AC2: ['task-b'], AC3: ['task-c'] },
  },
};

// --- helpers ------------------------------------------------------------------

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

// Invoca el CLI y devuelve el JSON parseado de stdout.
function cli(repo, args) {
  const out = execFileSync('node', [CLI, ...args], { cwd: repo, encoding: 'utf8' });
  return JSON.parse(out);
}

// Stub del ejecutor: escribe impl + test que pasan y devuelve el comando de re-run.
function simulateExecutor(repo, taskId, ref) {
  fs.mkdirSync(path.join(repo, 'impl'), { recursive: true });
  fs.mkdirSync(path.join(repo, 't'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'impl', `${taskId}.mjs`), `export const done = true;\n`);
  fs.writeFileSync(
    path.join(repo, 't', `${taskId}.test.mjs`),
    `import { test } from 'node:test';\n`
    + `import assert from 'node:assert';\n`
    + `import { done } from '../impl/${taskId}.mjs';\n`
    + `test('${taskId} satisface ${ref}', () => { assert.strictEqual(done, true); });\n`,
  );
  return `node --test t/${taskId}.test.mjs`;
}

// Ejecuta una tarea como lo haría la skill: stub del ejecutor + complete con
// evidencia rojo→verde correcta (--rojo fail = el test falla antes de implementar).
function runTask(repo, specDir, taskId, ref) {
  const testCmd = simulateExecutor(repo, taskId, ref);
  return cli(repo, [
    'complete', specDir, taskId,
    '--tokens', '1200',
    '--test-cmd', testCmd,
    '--rojo', 'fail',
    '--verde', 'pass',
  ]);
}

// --- test ---------------------------------------------------------------------

test('AC-E2E: recorrido integrador de 3 tareas (2 paralelas + 1 dependiente)', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-e2e-'));
  try {
    // Fixture en docs/specs/<slug>/ y repo git en la rama principal.
    const specDir = path.join('docs', 'specs', SLUG);
    const absSpecDir = path.join(repo, specDir);
    fs.mkdirSync(absSpecDir, { recursive: true });
    fs.writeFileSync(path.join(absSpecDir, 'spec.md'), SPEC);
    fs.writeFileSync(path.join(absSpecDir, 'execution_plan.json'), JSON.stringify(PLAN, null, 2));

    git(repo, ['init', '-b', 'main']);
    git(repo, ['config', 'user.email', 't@t.t']);
    git(repo, ['config', 'user.name', 'test']);
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-qm', 'fixture']);
    const mainHead = git(repo, ['rev-parse', 'HEAD']);

    // 1. init: valida el plan, crea rama + estado, primera tanda = las 2 independientes.
    const init = cli(repo, ['init', specDir]);
    assert.strictEqual(init.ok, true, 'init debe validar el plan');
    assert.strictEqual(init.branch, `ia/${SLUG}`);
    assert.strictEqual(init.branch_created, true);
    assert.strictEqual(init.total_tasks, 3);
    assert.deepStrictEqual([...init.first_batch].sort(), ['task-a', 'task-b'],
      'la primera tanda son las 2 tareas independientes (2 en paralelo)');

    // 2. next: confirma la tanda ejecutable.
    const batch1 = cli(repo, ['next', specDir]);
    assert.strictEqual(batch1.status, 'run');
    assert.deepStrictEqual([...batch1.batch].sort(), ['task-a', 'task-b']);

    // 3. Ejecuta las 2 independientes; cada complete verifica y commitea.
    const doneA = runTask(repo, specDir, 'task-a', 'R1.S1');
    const doneB = runTask(repo, specDir, 'task-b', 'R2.S1');
    for (const [d, id] of [[doneA, 'task-a'], [doneB, 'task-b']]) {
      assert.strictEqual(d.status, 'done', `${id} debe quedar done`);
      assert.ok(d.commit, `${id} debe tener commit`);
      assert.strictEqual(d.deviation, 200, `${id} deviation = 1200 - 1000`);
    }

    // 4. next: ahora la dependiente entra en tanda (1 después de las 2).
    const batch2 = cli(repo, ['next', specDir]);
    assert.strictEqual(batch2.status, 'run');
    assert.deepStrictEqual(batch2.batch, ['task-c'],
      'task-c solo es ejecutable tras completarse sus dos dependencias');

    // 5. Ejecuta la dependiente.
    const doneC = runTask(repo, specDir, 'task-c', 'R3.S1');
    assert.strictEqual(doneC.status, 'done');
    assert.ok(doneC.commit);

    // 6. next: no quedan tareas → complete.
    const end = cli(repo, ['next', specDir]);
    assert.strictEqual(end.status, 'complete');
    assert.strictEqual(end.counts.done, 3);

    // 7. Rama ia/<slug> con exactamente 3 commits de tarea; main intacta.
    assert.strictEqual(git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']), `ia/${SLUG}`);
    const taskCommits = git(repo, ['rev-list', '--count', 'HEAD', '^main']);
    assert.strictEqual(taskCommits, '3', 'exactamente 3 commits de tarea sobre main');
    assert.strictEqual(git(repo, ['rev-parse', 'main']), mainHead, 'main no recibe commits');
    // Cada commit de tarea contiene su test + su implementación.
    for (const id of ['task-a', 'task-b', 'task-c']) {
      const files = git(repo, ['log', '--all', '--pretty=format:', '--name-only',
        '--diff-filter=A', '--', `t/${id}.test.mjs`, `impl/${id}.mjs`]);
      assert.ok(files.includes(`t/${id}.test.mjs`), `${id}: test versionado`);
      assert.ok(files.includes(`impl/${id}.mjs`), `${id}: impl versionada`);
    }

    // 8. Estado: 3 done con consumos rellenos; plan byte-idéntico al original.
    const state = JSON.parse(fs.readFileSync(path.join(absSpecDir, 'execution_state.json'), 'utf8'));
    for (const id of ['task-a', 'task-b', 'task-c']) {
      assert.strictEqual(state.tasks[id].status, 'done');
      assert.strictEqual(state.tasks[id].actual_tokens, 1200);
      assert.strictEqual(state.tasks[id].deviation, 200);
      assert.ok(state.tasks[id].test_cmd, `${id}: test_cmd registrado`);
    }
    const planOnDisk = fs.readFileSync(path.join(absSpecDir, 'execution_plan.json'), 'utf8');
    assert.strictEqual(planOnDisk, JSON.stringify(PLAN, null, 2), 'execution_plan.json inmutable');

    // 9. Re-run final: todos los tests de las tareas done siguen en verde.
    for (const id of ['task-a', 'task-b', 'task-c']) {
      assert.doesNotThrow(
        () => execFileSync('node', ['--test', `t/${id}.test.mjs`], { cwd: repo, stdio: 'pipe' }),
        `${id}: re-run final debe salir verde`,
      );
    }

    // 10. Informe final: real vs estimado (total y por tarea) y ACs cubiertos.
    const report = cli(repo, ['report', specDir]);
    assert.strictEqual(report.status, 'report');
    assert.strictEqual(report.branch, `ia/${SLUG}`);
    assert.strictEqual(report.counts.done, 3);
    assert.strictEqual(report.counts.blocked, 0);
    assert.strictEqual(report.counts.skipped, 0);
    assert.strictEqual(report.tokens.real, 3600); // 3 × 1200
    assert.strictEqual(report.tokens.estimated, 3000); // 3 × 1000
    assert.strictEqual(report.per_task.length, 3);
    for (const pt of report.per_task) {
      assert.strictEqual(pt.actual_tokens, 1200);
      assert.strictEqual(pt.deviation, 200);
    }
    assert.deepStrictEqual(report.acs_satisfechos, ['AC1', 'AC2', 'AC3']);
    assert.strictEqual(report.pause, null, 'sin pausa de presupuesto');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
