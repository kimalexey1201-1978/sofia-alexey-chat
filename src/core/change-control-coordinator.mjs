import { evaluateChangeAttempt } from "./change-control-policy.mjs";

const DIGEST = /^[a-fA-F0-9]{64}$/;

/**
 * Coordinates bounded change attempts using a host-provided atomic store.
 * The store must expose transact(issueId, updater), execute updater atomically
 * for that issue, and persist/return the updater's returned state.
 * This module deliberately supplies no in-memory or non-durable production
 * fallback: absence of an atomic store is a hard error.
 */
export function createChangeControlCoordinator({ store } = {}) {
  if (!store || typeof store.transact !== "function") {
    throw new TypeError("ATOMIC_CHANGE_CONTROL_STORE_REQUIRED");
  }

  return Object.freeze({
    async propose(input) {
      if (!input || typeof input !== "object" ||
          typeof input.issue_id !== "string" || !input.issue_id.trim()) {
        return { allowed: false, decisionCode: "INVALID_CHANGE_INPUT", attemptsRemaining: 0 };
      }

      return store.transact(input.issue_id, current => {
        const first = current ?? {
          issue_id: input.issue_id,
          status: "open",
          initial_scope_digest: input.proposed_scope_digest,
          acceptance_criteria: input.acceptance_criteria,
          attempts: 0,
          change_digests: [],
          last_evidence_digest: null
        };

        if (first.status !== "open") {
          return {
            state: first,
            result: { allowed: false, decisionCode: "ISSUE_NOT_OPEN", attemptsRemaining: 0 }
          };
        }
        if (first.issue_id !== input.issue_id ||
            first.initial_scope_digest !== input.initial_scope_digest &&
            input.initial_scope_digest !== undefined ||
            JSON.stringify(first.acceptance_criteria) !== JSON.stringify(input.acceptance_criteria)) {
          return {
            state: first,
            result: { allowed: false, decisionCode: "ISSUE_BASELINE_MISMATCH",
              attemptsRemaining: Math.max(0, 3 - first.attempts) }
          };
        }

        const result = evaluateChangeAttempt({
          ...input,
          initial_scope_digest: first.initial_scope_digest,
          acceptance_criteria: first.acceptance_criteria,
          attempt_number: first.attempts + 1,
          prior_change_digests: first.change_digests,
          last_evidence_digest: first.last_evidence_digest
        });

        if (!result.allowed) return { state: first, result };

        const next = {
          ...first,
          attempts: first.attempts + 1,
          change_digests: [...first.change_digests, input.proposed_change_digest],
          last_evidence_digest: input.new_evidence_digest ?? first.last_evidence_digest,
          last_attempt_at: input.attempted_at ?? null
        };
        return { state: next, result };
      });
    },

    async close({ issue_id, verification_evidence_digest }) {
      if (typeof issue_id !== "string" || !issue_id ||
          typeof verification_evidence_digest !== "string" ||
          !DIGEST.test(verification_evidence_digest)) {
        return { closed: false, decisionCode: "VERIFICATION_EVIDENCE_REQUIRED" };
      }
      return store.transact(issue_id, current => {
        if (!current || current.status !== "open") {
          return { state: current, result: { closed: false, decisionCode: "ISSUE_NOT_OPEN" } };
        }
        const next = {
          ...current,
          status: "closed",
          verification_evidence_digest
        };
        return { state: next, result: { closed: true, decisionCode: "ACCEPTANCE_VERIFIED" } };
      });
    }
  });
}
