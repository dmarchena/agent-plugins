# Spec: Token Reduction E2E Fixture

## Purpose

Multi-batch fixture for the token-reduction E2E test (R-E2E.S1): a first
batch of 3 independent tasks (parallel), one of which fails its first
attempt and succeeds on retry, followed by a dependent task that combines
the three.

## Scope

**In scope:**
- Three independent requirements (R1, R2, R3) closable as one parallel
  batch.
- One dependent requirement (R4) that combines the three.

**Out of scope (non-goals):**
- Nothing else.

## Functional Requirements

### R1 — First independent requirement

Depende de: —

The system SHALL deliver part A.

#### R1.S1 — Happy path
- GIVEN nothing
- WHEN task A runs
- THEN part A is done

### R2 — Second independent requirement

Depende de: —

The system SHALL deliver part B.

#### R2.S1 — Happy path
- GIVEN nothing
- WHEN task B runs
- THEN part B is done (first attempt fails, retry succeeds)

### R3 — Third independent requirement

Depende de: —

The system SHALL deliver part C.

#### R3.S1 — Happy path
- GIVEN nothing
- WHEN task C runs
- THEN part C is done

### R4 — Dependent requirement

Depende de: R1, R2, R3

The system SHALL deliver part D, which combines A, B and C.

#### R4.S1 — Happy path
- GIVEN A, B and C are done
- WHEN task D runs
- THEN part D is done

## Technical Requirements

- **Stack / framework:** N/A (test fixture).
- **Integrations:** N/A
- **Performance:** N/A
- **Security / privacy:** N/A
- **Data / storage:** N/A
- **Additional constraints:** N/A

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — part A is done
- [ ] AC2 → R2.S1 [auto] — part B is done
- [ ] AC3 → R3.S1 [auto] — part C is done
- [ ] AC4 → R4.S1 [auto] — part D is done

## Assumptions & Open Questions

- None.
