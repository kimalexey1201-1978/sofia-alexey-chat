# AI Evaluation & Quality Manager

**Status:** Architecture specification  
**Version:** 1.0  
**Applies to:** AI Provider Gateway, model adapters, translation, perception, and task-specific AI services

## 1. Purpose

The AI Evaluation & Quality Manager (AEQM) establishes measurable, task-specific quality controls for AI capabilities used by Sofia. It evaluates candidate models and adapters, monitors production outcomes using privacy-minimized signals, detects regressions, and supplies evidence for provider routing.

AEQM does not decide user intent, grant permissions, or authorize actions. It produces quality evidence and eligibility recommendations. Security Manager and ADM retain their authority boundaries.

## 2. Core principles

1. Evaluate capabilities against the actual task, not generic model rankings.
2. Treat provider/model claims as unverified until tested.
3. Separate offline qualification, pre-release regression testing, and production monitoring.
4. Use representative, versioned datasets with provenance and licensing controls.
5. Measure quality, safety, reliability, latency, and cost as distinct dimensions.
6. Never optimize a single aggregate score at the expense of critical safety or privacy thresholds.
7. Preserve uncertainty, sample size, confidence intervals, and test limitations.
8. Avoid retaining raw user content for evaluation by default.
9. Prevent evaluation results from granting execution authority.
10. Make model and dataset changes traceable and reversible.

## 3. Responsibilities

AEQM owns:
- evaluation suite registry and versioning;
- benchmark execution orchestration;
- task-specific metric definitions and thresholds;
- candidate qualification and regression comparisons;
- confidence and sample-size reporting;
- production quality signal aggregation where consent and policy permit;
- model/adapter quality evidence for AI Provider Gateway;
- evaluation reports and audit references.

AEQM does not own:
- provider selection or routing policy enforcement;
- user identity, consent, or permissions;
- final response policy or action execution;
- memory retention and deletion policy;
- independent fact verification for a particular consequential task.

## 4. Evaluation layers

### 4.1 Capability qualification

Before a model or adapter becomes eligible for a task class, run a qualification suite for declared capabilities. Examples:
- structured output schema conformance;
- instruction following and constraint preservation;
- multilingual translation adequacy and terminology consistency;
- speech recognition accuracy under noise and speaker overlap;
- vision/OCR extraction accuracy under supported conditions;
- tool-call proposal validity without executing tools;
- reasoning and planning reliability on controlled task sets.

Qualification is capability-specific. Passing a text benchmark does not qualify a model for audio, vision, translation, or autonomous planning.

### 4.2 Regression evaluation

Run the relevant versioned suite when any of the following changes:
- provider model/version;
- adapter implementation;
- prompt/template version;
- decoding parameters;
- safety policy or output schema;
- preprocessing/postprocessing pipeline;
- evaluation dataset or metric implementation.

Compare against the last approved baseline and report regressions by slice, not only as a single average.

### 4.3 Production monitoring

Production monitoring uses minimal, policy-approved signals such as schema failure rates, retries, latency, user corrections, explicit feedback, and task success indicators. Do not silently collect or retain full conversations for model scoring.

Production observations are not automatically training data. Any reuse for model improvement requires a separate lawful basis, explicit applicable consent, retention controls, and governance approval.

## 5. Evaluation suite design

Each suite must define:
- stable suite ID and semantic version;
- capability and task classes covered;
- dataset provenance, license, and permitted use;
- test cases and expected outputs or scoring rubric;
- language, locale, domain, and difficulty slices;
- known limitations and excluded cases;
- metric definitions and acceptance thresholds;
- evaluator implementation/version;
- reproducibility settings and random seeds where applicable;
- approval owner and review date.

Test sets should include ordinary, edge, adversarial, ambiguous, and failure cases. Avoid benchmark contamination where feasible. Keep private holdout tests for critical capabilities.

## 6. Metrics

Metrics are task-specific. Possible dimensions include:

- **Quality:** accuracy, adequacy, semantic preservation, completeness, factual consistency, task success.
- **Safety:** policy violation rate, unsafe tool proposal rate, refusal correctness, sensitive-data leakage.
- **Reliability:** availability, schema conformance, timeout rate, retry rate, malformed response rate.
- **Latency:** median, p95, p99, time-to-first-token where relevant.
- **Cost:** measured usage and normalized cost per successful task.
- **Robustness:** performance under noise, dialect, code-switching, adversarial inputs, missing context, and long-tail cases.
- **Calibration:** relationship between stated confidence and observed correctness, including calibration error and coverage.

Do not compare raw scores across unrelated tasks or datasets without a justified normalization method.

## 7. Qualification and routing evidence

A candidate may be marked eligible only if:
- required capability tests pass;
- hard safety and privacy gates pass;
- minimum quality threshold is met for relevant slices;
- sample size and uncertainty are sufficient for the policy's confidence requirement;
- reliability and latency constraints are satisfied;
- cost is within the task budget;
- no unresolved critical regression exists.

AEQM supplies evidence to AI Provider Gateway. Gateway still applies live consent, data-classification, availability, quota, and routing policy. A quality score is not a permission grant.

A candidate that fails a critical gate must be ineligible even if its aggregate score is high.

## 8. Confidence and statistical discipline

Every evaluation report records sample count, slice coverage, evaluator version, and uncertainty. For small samples, report insufficient evidence rather than a definitive pass. Use confidence intervals or other appropriate uncertainty estimates for rate metrics. Avoid ranking providers when confidence intervals overlap materially or test coverage is not comparable.

Human review may be required for subjective or high-impact evaluation dimensions. Annotator instructions, disagreement rates, and adjudication methods must be documented.

## 9. Production feedback safeguards

User feedback is an optional quality signal, not a ground-truth label. A correction may reflect preference, missing context, or changed intent rather than model error.

- Use explicit feedback controls where practical.
- Separate user preference adaptation from general model quality.
- Aggregate only with appropriate consent and minimum cohort safeguards.
- Do not expose one user's private content to another user's evaluation process.
- Provide correction and deletion propagation for any retained evaluation artifact.
- Do not use engagement or acceptance rate as the sole proxy for usefulness.

## 10. Security and integrity

Evaluation datasets and outputs are untrusted inputs. Protect against prompt injection, data poisoning, hidden instructions, and accidental secret inclusion.

- Validate dataset provenance and integrity hashes.
- Restrict evaluator permissions and network access.
- Separate evaluation credentials from production credentials.
- Sandbox model-generated code or tool proposals; do not execute them during scoring unless the test explicitly uses a controlled simulator.
- Keep immutable references to approved suite versions and reports.
- Audit changes to thresholds, datasets, evaluators, and candidate status.

## 11. Lifecycle

Candidate lifecycle:

`registered → capability_screened → evaluation_queued → evaluating → qualified | rejected | insufficient_evidence → monitored → suspended | retired`

Re-evaluation is required after material model, adapter, prompt, or evaluation changes. A previously qualified candidate may be suspended if production signals reveal critical degradation or a safety issue.

## 12. Integration contracts

- AI Provider Gateway submits candidate and task requirements, then consumes eligibility evidence.
- Audit & Observability Manager stores evaluation lifecycle events and report references.
- Resource & Runtime Manager supplies compute and scheduling budgets.
- Security Manager authorizes access to test data and provider endpoints.
- Task Orchestrator may request evaluation of a capability but cannot override a failed hard gate.
- Translation Engine and other domain services define domain-specific quality slices and acceptance thresholds.

## 13. Acceptance criteria

1. Qualification is capability- and task-specific.
2. Dataset provenance, version, license, and evaluator version are recorded.
3. Reports include sample counts, slice coverage, and uncertainty.
4. Critical safety/privacy gates cannot be offset by aggregate quality.
5. Material model or adapter changes trigger regression evaluation.
6. Production monitoring avoids raw-content retention by default.
7. User feedback is not treated as unquestionable ground truth.
8. Routing receives eligibility evidence but still performs live policy checks.
9. No evaluation result grants permissions or action authority.
10. Candidate status can be suspended and rolled back with an auditable reason.
