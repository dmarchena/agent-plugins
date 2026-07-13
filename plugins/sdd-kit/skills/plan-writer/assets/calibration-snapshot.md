| plan_slug | task_id | agent_type | task_index | dependencies | plan_size | estimated_tokens | actual_tokens | deviation_pct |
|---|---|---|---|---|---|---|---|---|
| change-type-versioning-policy | t1-spec-writer-change-type | doc_writer | 0 | 0 | 8 | 9000 | 80000 | +789% |
| change-type-versioning-policy | t2-branch-prefix | code_writer | 1 | 1 | 8 | 14000 | 50000 | +257% |
| change-type-versioning-policy | t3-agents-md-versioning | code_writer | 2 | 0 | 8 | 7000 | 35000 | +400% |
| change-type-versioning-policy | t4-versioning-check | code_writer | 3 | 2 | 8 | 16000 | 55000 | +244% |
| change-type-versioning-policy | t5-validate-wiring | code_writer | 4 | 3 | 8 | 8000 | 55000 | +588% |
| change-type-versioning-policy | t6-verify-gate | code_writer | 5 | 1 | 8 | 14000 | 65000 | +364% |
| change-type-versioning-policy | t7-repo-config | code_writer | 6 | 2 | 8 | 5000 | 9000 | +80% |
| change-type-versioning-policy | t8-e2e-full-flow | reviewer | 7 | 7 | 8 | 4000 | 55000 | +1275% |
| executor-minimal-brief | T1-extractor | code_writer | 0 | 0 | 3 | 60000 | 35000 | -42% |
| executor-minimal-brief | T2-brief | code_writer | 1 | 1 | 3 | 50000 | 35000 | -30% |
| executor-minimal-brief | T3-e2e | terminal_operator | 2 | 2 | 3 | 25000 | 22671 | -9% |
| executor-minimal-return | T1-contract | code_writer | 0 | 0 | 2 | 40000 | 65000 | +63% |
| executor-minimal-return | T2-e2e | terminal_operator | 1 | 1 | 2 | 20000 | 21000 | +5% |
| executor-scoped-commit | T1-scoped-commit | code_writer | 0 | 0 | 2 | 45000 | 115323 | +156% |
| executor-scoped-commit | T2-e2e | terminal_operator | 1 | 1 | 2 | 15000 | 37730 | +152% |
| fix-commit-state-ordering | R1-fix-ordering | code_writer | 0 | 0 | 3 | 200000 | 64356 | -68% |
| fix-commit-state-ordering | R2-invariant-guard | code_writer | 1 | 0 | 3 | 180000 | 59561 | -67% |
| fix-commit-state-ordering | e2e | code_writer | 2 | 2 | 3 | 150000 | 65154 | -57% |
| forensics-analysis | t1-signals-block | code_writer | 0 | 0 | 5 | 80000 | 55000 | -31% |
| forensics-analysis | t2-analysis-validation | code_writer | 1 | 1 | 5 | 90000 | 76724 | -15% |
| forensics-analysis | t3-skill-judgment-layer | doc_writer | 2 | 2 | 5 | 40000 | 59029 | +48% |
| forensics-analysis | t4-token-diet-analysis | reviewer | 3 | 3 | 5 | 50000 | 46012 | -8% |
| forensics-analysis | t5-e2e-integration | code_writer | 4 | 3 | 5 | 50000 | 63158 | +26% |
| forensics-analysis-validate-cli | cli-entry-point | code_writer | 0 | 0 | 4 | 70000 | 35000 | -50% |
| forensics-analysis-validate-cli | skill-doc-update | doc_writer | 1 | 1 | 4 | 40000 | 55000 | +38% |
| forensics-analysis-validate-cli | signal-anchoring-multiline-fix | code_writer | 2 | 0 | 4 | 60000 | 30000 | -50% |
| forensics-analysis-validate-cli | e2e-cli-multiline-signal | code_writer | 3 | 3 | 4 | 55000 | 45000 | -18% |
| forensics-persist-ids | t1-auto-default-sessionid | code_writer | 0 | 0 | 3 | 45000 | 59447 | +32% |
| forensics-persist-ids | t2-wire-agentid-contract | doc_writer | 1 | 0 | 3 | 25000 | 41630 | +67% |
| forensics-persist-ids | t3-e2e-forensics-resolves | code_writer | 2 | 2 | 3 | 50000 | 61893 | +24% |
| multi-platform-marketplace | t1-enrich-marketplace | code_writer | 0 | 0 | 6 | 30000 | 38710 | +29% |
| multi-platform-marketplace | t2-generator-derive | code_writer | 1 | 0 | 6 | 120000 | 76780 | -36% |
| multi-platform-marketplace | t3-llmstxt | doc_writer | 2 | 0 | 6 | 25000 | 41598 | +66% |
| multi-platform-marketplace | t4-contributor-docs | doc_writer | 3 | 2 | 6 | 40000 | 43390 | +8% |
| multi-platform-marketplace | t5-scaffold-create | code_writer | 4 | 1 | 6 | 90000 | 73400 | -18% |
| multi-platform-marketplace | t6-e2e-verify | verifier | 5 | 5 | 6 | 30000 | 34640 | +15% |
| sdd-kit-skill-token-budget | T1-tokenizer | code_writer | 0 | 0 | 5 | 8000 | 37767 | +372% |
| sdd-kit-skill-token-budget | T2-budget-guard | code_writer | 1 | 1 | 5 | 10000 | 50195 | +402% |
| sdd-kit-skill-token-budget | T3-trim-skills | doc_writer | 2 | 1 | 5 | 15000 | 209461 | +1296% |
| sdd-kit-skill-token-budget | T4-wire-validate | terminal_operator | 3 | 1 | 5 | 3000 | 30940 | +931% |
| sdd-kit-skill-token-budget | T5-e2e-verify | verifier | 4 | 3 | 5 | 4000 | 37173 | +829% |
| sdd-kit-token-reduction | R1-anchors | doc_writer | 0 | 0 | 5 | 120000 | 79587 | -34% |
| sdd-kit-token-reduction | R1-slim | code_writer | 1 | 1 | 5 | 500000 | 210373 | -58% |
| sdd-kit-token-reduction | R2-batch | code_writer | 2 | 0 | 5 | 300000 | 157637 | -47% |
| sdd-kit-token-reduction | R3-filter | code_writer | 3 | 0 | 5 | 250000 | 48399 | -81% |
| sdd-kit-token-reduction | e2e | code_writer | 4 | 3 | 5 | 300000 | 101600 | -66% |
| sdd-verify-cli-and-budget-pause | T1-verify-cli | code_writer | 0 | 0 | 4 | 70000 | 55000 | -21% |
| sdd-verify-cli-and-budget-pause | T2-drop-budget-pause | code_writer | 1 | 0 | 4 | 40000 | 45000 | +13% |
| sdd-verify-cli-and-budget-pause | T3-verify-skill-cli | doc_writer | 2 | 1 | 4 | 30000 | 55000 | +83% |
| sdd-verify-cli-and-budget-pause | T4-e2e-test | code_writer | 3 | 2 | 4 | 45000 | 42000 | -7% |
| shared-scripts-and-real-cost | T1-vendoring-build | code_writer | 0 | 0 | 7 | 38000 | 54439 | +43% |
| shared-scripts-and-real-cost | T2-drift-check | code_writer | 1 | 1 | 7 | 24000 | 58505 | +144% |
| shared-scripts-and-real-cost | T3-shared-source-of-truth | code_writer | 2 | 2 | 7 | 18000 | 61371 | +241% |
| shared-scripts-and-real-cost | T4-real-cost-compute | code_writer | 3 | 1 | 7 | 46000 | 72995 | +59% |
| shared-scripts-and-real-cost | T5-exec-report-signal | code_writer | 4 | 1 | 7 | 40000 | 85040 | +113% |
| shared-scripts-and-real-cost | T6-verify-report | code_writer | 5 | 1 | 7 | 28000 | 103698 | +270% |
| shared-scripts-and-real-cost | T7-e2e-suite | verifier | 6 | 6 | 7 | 15000 | 42960 | +186% |
| spec-forensics | exec-persist-agentid | code_writer | 0 | 0 | 6 | 90000 | 84296 | -6% |
| spec-forensics | forensics-per-task | code_writer | 1 | 1 | 6 | 110000 | 68302 | -38% |
| spec-forensics | forensics-orchestrator-pause | code_writer | 2 | 1 | 6 | 80000 | 61173 | -24% |
| spec-forensics | forensics-readonly-degrade | code_writer | 3 | 1 | 6 | 70000 | 53231 | -24% |
| spec-forensics | forensics-skill | doc_writer | 4 | 4 | 6 | 50000 | 52322 | +5% |
| spec-forensics | forensics-e2e-integration | code_writer | 5 | 5 | 6 | 90000 | 56641 | -37% |
| spec-forensics-report-delegation | T1 | code_writer | 0 | 0 | 3 | 40000 | 56114 | +40% |
| spec-forensics-report-delegation | T2 | code_writer | 1 | 0 | 3 | 35000 | 59694 | +71% |
| spec-forensics-report-delegation | T3 | verifier | 2 | 2 | 3 | 15000 | 23045 | +54% |
| token-cost-cli | T1-model-weighting | code_writer | 0 | 0 | 5 | 34000 | 28000 | -18% |
| token-cost-cli | T2-scan-split | code_writer | 1 | 1 | 5 | 40000 | 45000 | +13% |
| token-cost-cli | T3-io | code_writer | 2 | 1 | 5 | 34000 | 45000 | +32% |
| token-cost-cli | T4-wire-skill | doc_writer | 3 | 2 | 5 | 22000 | 35000 | +59% |
| token-cost-cli | T5-e2e | verifier | 4 | 3 | 5 | 16000 | 1200 | -92% |
| token-diet | rules-doc | doc_writer | 0 | 0 | 6 | 50000 | 38756 | -22% |
| token-diet | cmd-base | doc_writer | 1 | 0 | 6 | 90000 | 73108 | -19% |
| token-diet | cmd-recommend | doc_writer | 2 | 1 | 6 | 50000 | 45813 | -8% |
| token-diet | cmd-apply | doc_writer | 3 | 2 | 6 | 60000 | 52496 | -13% |
| token-diet | e2e-verify | verifier | 4 | 4 | 6 | 30000 | 27934 | -7% |
| token-diet | semantic-review | reviewer | 5 | 2 | 6 | 40000 | 46766 | +17% |
| trim-cli-data | T2_baseline_measurements | doc_writer | 1 | 0 | 8 | 90000 | 104675 | +16% |
| trim-cli-data | T3_contract_doc | doc_writer | 2 | 2 | 8 | 60000 | 58102 | -3% |
| trim-cli-data | T4_trim_dead_fields | code_writer | 3 | 1 | 8 | 120000 | 260000 | +117% |
| trim-cli-data | T5_restructure_heavy_payloads | code_writer | 4 | 3 | 8 | 130000 | 220000 | +69% |
| trim-cli-data | T6_contract_annotations | doc_writer | 5 | 3 | 8 | 30000 | 90902 | +203% |
| trim-cli-data | T7_after_measurements | terminal_operator | 6 | 4 | 8 | 40000 | 46975 | +17% |
| trim-cli-data | T8_e2e_green_gate | verifier | 7 | 4 | 8 | 30000 | 50752 | +69% |
| unify-cli-io | T1-lib-cli | code_writer | 0 | 0 | 11 | 40000 | 55576 | +39% |
| unify-cli-io | T2-exec-tools | code_writer | 1 | 1 | 11 | 60000 | 18000 | -70% |
| unify-cli-io | T3-verify-tools | code_writer | 2 | 1 | 11 | 45000 | 38000 | -16% |
| unify-cli-io | T4-plan-tools | code_writer | 3 | 1 | 11 | 35000 | 18000 | -49% |
| unify-cli-io | T5-versioning-report | code_writer | 4 | 1 | 11 | 25000 | 71430 | +186% |
| unify-cli-io | T6-budget-guard | code_writer | 5 | 1 | 11 | 20000 | 68633 | +243% |
| unify-cli-io | T7-forensics | code_writer | 6 | 1 | 11 | 30000 | 74904 | +150% |
| unify-cli-io | T8-token-cost | code_writer | 7 | 1 | 11 | 30000 | 84386 | +181% |
| unify-cli-io | T9-consumers | doc_writer | 8 | 7 | 11 | 40000 | 134155 | +235% |
| unify-cli-io | T10-tests | code_writer | 9 | 8 | 11 | 70000 | 232997 | +233% |
| unify-cli-io | T11-e2e-gate | verifier | 10 | 9 | 11 | 15000 | 29719 | +98% |
| verifier-task-shape | T1-contract | code_writer | 0 | 0 | 6 | 40000 | 48000 | +20% |
| verifier-task-shape | T2-complete-green | code_writer | 1 | 1 | 6 | 60000 | 35000 | -42% |
| verifier-task-shape | T3-state-only-commit | code_writer | 2 | 1 | 6 | 50000 | 30000 | -40% |
| verifier-task-shape | T4-verify-e2e-flow | code_writer | 3 | 1 | 6 | 50000 | 30000 | -40% |
| verifier-task-shape | T5-emit-and-document | doc_writer | 4 | 1 | 6 | 40000 | 50000 | +25% |
| verifier-task-shape | T6-e2e | terminal_operator | 5 | 5 | 6 | 30000 | 31000 | +3% |
| verify | T1-load-inputs | code_writer | 0 | 0 | 8 | 30000 | 84126 | +180% |
| verify | T2-ground-check | code_writer | 1 | 1 | 8 | 25000 | 42886 | +72% |
| verify | T3-manual-confirm | code_writer | 2 | 1 | 8 | 25000 | 60011 | +140% |
| verify | T4-degraded-manual | code_writer | 3 | 2 | 8 | 20000 | 45591 | +128% |
| verify | T5-incomplete-coverage | code_writer | 4 | 2 | 8 | 25000 | 47406 | +90% |
| verify | T6-token-deviation | code_writer | 5 | 1 | 8 | 20000 | 49299 | +146% |
| verify | T7-report-archive | code_writer | 6 | 5 | 8 | 35000 | 63495 | +81% |
| verify | T8-e2e | reviewer | 7 | 7 | 8 | 40000 | 65778 | +64% |
| verify-ac-parser-loud-fail | T1 | code_writer | 0 | 0 | 3 | 45000 | 55000 | +22% |
| verify-ac-parser-loud-fail | T2 | code_writer | 1 | 0 | 3 | 35000 | 35000 | +0% |
| verify-ac-parser-loud-fail | T3 | verifier | 2 | 2 | 3 | 25000 | 25000 | +0% |

excluded: 1

## Per-plan bias summary

| plan_slug | mean_deviation_pct |
|---|---|
| change-type-versioning-policy | +500% |
| executor-minimal-brief | -27% |
| executor-minimal-return | +34% |
| executor-scoped-commit | +154% |
| fix-commit-state-ordering | -64% |
| forensics-analysis | +4% |
| forensics-analysis-validate-cli | -20% |
| forensics-persist-ids | +41% |
| multi-platform-marketplace | +11% |
| sdd-kit-skill-token-budget | +766% |
| sdd-kit-token-reduction | -57% |
| sdd-verify-cli-and-budget-pause | +17% |
| shared-scripts-and-real-cost | +151% |
| spec-forensics | -21% |
| spec-forensics-report-delegation | +55% |
| token-cost-cli | -1% |
| token-diet | -9% |
| trim-cli-data | +70% |
| unify-cli-io | +112% |
| verifier-task-shape | -12% |
| verify | +113% |
| verify-ac-parser-loud-fail | +7% |

overall: +102%
