/**
 * Process-local contract test double only.
 * Not durable, not shared across Worker isolates, and not production-safe.
 */
const clone = (value) => value === undefined ? undefined : structuredClone(value);
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

export class StorageConflictError extends Error {
  constructor(code, message) { super(message); this.name = "StorageConflictError"; this.code = code; }
}

export class InMemoryStoragePort {
  #tasks = new Map();
  #leases = new Map();
  #fencing = new Map();
  #evidence = new Map();
  #decisions = new Map();
  #outbox = new Map();
  #tail = Promise.resolve();

  async #exclusive(operation) {
    const previous = this.#tail;
    let release;
    this.#tail = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await operation(); } finally { release(); }
  }

  async seedTask(task) {
    return this.#exclusive(() => {
      if (!task?.taskId || !Number.isInteger(task.version) || task.version < 1)
        throw new TypeError("seedTask requires taskId and positive integer version");
      if (this.#tasks.has(task.taskId)) throw new StorageConflictError("TASK_EXISTS","Task already exists");
      this.#tasks.set(task.taskId, clone(task));
      this.#evidence.set(task.taskId, []);
      this.#decisions.set(task.taskId, []);
      return clone(task);
    });
  }

  async getTask(taskId) {
    return this.#exclusive(() => clone(this.#tasks.get(taskId) ?? null));
  }

  async acquireLease({ taskId, owner, now, ttlMs }) {
    return this.#exclusive(() => {
      if (!owner || !Number.isFinite(now) || !Number.isFinite(ttlMs) || ttlMs <= 0)
        throw new TypeError("Invalid lease arguments");
      if (!this.#tasks.has(taskId)) throw new StorageConflictError("TASK_NOT_FOUND","Task not found");
      const current = this.#leases.get(taskId);
      if (current && current.expiresAt > now) {
        if (current.owner !== owner) return null;
        // A live owner may renew without changing generation.
        const renewed = {...current, expiresAt: now + ttlMs};
        this.#leases.set(taskId, renewed);
        return clone(renewed);
      }
      const fencingToken = (this.#fencing.get(taskId) ?? 0) + 1;
      this.#fencing.set(taskId, fencingToken);
      const lease = {taskId,owner,fencingToken,acquiredAt:now,expiresAt:now+ttlMs};
      this.#leases.set(taskId, lease);
      return clone(lease);
    });
  }

  async releaseLease({ taskId, owner, fencingToken }) {
    return this.#exclusive(() => {
      const lease = this.#leases.get(taskId);
      if (!lease || lease.owner !== owner || lease.fencingToken !== fencingToken) return false;
      this.#leases.delete(taskId);
      return true;
    });
  }

  async commitDecision(input) {
    return this.#exclusive(() => {
      const {taskId,requestId,expectedTaskVersion,leaseOwner,fencingToken,now,
        decision,evidence=[]} = input ?? {};
      const task = this.#tasks.get(taskId);
      if (!task) throw new StorageConflictError("TASK_NOT_FOUND","Task not found");
      if (task.state !== "outcome_uncertain")
        throw new StorageConflictError("INVALID_STATE","Task is not awaiting reconciliation");
      if (task.version !== expectedTaskVersion)
        throw new StorageConflictError("VERSION_CONFLICT","Task version changed");
      if (task.currentRequestId !== requestId)
        throw new StorageConflictError("REQUEST_MISMATCH","Evidence belongs to a stale request");
      const lease = this.#leases.get(taskId);
      if (!lease || lease.owner !== leaseOwner || lease.fencingToken !== fencingToken ||
          this.#fencing.get(taskId) !== fencingToken || lease.expiresAt <= now)
        throw new StorageConflictError("STALE_FENCE","Lease is missing, expired, or fenced");
      if (!decision?.decisionId || !["CONFIRMED_APPLIED","CONFIRMED_NOT_APPLIED","STILL_UNKNOWN"].includes(decision.conclusion))
        throw new TypeError("Invalid decision");
      if (!Array.isArray(evidence)) throw new TypeError("Evidence must be an array");

      // Validate the full batch before mutating any collection.
      const existing = this.#evidence.get(taskId) ?? [];
      const staged = new Map();
      for (const item of evidence) {
        if (!item?.evidenceDigest || !item?.canonicalContent)
          throw new TypeError("Each evidence item requires evidenceDigest and canonicalContent");
        const digest = item.evidenceDigest;
        const content = canonical(item.canonicalContent);
        const prior = staged.get(digest) ?? existing.find(x => x.evidenceDigest === digest);
        if (prior && canonical(prior.canonicalContent) !== content)
          throw new StorageConflictError("EVIDENCE_DIGEST_CONFLICT","Same digest has different canonical content");
        staged.set(digest,{...clone(item),taskId,requestId});
      }

      const nextVersion = decision.conclusion === "STILL_UNKNOWN" ? task.version : task.version + 1;
      const nextTask = {...task,version:nextVersion,updatedAt:decision.decidedAt ?? new Date(now).toISOString()};
      if (decision.conclusion === "CONFIRMED_APPLIED") nextTask.state = "confirmed_applied";
      if (decision.conclusion === "CONFIRMED_NOT_APPLIED") nextTask.state = "confirmed_not_applied";
      if (decision.conclusion !== "STILL_UNKNOWN") nextTask.reconciliationRef = decision.decisionId;

      const newEvidence = [...staged.values()].filter(item =>
        !existing.some(x => x.evidenceDigest === item.evidenceDigest));
      const decisionRecord = {
        ...clone(decision),taskId,requestId,taskVersionBefore:task.version,taskVersionAfter:nextVersion
      };
      const outboxEvent = {
        eventId: decision.decisionId,aggregateId:taskId,aggregateVersion:nextVersion,
        eventType:"reconciliation.decision_recorded",
        payload:{decisionId:decision.decisionId,conclusion:decision.conclusion},
        createdAt:decision.decidedAt ?? new Date(now).toISOString(),
        deliveryState:"pending",attemptCount:0
      };

      // Commit the staged aggregate together; no mutation occurs before this point.
      this.#tasks.set(taskId,nextTask);
      this.#evidence.set(taskId,[...existing,...newEvidence]);
      this.#decisions.set(taskId,[...(this.#decisions.get(taskId) ?? []),decisionRecord]);
      this.#outbox.set(outboxEvent.eventId,outboxEvent);
      return {task:clone(nextTask),decision:clone(decisionRecord),insertedEvidence:newEvidence.length,outbox:clone(outboxEvent)};
    });
  }

  async listEvidence(taskId) { return this.#exclusive(() => clone(this.#evidence.get(taskId) ?? [])); }
  async listDecisions(taskId) { return this.#exclusive(() => clone(this.#decisions.get(taskId) ?? [])); }
  async listOutbox() { return this.#exclusive(() => clone([...this.#outbox.values()])); }
}
