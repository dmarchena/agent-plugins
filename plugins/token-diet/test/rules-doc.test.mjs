import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = join(__dirname, '..', 'assets', 'rules.md');

test('R3/AC5 — el documento de reglas plugins/token-diet/assets/rules.md existe', () => {
  assert.ok(existsSync(RULES_PATH), `esperaba encontrar ${RULES_PATH}`);
});

test('R3/AC5 — el documento contiene una seccion de resumen base "caveman" de ~6-8 lineas no vacias', () => {
  const content = readFileSync(RULES_PATH, 'utf8');

  // Localiza la seccion de resumen base: un heading que mencione "base" o "caveman"
  const baseHeadingMatch = content.match(/^#{1,3}\s.*(base|caveman).*$/im);
  assert.ok(baseHeadingMatch, 'esperaba un heading de seccion para el resumen base ("base"/"caveman")');

  const baseStart = baseHeadingMatch.index + baseHeadingMatch[0].length;
  const rest = content.slice(baseStart);

  // La seccion base termina en el siguiente heading (el primer heading de "profile")
  const nextHeadingMatch = rest.match(/^#{1,3}\s.*$/m);
  const baseSection = nextHeadingMatch ? rest.slice(0, nextHeadingMatch.index) : rest;

  const nonEmptyBulletLines = baseSection
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && (l.startsWith('-') || l.startsWith('*')));

  assert.ok(
    nonEmptyBulletLines.length >= 6 && nonEmptyBulletLines.length <= 8,
    `esperaba ~6-8 lineas no vacias en el resumen base, encontre ${nonEmptyBulletLines.length}`
  );
});

test('R3/AC5 — el documento tiene al menos un heading de "profile" mas restrictivo tras el resumen base', () => {
  const content = readFileSync(RULES_PATH, 'utf8');

  const baseHeadingMatch = content.match(/^#{1,3}\s.*(base|caveman).*$/im);
  assert.ok(baseHeadingMatch, 'precondicion: debe existir el heading base');

  const afterBase = content.slice(baseHeadingMatch.index + baseHeadingMatch[0].length);

  const profileHeadingMatch = afterBase.match(/^#{1,3}\s.*profile.*$/im);
  assert.ok(
    profileHeadingMatch,
    'esperaba al menos un heading de seccion "profile" claramente separado despues del resumen base'
  );
});
