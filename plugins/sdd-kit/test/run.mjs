#!/usr/bin/env node
// Runner de tests para el validador plan-tools.mjs (skill plan-writer).
// Node ESM puro, solo stdlib (node:path, node:url, node:child_process).
//
// Ejecuta cada fixture como proceso hijo del validador y asevera exit code +
// substring esperado en stdout/stderr. Imprime una línea ✔/✘ por caso y un
// resumen final; exit 1 si algún caso falla, 0 si todos pasan.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const PLAN_TOOLS = path.join(__dirname, '..', 'scripts', 'plan-tools.mjs');

// Tabla declarativa de casos: nombre, subcomando + ficheros (relativos a
// fixtures/), exit code esperado, y substring esperado en stdout o stderr.
const CASES = [
  {
    name: 'valid: inspect-spec detecta requisitos y ACs',
    args: ['inspect-spec', 'valid/spec.md'],
    expectExit: 0,
    stream: 'stdout',
    substr: '4 requisitos, 5 ACs detectados',
  },
  {
    name: 'valid: check-plan acepta un plan bien formado',
    args: ['check-plan', 'valid/spec.md', 'valid/plan.json'],
    expectExit: 0,
    stream: 'stdout',
    substr: 'plan válido: 4 tareas',
  },
  {
    name: 'missing-ac-section: falta la sección Acceptance Criteria',
    args: ['inspect-spec', 'missing-ac-section/spec.md'],
    expectExit: 1,
    stream: 'stderr',
    substr: 'falta la sección Acceptance Criteria',
  },
  {
    name: 'no-r-ids: no se encontraron IDs R<n>',
    args: ['inspect-spec', 'no-r-ids/spec.md'],
    expectExit: 1,
    stream: 'stderr',
    substr: 'no se encontraron IDs R<n>',
  },
  {
    name: 'cyclic: detecta el ciclo de dependencias',
    args: ['check-plan', 'valid/spec.md', 'cyclic/plan.json'],
    expectExit: 1,
    stream: 'stderr',
    substr: 'ciclo:',
  },
  {
    name: 'uncovered-id: AC sin cubrir',
    args: ['check-plan', 'valid/spec.md', 'uncovered-id/plan.json'],
    expectExit: 1,
    stream: 'stderr',
    substr: 'AC sin cubrir:',
  },
  {
    name: 'invalid-schema: falta un campo requerido (model)',
    args: ['check-plan', 'valid/spec.md', 'invalid-schema/plan.json'],
    expectExit: 1,
    stream: 'stderr',
    substr: 'esquema:',
  },
  {
    name: 'bad-instructions-deps: instructions no referencia task previo',
    args: ['check-plan', 'valid/spec.md', 'bad-instructions-deps/plan.json'],
    expectExit: 1,
    stream: 'stderr',
    substr: 'instructions no referencia task previo:',
  },
  {
    name: 'bad-instructions-nodeps: tarea sin dependencias referencia task_id',
    args: ['check-plan', 'valid/spec.md', 'bad-instructions-nodeps/plan.json'],
    expectExit: 1,
    stream: 'stderr',
    substr: 'tarea sin dependencias referencia task_id:',
  },
  {
    name: 'empty-output-schema: expected_output_schema vacío rechazado',
    args: ['check-plan', 'valid/spec.md', 'empty-output-schema/plan.json'],
    expectExit: 1,
    stream: 'stderr',
    substr: 'esquema:',
  },
];

// Los argumentos que terminan en .md/.json son rutas de fixtures relativas;
// el resto (el subcomando) se pasa tal cual.
function resolveArgs(args) {
  return args.map((a) =>
    a.endsWith('.md') || a.endsWith('.json') ? path.join(FIXTURES_DIR, a) : a
  );
}

let failures = 0;

for (const testCase of CASES) {
  const args = resolveArgs(testCase.args);
  const result = spawnSync(process.execPath, [PLAN_TOOLS, ...args], {
    encoding: 'utf8',
  });

  const exitOk = result.status === testCase.expectExit;
  const haystack = testCase.stream === 'stdout' ? result.stdout : result.stderr;
  const substrOk = haystack.includes(testCase.substr);

  if (exitOk && substrOk) {
    console.log(`✔ ${testCase.name}`);
  } else {
    failures++;
    console.log(`✘ ${testCase.name}`);
    console.log(
      `  esperado: exit ${testCase.expectExit}, ${testCase.stream} contiene "${testCase.substr}"`
    );
    console.log(
      `  obtenido: exit ${result.status}, stdout=${JSON.stringify(
        result.stdout
      )}, stderr=${JSON.stringify(result.stderr)}`
    );
  }
}

console.log('');
if (failures > 0) {
  console.log(`✘ ${failures}/${CASES.length} casos fallidos`);
  process.exit(1);
} else {
  console.log(`✔ ${CASES.length}/${CASES.length} casos correctos`);
  process.exit(0);
}
