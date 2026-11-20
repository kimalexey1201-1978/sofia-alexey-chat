# Runtime Task State & Outcome Reconciliation — v1

## Status and boundary

This specification closes the lifecycle gap between `runtime-task.schema.json` and the Execution Supervisor's `OUTCOME_UNKNOWN` result. It defines a fail-closed state model and pure validation helpers. It does **not** implement provider reconciliation, durable task storage, dispatch, a runtime, or external side effects. The current v0.1 chat path remains inference-only.

## 1. State semantics

- `created`: task record exists; no execution admission has occurred.
- `admitted`: required policy, authority and resource gates passed; no claim that execution started.
- `running`: runtime has acknowledged start.
- `paused`: execution is intentionally suspended and may resume only under the original task boundary.
- `checkpointed`: a validated resumable checkpoint exists.
- `resuming`: a previously paused/checkpointed task is being revalidated for continuation.
- `completed`: execution outcome is known and the operation completed.
- `failed`: execution outcome is known and the operation failed.
- `cancelled`: cancellation was acknowledged; this alone does not prove that an external side effect did not occur.
- `expired`: deadline elapsed; this alone does not prove that an external side effect did not occur.
- `outcome_uncertain`: execution may have caused an external side effect, but authoritative confirmation is unavailable. This is a quarantine state for the operation, not a retryable failure.

A runtime task entering `outcome_uncertain` must retain an `outcome_ref` pointing to the normalized execution result or provider operation reference. Once reconciled, it must retain a `reconciliation_ref` to the authoritative evidence used to resolve the state.

## 2. Allowed transitions

| From | Allowed next states |
| --- | --- |
| created | admitted, failed, cancelled, expired |
| admitted | running, failed, cancelled, expired |
| running | paused, checkpointed, completed, failed, cancelled, expired, outcome_uncertain |
| paused | resuming, cancelled, expired |
| checkpointed | resuming, cancelled, expired |
| resuming | running, failed, cancelled, expired, outcome_uncertain |
| outcome_uncertain | completed or failed, only after verified reconciliation |
| completed / failed / cancelled / expired | no further transition |

No transition from `outcome_uncertain` directly to `running`, `resuming` or a new attempt is permitted. A reconciliation decision must be based on authoritative provider state, a provider operation ID, or a provider-supported idempotency lookup—not model inference, executor assertion, elapsed time or absence of a response.

## 3. Reconciliation outcomes

The reconciler records one of these conclusions:

1. **CONFIRMED_APPLIED** — provider evidence proves the side effect occurred. Resolve the original task as completed (or as a separately modelled partial result where that contract exists). Do not repeat the operation.
2. **CONFIRMED_NOT_APPLIED** — provider evidence proves the side effect did not occur. Resolve the original task as failed or otherwise terminal, then a new linked retry may be considered.
3. **STILL_UNKNOWN** — evidence is insufficient or provider state cannot be queried. Keep `outcome_uncertain`; do not retry or report success/failure as fact.

The reconciliation reference must identify the evidence source, provider operation/reference, observation timestamp, exact request/idempotency binding and normalized conclusion. Sensitive provider payloads and credentials must not be copied into audit logs.

## 4. Retry gate

A retry is a new execution request linked to the prior request through `retry_of_request_id`. It must pass the complete current admission process again: fresh Policy Engine decision, active grants and Authority Envelope, approval where required, fresh RBM reservation, module trust/health checks and deadline validation.

Retry is allowed only when:
- the previous side effect is authoritatively confirmed not applied; or
- the capability contract explicitly declares the exact operation naturally idempotent and the retry preserves the canonical operation and idempotency binding.

A retry is prohibited when:
- provider outcome is unknown or still being reconciled;
- provider confirms the side effect was applied;
- the target cannot support safe deduplication and non-application cannot be established;
- operation parameters, target, principal, capability or data scope changed while reusing the old approval or idempotency key.

Where the provider supports idempotency keys, reuse the same key only for the exact same canonical operation and target within the provider's documented retention window. A changed operation requires a new approval and a new key.

## 5. Cancellation and expiry are not proof of non-execution

Cancellation and deadline expiry are control signals, not transactional rollback. If a write/send/delete/publish/device command may have crossed the external boundary before cancellation or timeout, classify it as `outcome_uncertain` until reconciled. The runtime must not convert cancellation acknowledgement into a claim that the external operation was undone.

## 6. Audit and observability

Record task/request/correlation IDs, prior and next states, transition timestamp, actor/component, reason code, provider operation reference, idempotency-key digest, reconciliation reference and policy/contract versions. Do not log raw secrets, full prompts, message bodies or unrestricted provider responses.

## 7. Acceptance tests

1. The schema accepts `outcome_uncertain` and requires `outcome_ref` in that state.
2. Terminal states cannot transition back to execution.
3. `outcome_uncertain` cannot transition to running/resuming.
4. `outcome_uncertain` cannot resolve without verified reconciliation evidence.
5. `CONFIRMED_APPLIED` prohibits retry.
6. `STILL_UNKNOWN` retains the uncertain state and prohibits retry.
7. `CONFIRMED_NOT_APPLIED` permits consideration of a linked retry, but never bypasses fresh admission.
8. Retry binding mismatch (operation, target or idempotency key) is rejected.
9. Cancellation/expiry after a possible external side effect is classified uncertain, not assumed rolled back.

## 8. Implementation boundary

The repository change adds the state to the schema and deterministic pure guards for transitions/retry eligibility. Provider reconciliation, persistence, audit event delivery and actual retry orchestration remain future integration work. No executor is dispatched by these helpers.
