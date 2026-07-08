# Spec: fixture-sample (verify-tools test fixture)

## Purpose

Minimal fixture spec used by verify-tools tests. Not a real feature.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — sample automatic criterion one, description
  wraps onto a second line to exercise multi-line parsing.
- [ ] AC2 → R1.S2 [manual] — sample manual criterion two, requires human
  confirmation.
- [ ] AC3 → R2.S1 [auto] — sample automatic criterion three.
- [ ] AC4 → R3 [manual] — sample criterion referencing a bare requirement
  (no scenario suffix), to exercise refs like "R3" rather than "R3.S1".
