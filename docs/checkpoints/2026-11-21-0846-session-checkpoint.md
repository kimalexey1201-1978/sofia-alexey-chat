# Sofia AI — session checkpoint

**Checkpoint date:** 2026-11-21 08:46 UTC  
**Purpose:** Resume the current development session without repeating completed work.

## Repository state

- Repository: `kimalexey1201-1978/sofia-alexey-chat`
- Working branch: `core/v0.1-admission-approval-guard`
- Pull request: `#2`, open, not merged; base branch `core/v0.1-minimal-cycle`.
- Latest known commit at checkpoint: `e5b51b67ffc4c04589534da1f352f6ccc94e3452`.
- Production branch/environment was not modified by this work.
- Do not merge or deploy to Production without the owner's explicit instruction.

## User's exact interaction requirement

The user prohibited only the exact Russian word `любимый` as a form of address. Other affectionate forms are allowed. Do not broaden this prohibition into neutral-only communication or prohibit other affectionate words. Do not address the user by name unless explicitly requested.

## Work completed in this session

1. Added bounded change policy:
   - `src/core/change-control-policy.mjs`
   - `tests/core/change-control-policy.test.mjs`
   - `docs/architecture/bounded-change-control.md`
   - Policy permits at most three attempts per issue (initial attempt plus two corrections), rejects duplicate changes without new evidence, requires explicit approval for scope expansion, and requires verification evidence to close an issue.
2. Added a coordinator intended to use a host-provided atomic persistent store:
   - `src/core/change-control-coordinator.mjs`
   - `tests/core/change-control-coordinator.test.mjs`
   - It freezes initial scope/acceptance criteria, serializes attempt accounting through the injected store, and rejects work after issue closure.
   - Important: this is not yet wired into the live chat/worker execution path. No persistent production store has been connected. Do not describe this as active enforcement for all live Sofia tasks.
3. Corrected addressing instruction in the authoritative server Worker:
   - `src/worker/chat-route.mjs` now prohibits only the exact word `любимый` and explicitly permits other affectionate forms.
4. Updated regression assertions in `tests/worker/chat-route.test.mjs`.
5. Updated local first-run greeting in `index.html` to `Привет, дорогой!`.
6. Added audit note:
   - `docs/audits/2026-11-21-addressing-rule-correction.md`
7. Browser prompt already contained the correct narrow rule and bounded-work instructions.
8. Preview API routing helper and tests are present:
   - `src/client/chat-api-url.mjs`
   - `tests/client/chat-api-url.test.mjs`
9. Wrangler preview configuration was previously corrected in `wrangler.jsonc`.

## CI findings and current status

- Commit `c4b65fb706470a71bbe7b37c1284a8ab4bc1fd91` had a successful CI run including Worker dry-run, JSON Schema validation, and Core/provider tests.
- Later CI runs failed because the server prompt change made an existing test assertion stale: the test expected lowercase `не называй его по имени`, while the new prompt says `Не называй пользователя по имени без необходимости`.
- That assertion was corrected in commit `e5b51b67ffc4c04589534da1f352f6ccc94e3452`.
- At the time of this checkpoint, the GitHub Actions run for `e5b51b6` was queued/in progress; no final result had yet been confirmed.
- Cloudflare's last confirmed Preview deployment was for commit `c4b65fb`, not the latest changes. Do not claim the newest server prompt/greeting has been deployed to Preview until a fresh Cloudflare status confirms it.
- Previous CI failures on commits `358a7f5`, `4aeeadd`, `acccd58`, `c001487`, and `24fba73` all need not be rerun individually; the latest commit is the relevant verification target.

## Resume checklist — next actions

1. Check GitHub Actions for commit `e5b51b67ffc4c04589534da1f352f6ccc94e3452`.
2. If it fails, inspect the exact failing test/log and make only the smallest evidence-based correction; avoid parallel commits that create redundant CI runs.
3. Confirm Cloudflare Preview build/deployment for the latest successful commit; do not infer deployment from CI dry-run.
4. Verify the latest Preview's server prompt and greeting behavior, ideally with a real request and visible response.
5. Continue the bounded-change coordinator integration only after reviewing the existing storage interfaces. Identify a suitable durable atomic store; do not silently substitute the in-memory reconciliation test double, which is explicitly non-durable and unsuitable for production.
6. Verify persistent attempt count across process/isolate restarts and concurrent proposals before calling the guard production-ready.
7. Keep Production unchanged unless the owner separately authorizes a production change.

## Reporting discipline

Always distinguish:
- source code changed;
- tests passed;
- Worker build dry-run passed;
- Preview actually deployed;
- runtime behavior confirmed;
- Production deployed.

These are separate claims and must not be conflated. No claim of successful runtime behavior without direct evidence.
