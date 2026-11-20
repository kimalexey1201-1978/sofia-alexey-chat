const clone = value => structuredClone(value);
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map(key =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}
const TERMINAL = new Set(["completed", "failed"]);
const CONCLUSIONS = new Set([
  "CONFIRMED_APPLIED", "CONFIRMED_NOT_APPLIED", "STILL_UNKNOWN"
]);

/**
 * In-memory transactional test double for the future reconciliation storage port.
 * Not durable, not shared across isolates, and not suitable for production.
 */
export function createInMemoryReconciliationStore() {
  const tasks = new Map();
  const leases = new Map();
  // Retain the generation after release so fencing tokens never reset.
  const leaseGenerations = new Map();
  const evidence = new Map();
  const decisions = new Map();
  const outbox = new Map();
  const decisionIds = new Set();
  let queue = Promise.resolve();

  function serialize(operation) {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  }

  return {
    async seedTask(task) {
      return serialize(() => {
        if (!task || typeof task.task_id !== "string" || tasks.has(task.task_id)) {
          throw new Error("TASK_INVALID_OR_ALREADY_EXISTS");
        }
        if (task.state !== "outcome_uncertain" || !Number.isSafeInteger(task.version) ||
            task.version < 1 || typeof task.current_request_id !== "string") {
          throw new Error("TASK_MUST_START_OUTCOME_UNCERTAIN");
        }
        tasks.set(task.task_id, clone(task));
        evidence.set(task.task_id, []);
        decisions.set(task.task_id, []);
        return clone(task);
      });
    },

    async getTask(taskId) {
      return serialize(() => clone(tasks.get(taskId) ?? null));
    },

    async acquireLease({taskId, owner, now, ttlMs}) {
      return serialize(() => {
        const task = tasks.get(taskId);
        const nowMs = Date.parse(now);
        if (!task || task.state !== "outcome_uncertain") return null;
        if (typeof owner !== "string" || !owner || !Number.isFinite(nowMs) ||
            !Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
          throw new Error("LEASE_INPUT_INVALID");
        }
        const current = leases.get(taskId);
        // Acquisition is for an unleased task only. Renewal is a separate
        // fencing-token-checked operation; owner-name reuse must not steal a
        // live lease from another worker instance using the same identity.
        if (current && Date.parse(current.lease_expires_at) > nowMs) return null;
        const token = (leaseGenerations.get(taskId) ?? 0) + 1;
        leaseGenerations.set(taskId, token);
        const lease = {
          task_id: taskId, lease_owner: owner,
          lease_expires_at: new Date(nowMs + ttlMs).toISOString(),
          fencing_token: token, acquired_at: new Date(nowMs).toISOString()
        };
        leases.set(taskId, lease);
        return clone(lease);
      });
    },

    async renewLease({taskId, owner, fencingToken, now, ttlMs}) {
      return serialize(() => {
        const task = tasks.get(taskId);
        const current = leases.get(taskId);
        const nowMs = Date.parse(now ?? "");
        if (!task || task.state !== "outcome_uncertain" || !current ||
            current.lease_owner !== owner || current.fencing_token !== fencingToken ||
            !Number.isFinite(nowMs) || Date.parse(current.lease_expires_at) <= nowMs ||
            !Number.isSafeInteger(ttlMs) || ttlMs <= 0) return null;
        const renewed = {
          ...current,
          lease_expires_at: new Date(nowMs + ttlMs).toISOString(),
          renewed_at: new Date(nowMs).toISOString()
        };
        leases.set(taskId, renewed);
        return clone(renewed);
      });
    },

    async commitDecision(input) {
      return serialize(() => {
        const {taskId, expectedVersion, leaseOwner, fencingToken, now,
          evidenceRecords, decision, auditEvent} = input ?? {};
        if (typeof taskId !== "string" || !taskId ||
            !Number.isSafeInteger(expectedVersion) || expectedVersion < 1 ||
            typeof leaseOwner !== "string" || !leaseOwner ||
            !Number.isSafeInteger(fencingToken) || fencingToken < 1) {
          return {committed:false, reasonCode:"COMMIT_INPUT_INVALID"};
        }
        const task = tasks.get(taskId);
        const lease = leases.get(taskId);
        const nowMs = Date.parse(now ?? "");
        if (!task) return {committed:false, reasonCode:"TASK_NOT_FOUND"};
        if (task.state !== "outcome_uncertain" || task.version !== expectedVersion) {
          return {committed:false, reasonCode:"TASK_VERSION_CONFLICT"};
        }
        if (!lease || lease.lease_owner !== leaseOwner ||
            lease.fencing_token !== fencingToken ||
            !Number.isFinite(nowMs) || Date.parse(lease.lease_expires_at) <= nowMs) {
          return {committed:false, reasonCode:"LEASE_FENCING_REJECTED"};
        }
        if (!Array.isArray(evidenceRecords) || !evidenceRecords.length ||
            !decision || typeof decision.decision_id !== "string" || !decision.decision_id ||
            !CONCLUSIONS.has(decision.conclusion) ||
            !auditEvent || typeof auditEvent.event_id !== "string" || !auditEvent.event_id ||
            decision.task_id !== taskId || decision.request_id !== task.current_request_id ||
            decision.task_version_before !== expectedVersion) {
          return {committed:false, reasonCode:"COMMIT_INPUT_INVALID"};
        }
        if (decisionIds.has(decision.decision_id) || outbox.has(auditEvent.event_id)) {
          return {committed:false, reasonCode:"DUPLICATE_COMMIT_ID"};
        }

        const expectedState = decision.conclusion === "CONFIRMED_APPLIED" ? "completed" :
          decision.conclusion === "CONFIRMED_NOT_APPLIED" ? "failed" : "outcome_uncertain";
        const expectedVersionAfter = expectedState === "outcome_uncertain" ?
          expectedVersion : expectedVersion + 1;
        const expectedEventType = {
          CONFIRMED_APPLIED: "reconciliation.confirmed_applied",
          CONFIRMED_NOT_APPLIED: "reconciliation.confirmed_not_applied",
          STILL_UNKNOWN: "reconciliation.still_unknown"
        }[decision.conclusion];
        if (decision.task_version_after !== expectedVersionAfter ||
            typeof decision.reason_code !== "string" || !decision.reason_code ||
            typeof decision.evidence_set_digest !== "string" ||
            !/^[a-f0-9]{64}$/i.test(decision.evidence_set_digest) ||
            auditEvent.aggregate_id !== taskId ||
            auditEvent.aggregate_version !== expectedVersionAfter ||
            auditEvent.event_type !== expectedEventType ||
            auditEvent.payload?.conclusion !== decision.conclusion ||
            auditEvent.payload?.reason_code !== decision.reason_code ||
            auditEvent.payload?.evidence_set_digest !== decision.evidence_set_digest) {
          return {committed:false, reasonCode:"COMMIT_DECISION_AUDIT_BINDING_INVALID"};
        }

        const priorEvidence = evidence.get(taskId) ?? [];
        const merged = [...priorEvidence];
        for (const record of evidenceRecords) {
          if (!record || typeof record.evidence_digest !== "string" ||
              !/^[a-f0-9]{64}$/i.test(record.evidence_digest) ||
              record.task_id !== taskId || record.request_id !== task.current_request_id) {
            return {committed:false, reasonCode:"EVIDENCE_RECORD_INVALID"};
          }
          const existing = merged.find(item => item.evidence_digest === record.evidence_digest);
          if (existing && canonicalJson(existing) !== canonicalJson(record)) {
            return {committed:false, reasonCode:"EVIDENCE_DIGEST_CONFLICT"};
          }
          if (record.conclusion !== decision.conclusion) {
            return {committed:false, reasonCode:"EVIDENCE_RECORD_INVALID"};
          }
          if (!existing) merged.push(clone(record));
        }

        const nextState = expectedState;
        const nextVersion = expectedVersionAfter;

        // All mutations occur together within this serialized critical section.
        evidence.set(taskId, merged);
        decisions.set(taskId, [...(decisions.get(taskId) ?? []), clone(decision)]);
        decisionIds.add(decision.decision_id);
        outbox.set(auditEvent.event_id, clone(auditEvent));
        tasks.set(taskId, {
          ...task, state:nextState, version:nextVersion,
          reconciliation_ref: decision.evidence_set_digest,
          updated_at: now,
          last_reason_code: decision.reason_code
        });
        return {committed:true, task:clone(tasks.get(taskId)),
          evidenceCount:merged.length, decision:clone(decision)};
      });
    },

    async listEvidence(taskId) {
      return serialize(() => clone(evidence.get(taskId) ?? []));
    },
    async listDecisions(taskId) {
      return serialize(() => clone(decisions.get(taskId) ?? []));
    },
    async listOutbox() {
      return serialize(() => clone([...outbox.values()]));
    },
    async releaseLease({taskId, owner, fencingToken}) {
      return serialize(() => {
        const lease = leases.get(taskId);
        if (!lease || lease.lease_owner !== owner ||
            lease.fencing_token !== fencingToken) return false;
        leases.delete(taskId);
        return true;
      });
    }
  };
}
