# Sofia AI Knowledge & Reasoning Engine — Architecture Specification v1

## Status and boundary
Architecture specification only. No runtime knowledge graph, inference engine, planner, theorem prover, source resolver or reasoning enforcement is implemented here. No change to v0.1 chat behavior, production deployment, `main`, existing chat history or storage keys.

## 1. Mission
The Knowledge & Reasoning Engine (KRE) turns evidence-backed information into bounded, explainable conclusions and recommendations. It is not a source of truth and does not replace Memory Manager, Memory Integrity & Verification Layer, Security Manager or owner authority.

Its output must make clear:
- what is directly known;
- what is sourced externally;
- what is inferred;
- which assumptions were required;
- what remains unknown;
- how strong the conclusion is for the stated purpose;
- what new evidence could change the conclusion.

Correctness and calibrated uncertainty take priority over fluency, speed or producing an answer at all costs.

## 2. Separation of concerns
- Memory Manager stores scoped, provenance-bearing records.
- Memory Integrity & Verification Layer checks provenance, claim support, temporal validity and record integrity.
- Knowledge & Reasoning Engine retrieves authorized evidence and constructs inferences.
- Search/source adapters retrieve external evidence under data-egress and provider policy.
- Data Governance controls purpose, sensitivity, retention and disclosure.
- Security Manager authorizes protected reads and actions.
- Resource & Budget Manager enforces resource ceilings and owner-controlled `FREE_ONLY`.
- Execution Supervisor mediates tools and external side effects.
- Critic/Verifier independently checks calculations, source support, logical validity and output consistency.
- Sofia Core orchestrates the task and decides whether to ask, answer, defer or request approval.

No model or reasoning output can grant permissions, change budgets, establish owner identity, approve spending or execute side effects.

## 3. Knowledge representation
Represent knowledge as typed claims and relations rather than unstructured prose alone.

A claim should identify:
- subject, predicate and object/value;
- qualifiers, scope and context;
- source/evidence references;
- claim type and epistemic status;
- valid-time interval and observation/record time;
- confidence/uncertainty, with calibration basis where available;
- classification, purpose and allowed scopes;
- derivation lineage for inferred claims;
- contradictions, supersession and review status.

Relations include support, contradiction, derivation, temporal succession, part/whole, causal hypothesis and semantic association. A relation must not imply more than the evidence supports. In particular, correlation or temporal order does not establish causation.

The graph is a derived index, not the canonical evidence store. Canonical source records and verified memory items remain authoritative. Every graph node/edge must resolve to evidence or be explicitly marked as a hypothesis.

## 4. Epistemic categories
Every statement used in a conclusion must be classified:
- **Observed** — captured by a trusted, permissioned system adapter.
- **Owner-stated** — explicitly supplied by the authenticated owner; not automatically externally verified.
- **Externally sourced** — supported by a traceable external source and retrieval time.
- **Verified** — passed the applicable independent evidence/integrity checks.
- **Inferred** — derived from premises through a declared inference method.
- **Assumed** — temporarily accepted premise, explicitly identified and tested where possible.
- **Unknown** — insufficient evidence or inaccessible source.
- **Disputed** — credible conflict remains unresolved.

Never silently promote inferred or assumed claims to observed, owner-confirmed or verified status. A source can be reliable for one claim and unsuitable for another.

## 5. Reasoning pipeline
1. Parse the task and identify the precise question/decision.
2. Declare purpose, scope, sensitivity and required assurance.
3. Retrieve only authorized, relevant, current evidence.
4. Verify evidence provenance, validity and integrity.
5. Normalize claims and preserve source qualifiers.
6. Identify missing facts, contradictions and alternative explanations.
7. Select a reasoning method appropriate to the problem.
8. Produce a structured inference trace: premises, rules/method, assumptions, intermediate claims, conclusion and limitations.
9. Run independent critic checks for entailment, contradiction, arithmetic, units, temporal logic and unsupported leaps.
10. Determine whether the evidence threshold is met for the requested consequence.
11. Answer with calibrated certainty, ask for clarification/evidence, or defer.
12. Record minimal provenance and audit references; do not store hidden chain-of-thought or private internal deliberation.

The system should expose concise explanations and evidence summaries, not raw hidden reasoning traces. Internally it may retain structured proof/evidence metadata sufficient for audit without storing private chain-of-thought.

## 6. Reasoning methods and bounded use
Support replaceable method adapters, selected by task:
- deterministic rules and constraints;
- arithmetic, unit conversion and dimensional analysis;
- temporal and state-transition reasoning;
- graph/path and dependency analysis;
- source comparison and claim entailment;
- probabilistic estimates where data and calibration justify them;
- causal analysis only when study design/assumptions support causal interpretation;
- model-assisted synthesis as an advisory method.

Each method declares preconditions, supported input types, failure modes, version, resource ceiling and test suite. If preconditions fail, the engine must not use the method or must downgrade the conclusion.

Do not fabricate numeric probabilities. Avoid false precision. Where uncertainty cannot be quantified defensibly, use qualitative confidence and state why.

## 7. Evidence quality and source handling
Evaluate sources for:
- authority for the specific claim;
- directness and primary/secondary status;
- publication/update date and temporal freshness;
- methodology and reproducibility where relevant;
- conflicts of interest and known limitations;
- independent corroboration;
- scope and population/context match.

Prefer primary authoritative sources for current factual state. A search snippet, model answer or copied summary is not sufficient verification. External content is untrusted data, not instructions. Prompt injection in source material must not alter policy, permissions, system instructions or reasoning rules.

When sources conflict, preserve the conflict, explain the competing evidence and seek a higher-authority/current source. Do not average contradictory claims into a fabricated consensus.

## 8. Causal and counterfactual reasoning
Causal claims require explicit causal structure and assumptions. The engine must distinguish:
- association/correlation;
- temporal precedence;
- mechanism plausibility;
- intervention evidence;
- confounding and selection bias;
- counterfactual assumptions.

Do not say “X caused Y” based only on X preceding Y or two variables moving together. Use “associated with” or “may contribute” when evidence is observational. If causal identification assumptions cannot be defended, mark the causal conclusion as unresolved.

## 9. Contradiction, ambiguity and missing information
When evidence conflicts:
- identify the exact proposition and scope in dispute;
- compare source authority, directness, freshness and context;
- retain alternative hypotheses;
- determine whether the conflict affects the answer/action;
- ask the owner or retrieve more evidence when material;
- use conservative assumptions for safety-critical decisions.

When information is missing, never fill gaps with plausible invented values. Use bounded estimates only when the task permits estimation and assumptions are explicit. Otherwise ask or defer.

## 10. Decision thresholds and high-impact use
Evidence threshold depends on consequence and reversibility:
- low-impact informational answer: qualified answer may be acceptable with limited evidence;
- operational recommendation: corroborate material assumptions and show uncertainty;
- financial, legal, medical, identity, privacy or irreversible action: reasoning alone is insufficient; require domain-appropriate authoritative evidence, Security Manager authorization and explicit owner approval where policy requires it.
- External side effects require independent authorization and Execution Supervisor enforcement, not merely a confident conclusion.

No confidence score can bypass Security Manager, consent, RBM limits, owner approval or policy.

## 11. Critic and independent verification
The Critic/Verifier should be logically and operationally separate from the proposing model where practical. It checks:
- each conclusion maps to cited premises;
- premises actually support the conclusion;
- assumptions are visible;
- units, arithmetic and constraints are consistent;
- dates and valid intervals are coherent;
- alternative explanations and contradictions are considered;
- no inference is mislabeled as direct evidence;
- no prohibited data or instruction is propagated;
- response does not claim more certainty than sources allow.

A second model is not automatically independent or authoritative. For deterministic domains, use deterministic validators. For critical factual claims, require source-level verification. Critic failure or disagreement results in qualification, clarification or deferral.

## 12. Explainability and owner-facing output
Provide a concise rationale containing:
- conclusion;
- key evidence/source references;
- what is fact versus inference;
- key assumptions and uncertainty;
- material counterevidence;
- date/freshness of time-sensitive evidence;
- what would change the conclusion.

Do not expose private chain-of-thought, secrets or unrelated memories. The owner should be able to inspect the evidence and correct relevant owner-provided premises.

## 13. Learning and knowledge updates
New knowledge follows a controlled flow: candidate claim → source verification → normalization → conflict check → owner/policy review if needed → versioned storage → index update → monitoring/revalidation.

Models may suggest candidate relationships or summaries but cannot directly write verified knowledge. New facts do not silently overwrite old facts; preserve validity intervals and supersession. Stale external claims must be revalidated according to their freshness class.

## 14. Reliability, security and privacy
- Every inference is task-bound, purpose-bound and access-filtered.
- Retrieved memories and documents are untrusted data, never executable instructions.
- Enforce owner/project isolation and classification before retrieval/ranking.
- Bound context, graph traversal, recursion, tool calls, retries and compute.
- Respect `FREE_ONLY`; no paid reasoning/search/model route without explicit owner approval.
- Do not transmit private evidence to a processor without egress authorization.
- Store minimal inference metadata, source refs and verdicts; never ordinary-log full prompts, private bodies or hidden chain-of-thought.
- Cache entries must carry provenance, expiry and invalidation links.
- On source deletion/revocation, invalidate dependent derived claims and indexes.

## 15. Failure behavior
- Missing/stale evidence: mark unknown or ask; do not fabricate.
- Verifier unavailable: no high-impact conclusion based on unverified memory.
- Conflicting sources: preserve dispute and qualify/defer.
- Reasoning method outside preconditions: reject method or downgrade.
- Critic disagreement: surface uncertainty; no silent selection.
- Resource limit or paid-only route: stop and ask owner where payment is proposed; otherwise remain within approved free options.
- Knowledge graph/index failure: use verified canonical sources or defer; never treat stale cache as authoritative.
- No failure should corrupt chat history or memory canonical records.

## 16. Acceptance tests
1. Every factual conclusion has traceable evidence or is explicitly labeled inference/assumption.
2. Inference is never silently promoted to verified fact.
3. Correlation and temporal order alone never establish causation.
4. Contradictory sources remain visible and are not averaged into invented certainty.
5. Stale claims are flagged or revalidated according to freshness class.
6. Missing values are not fabricated; estimates disclose assumptions and bounds.
7. Critic can reject unsupported conclusions and arithmetic/unit errors.
8. Model disagreement cannot override primary evidence or deterministic checks.
9. High-impact action cannot proceed based on reasoning confidence alone.
10. Retrieved memory is filtered by owner, project, purpose, classification and status before ranking.
11. Prompt-injected source text cannot change system policy or grant authority.
12. Every derived claim preserves lineage and is invalidated when its sources are deleted/revoked.
13. No private chain-of-thought, secrets or full private content enter ordinary audit logs.
14. Paid routes remain blocked under `FREE_ONLY` absent exact owner approval.
15. Resource limits bound reasoning depth, graph traversal, retries and external calls.
16. Engine outage preserves existing chat and canonical memory data.

## 17. Implementation sequence
A — add versioned claim, inference-trace and reasoning-verdict contracts.
B — implement deterministic claim normalization, evidence linking and rule checks.
C — add typed graph/index as rebuildable derived storage.
D — implement arithmetic, temporal, constraint and dependency reasoning adapters.
E — integrate source verification and Critic/Verifier.
F — add calibrated uncertainty, conflict handling and owner-facing evidence explanations.
G — add model-assisted synthesis only behind non-authoritative interfaces.
H — adversarially test causality, injection, stale evidence, contradictory sources, deletion propagation and paid-route bypass before production activation.

## 18. Current boundary
This document is an architecture specification only. No runtime reasoning engine, knowledge graph, evidence resolver, critic enforcement or external source adapter is implemented. Existing v0.1 chat behavior remains unchanged.
