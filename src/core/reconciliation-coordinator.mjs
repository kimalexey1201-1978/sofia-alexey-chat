function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",") }]`;
  return `{${Object.keys(value).sort().map(key =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}


function validDate(value) {
  return value instanceof Date && Number.isFinite(value.getTime());
}

/**
 * Testable orchestration boundary for reconciling an uncertain operation.
 *
 * This module does not execute or retry operations. A verifier is a mandatory
 * injected trust boundary; evidence's own VERIFIED marker is never sufficient.
 * The store supplied in v0.1 must be the in-memory test double only.
 */
export function createReconciliationCoordinator({
  store,
  getPriorRequest,
  adapterRegistry,
  verifier,
  clock = () => new Date(),
  createId,
  policy = {}
} = {}) {
  const freshnessWindowMs = policy.freshnessWindowMs ?? 300000;
  const leaseTtlMs = policy.leaseTtlMs ?? 30000;
  const policyVersion = policy.version ?? "1.0.0";
  const reconcilerRef = policy.reconcilerRef ?? "reconciliation-coordinator:test";

  if (!Number.isFinite(freshnessWindowMs) || freshnessWindowMs <= 0 ||
      !Number.isSafeInteger(leaseTtlMs) || leaseTtlMs <= 0 ||
      typeof policyVersion !== "string" || !policyVersion.trim() ||
      typeof reconcilerRef !== "string" || !reconcilerRef.trim()) {
    throw new TypeError("RECONCILIATION_COORDINATOR_POLICY_INVALID");
  }

  if (!store || typeof store.getTask !== "function" ||
      typeof store.acquireLease !== "function" ||
      typeof store.commitDecision !== "function" ||
      typeof store.listEvidence !== "function" ||
      typeof store.releaseLease !== "function" ||
      typeof getPriorRequest !== "function" ||
      !adapterRegistry || typeof adapterRegistry.get !== "function" ||
      !verifier || typeof verifier.verifyProviderResponse !== "function" ||
      typeof createId !== "function") {
    throw new TypeError("RECONCILIATION_COORDINATOR_DEPENDENCIES_INVALID");
  }

  return {
    async reconcile({ taskId, owner } = {}) {
      if (typeof taskId !== "string" || !taskId ||
          typeof owner !== "string" || !owner) {
        return { reconciled: false, reasonCode: "COORDINATOR_INPUT_INVALID" };
      }

      const initialNow = clock();
      if (!validDate(initialNow)) {
        return { reconciled: false, reasonCode: "RECONCILIATION_TIME_INVALID" };
      }

      let lease = null;
      try {
        const task = await store.getTask(taskId);
        if (!task) return { reconciled: false, reasonCode: "TASK_NOT_FOUND" };
        if (task.state !== "outcome_uncertain") {
          return { reconciled: false, reasonCode: "TASK_NOT_OUTCOME_UNCERTAIN" };
        }

        const priorRequest = await getPriorRequest(task.current_request_id);
        if (!priorRequest || priorRequest.request_id !== task.current_request_id ||
            typeof priorRequest.provider_id !== "string" ||
            typeof priorRequest.provider_operation_ref !== "string") {
          return { reconciled: false, reasonCode: "ORIGINAL_REQUEST_NOT_FOUND" };
        }

        lease = await store.acquireLease({
          taskId, owner, now: initialNow.toISOString(), ttlMs: leaseTtlMs
        });
        if (!lease) return { reconciled: false, reasonCode: "LEASE_NOT_ACQUIRED" };

        const adapter = await adapterRegistry.get(priorRequest.provider_id);
        if (!adapter || adapter.providerId !== priorRequest.provider_id ||
            typeof adapter.queryOperationStatus !== "function") {
          return { reconciled: false, reasonCode: "PROVIDER_ADAPTER_UNAVAILABLE" };
        }

        const response = await adapter.queryOperationStatus({
          provider_id: priorRequest.provider_id,
          provider_operation_ref: priorRequest.provider_operation_ref
        });
        if (!response || response.provider_id !== priorRequest.provider_id ||
            response.provider_operation_ref !== priorRequest.provider_operation_ref ||
            !Array.isArray(response.evidence_records)) {
          return { reconciled: false, reasonCode: "PROVIDER_RESPONSE_BINDING_INVALID" };
        }

        const verified = await verifier.verifyProviderResponse({
          providerId: priorRequest.provider_id,
          providerOperationRef: priorRequest.provider_operation_ref,
          expectedTaskId: task.task_id,
          expectedRequestId: priorRequest.request_id,
          expectedTargetRef: priorRequest.target_ref,
          expectedOperationDigest: priorRequest.operation_digest,
          expectedIdempotencyKeyDigest: priorRequest.idempotency_key_digest,
          response
        });
        if (!verified || verified.authenticated !== true ||
            !Array.isArray(verified.evidenceRecords) ||
            verified.evidenceRecords.length === 0) {
          return { reconciled: false,
            reasonCode: verified?.reasonCode || "PROVIDER_EVIDENCE_UNTRUSTED" };
        }

        const now = clock();
        if (!validDate(now)) {
          return { reconciled: false, reasonCode: "RECONCILIATION_TIME_INVALID" };
        }

        // The evaluator and digest must operate on the complete persisted
        // history plus this authenticated provider response, never only the
        // latest response batch.
        const priorEvidence = await store.listEvidence(taskId);
        if (!Array.isArray(priorEvidence)) {
          return { reconciled: false, reasonCode: "PERSISTED_EVIDENCE_UNAVAILABLE",
            taskState: "outcome_uncertain" };
        }
        const evidenceRecords = [...priorEvidence, ...verified.evidenceRecords];
        const evaluation = evaluateReconciliationEvidenceBatch({
          task,
          priorRequest,
          evidenceRecords,
          freshnessWindowMs
        }, now);

        // Only a fully bound, fresh provider assertion of STILL_UNKNOWN is
        // eligible for an auditable unknown decision. Invalid/ambiguous
        // evidence is not persisted as if it were verified.
        const isVerifiedUnknown =
          (evaluation.reasonCode === "PROVIDER_STATE_STILL_UNKNOWN" ||
            evaluation.reasonCode === "MULTIPLE_DISTINCT_EVIDENCE_RECORDS") &&
          evaluation.conclusion === "STILL_UNKNOWN";
        if (!evaluation.resolved && !isVerifiedUnknown) {
          return { reconciled: false, reasonCode: evaluation.reasonCode,
            taskState: "outcome_uncertain" };
        }

        const evidenceSetDigest = await computeEvidenceSetDigest(evidenceRecords);
        const terminal = evaluation.resolved === true;
        const taskVersionAfter = terminal ? task.version + 1 : task.version;
        const conclusion = evaluation.conclusion;
        const reasonCode = evaluation.reasonCode;
        const decidedAt = now.toISOString();
        const decision = {
          decision_id: createId("decision"),
          task_id: task.task_id,
          request_id: priorRequest.request_id,
          task_version_before: task.version,
          task_version_after: taskVersionAfter,
          conclusion,
          reason_code: reasonCode,
          evidence_set_digest: evidenceSetDigest,
          policy_version: policyVersion,
          decided_at: decidedAt,
          reconciler_ref: reconcilerRef
        };
        const eventType = {
          CONFIRMED_APPLIED: "reconciliation.confirmed_applied",
          CONFIRMED_NOT_APPLIED: "reconciliation.confirmed_not_applied",
          STILL_UNKNOWN: "reconciliation.still_unknown"
        }[conclusion];
        const auditEvent = {
          event_id: createId("event"),
          aggregate_id: task.task_id,
          aggregate_version: taskVersionAfter,
          event_type: eventType,
          payload: {
            conclusion,
            reason_code: reasonCode,
            evidence_set_digest: evidenceSetDigest
          },
          created_at: decidedAt,
          delivery_state: "pending",
          attempt_count: 0
        };
        const committed = await store.commitDecision({
          taskId,
          expectedVersion: task.version,
          leaseOwner: owner,
          fencingToken: lease.fencing_token,
          now: decidedAt,
          evidenceRecords,
          decision,
          auditEvent
        });
        if (!committed?.committed) {
          return { reconciled: false,
            reasonCode: committed?.reasonCode || "RECONCILIATION_COMMIT_REJECTED",
            taskState: "outcome_uncertain" };
        }
        return {
          reconciled: true,
          conclusion,
          taskState: committed.task.state,
          taskVersion: committed.task.version,
          decisionId: decision.decision_id,
          auditEventId: auditEvent.event_id,
          retryMayBeConsidered: evaluation.retryMayBeConsidered === true
        };
      } catch {
        return { reconciled: false, reasonCode: "RECONCILIATION_DEPENDENCY_ERROR",
          taskState: "outcome_uncertain" };
      } finally {
        if (lease) {
          try {
            await store.releaseLease({
              taskId, owner, fencingToken: lease.fencing_token
            });
          } catch {
            // A failed release leaves only an expiring lease; it never resolves
            // the task or permits a side effect. Lease expiry is recovery.
          }
        }
      }
    }
  };
}

import { evaluateReconciliationEvidenceBatch } from "./reconciliation-manager.mjs";
import { computeEvidenceSetDigest } from "./reconciliation-storage.mjs";
