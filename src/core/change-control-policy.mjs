const MAX_ATTEMPTS = 3;
const DIGEST = /^[a-fA-F0-9]{64}$/;

function validDigest(value) {
  return typeof value === "string" && DIGEST.test(value);
}

/**
 * Deterministic, side-effect-free guard against unbounded correction loops.
 * One initial attempt plus at most two corrections are allowed per issue.
 * A repeated change requires materially new evidence. Scope expansion requires
 * explicit owner approval. This guard evaluates a proposal; it does not apply it.
 */
export function evaluateChangeAttempt(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { allowed: false, decisionCode: "INVALID_CHANGE_INPUT", attemptsRemaining: 0 };
  }

  const {
    issue_id, initial_scope_digest, proposed_scope_digest,
    acceptance_criteria, attempt_number, proposed_change_digest,
    prior_change_digests = [], last_evidence_digest = null,
    new_evidence_digest = null, owner_approved_scope_expansion = false,
    acceptance_verified = false, verification_evidence_digest = null
  } = input;

  if (typeof issue_id !== "string" || !issue_id.trim() ||
      !validDigest(initial_scope_digest) || !validDigest(proposed_scope_digest) ||
      !Array.isArray(acceptance_criteria) || acceptance_criteria.length === 0 ||
      !acceptance_criteria.every(item => typeof item === "string" && item.trim()) ||
      !Number.isSafeInteger(attempt_number) || attempt_number < 1 ||
      !validDigest(proposed_change_digest) ||
      !Array.isArray(prior_change_digests) ||
      !prior_change_digests.every(validDigest) ||
      (last_evidence_digest !== null && !validDigest(last_evidence_digest)) ||
      (new_evidence_digest !== null && !validDigest(new_evidence_digest))) {
    return { allowed: false, decisionCode: "INVALID_CHANGE_INPUT", attemptsRemaining: 0 };
  }

  if (acceptance_verified === true) {
    if (!validDigest(verification_evidence_digest)) {
      return { allowed: false, decisionCode: "VERIFICATION_EVIDENCE_REQUIRED", attemptsRemaining: 0 };
    }
    return { allowed: false, decisionCode: "ACCEPTANCE_ALREADY_MET", attemptsRemaining: 0 };
  }

  if (attempt_number > MAX_ATTEMPTS) {
    return { allowed: false, decisionCode: "ATTEMPT_LIMIT_REACHED_OWNER_REVIEW_REQUIRED", attemptsRemaining: 0 };
  }

  if (initial_scope_digest !== proposed_scope_digest &&
      owner_approved_scope_expansion !== true) {
    return { allowed: false, decisionCode: "SCOPE_EXPANSION_REQUIRES_OWNER_APPROVAL",
      attemptsRemaining: MAX_ATTEMPTS - attempt_number };
  }

  const repeatsPriorChange = prior_change_digests.includes(proposed_change_digest);
  const hasNewEvidence = validDigest(new_evidence_digest) &&
    new_evidence_digest !== last_evidence_digest;
  if (repeatsPriorChange && !hasNewEvidence) {
    return { allowed: false, decisionCode: "DUPLICATE_CHANGE_WITHOUT_NEW_EVIDENCE",
      attemptsRemaining: MAX_ATTEMPTS - attempt_number };
  }

  return {
    allowed: true,
    decisionCode: "CHANGE_ATTEMPT_ALLOWED",
    attemptsRemaining: MAX_ATTEMPTS - attempt_number,
    scopeExpansionApproved: initial_scope_digest !== proposed_scope_digest
  };
}

export const CHANGE_ATTEMPT_LIMIT = MAX_ATTEMPTS;
