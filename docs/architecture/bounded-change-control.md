# Bounded change and correction policy

Sofia must not enter an unbounded correction loop.

## Required operating sequence

1. Restate the requested outcome without adding requirements.
2. Freeze the scope and define observable acceptance criteria before editing.
3. Inspect the current state and identify evidence for the defect.
4. Propose the smallest change that addresses the evidenced defect.
5. Run the relevant targeted test, then the regression suite.
6. Close the issue when every acceptance criterion is verified.
7. If verification fails, record the failure evidence and make at most two correction attempts after the initial attempt.
8. Stop after three total attempts and report the exact blocker and evidence. Do not silently restart the counter.
9. Do not repeat the same change without materially new evidence.
10. Any scope expansion requires explicit owner approval before implementation.

## Status language

Report separately: confirmed, changed, tested, deployed, and still unverified. A successful build does not prove runtime behavior. A UI screenshot does not prove API routing. Never claim an action or check succeeded without its direct result.

## Runtime guard

`src/core/change-control-policy.mjs` provides a deterministic, side-effect-free guard. `src/core/change-control-coordinator.mjs` coordinates proposals against a host-provided atomic store, freezes the original scope and acceptance criteria, serializes per-issue attempt accounting, enforces the three-attempt ceiling, and closes issues only when the host supplies verification evidence. The coordinator deliberately has no in-memory or non-durable production fallback: a trusted host must supply an atomic persistent store. The current v0.1 chat route does not yet invoke this coordinator, so this is a tested Core capability and policy foundation, not a claim that all live Sofia tasks are already governed by it.
