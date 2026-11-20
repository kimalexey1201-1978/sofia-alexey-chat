# Sofia AI Resource & Runtime Manager — Foundation v1

## Status and purpose

This specification defines resource governance and runtime lifecycle management for Sofia AI. It is not a claim that resource scheduling or Android background execution is already implemented. The existing production app and main branch remain unchanged.

The manager coordinates CPU, memory, GPU/NPU, battery, thermal state, storage, network, foreground/background execution and device capabilities. It must preserve core safety and responsiveness under constrained mobile conditions.

## 1. Core invariants

1. Resource limits are enforced centrally and are visible to the orchestrator.
2. Critical user interaction and safety enforcement take priority over optional workloads.
3. Every module receives an explicit resource budget; modules cannot self-allocate unlimited resources.
4. Resource pressure causes graceful degradation, not uncontrolled crashes or silent data loss.
5. The manager respects OS lifecycle policies and does not promise unrestricted Android background execution.
6. Battery, thermal, network and privacy constraints influence scheduling.
7. Work is cancellable, resumable and idempotent where possible.
8. Secrets and private user data are not copied into diagnostic telemetry.
9. Resource reservations expire and are released on completion, cancellation, crash or timeout.
10. Runtime policy is platform-adapted while preserving common contracts and priorities.

## 2. Managed resource domains

- **CPU:** utilization, core availability, execution time and scheduling priority.
- **Memory:** working set, allocation budget, pressure, cache eviction and out-of-memory risk.
- **GPU/NPU:** accelerator availability, memory limits, thermal cost, supported model/operator constraints.
- **Battery/power:** battery level, charging state, power saver and estimated workload cost.
- **Thermal:** OS thermal status and throttling signals; avoid sustained workloads that cause excessive heat.
- **Storage:** free space, temporary files, cache budgets and encrypted local queues.
- **Network:** connectivity type, metered status, bandwidth/latency estimates and offline operation.
- **Execution slots:** foreground services, scheduled jobs, short-lived tasks and user-visible active sessions.
- **Device capabilities:** sensors and peripherals only through approved Device Manager adapters and granted permissions.

## 3. Workload classes and priorities

- **P0 — Safety and control:** emergency stop, permission revocation, policy enforcement and security-critical state transitions.
- **P1 — Active user interaction:** wake-word session, owner speech extraction, command recognition and response delivery.
- **P2 — Required task execution:** explicitly requested workflows and approved tool operations.
- **P3 — Maintenance:** synchronization, indexing, cache refresh and housekeeping.
- **P4 — Optional/background:** speculative precomputation, nonessential analytics and low-priority enhancements.

Higher priority does not bypass authorization. P0/P1 work still follows Security Manager and IAM policy.

## 4. Scheduling and admission control

Before starting a workload, the manager evaluates:
- requested resource class and estimated budget;
- priority and deadline;
- foreground/background state and user-visible status;
- current memory, thermal and battery pressure;
- network and metered-data policy;
- module trust state and permission scope;
- cancellation, resumability and checkpoint support.

Admission outcomes: **start**, **defer**, **reduce_budget**, **run_on_charger**, **require_network**, or **reject**. Unknown or unbounded requests are rejected or quarantined until measured and constrained.

Use fair scheduling within priority classes to prevent starvation. Apply per-module concurrency limits, global quotas, timeouts and circuit breakers.

## 5. Memory policy

- Assign soft and hard memory budgets by module/workload class.
- Bound caches and evict least-recently-used, reconstructible data first.
- Keep durable task state separate from disposable working memory.
- Stream large media and documents rather than loading them fully where possible.
- Use backpressure between producers and consumers.
- On pressure: stop speculative tasks, shrink caches, pause resumable work, then shed lower-priority workloads.
- Never silently discard user-authored or not-yet-committed task data.
- Record memory-pressure events without recording private payloads.

## 6. CPU, GPU and NPU policy

- Prefer efficient hardware acceleration only when the platform exposes a supported API and the workload benefits.
- Benchmark and select local inference profiles based on latency, energy, memory and thermal behavior.
- Limit concurrency and sustained accelerator use under thermal pressure.
- Fall back to CPU or a remote provider only if privacy, connectivity, cost and policy allow it.
- Do not assume that an NPU is available, accessible to third-party apps or compatible with a given model.
- Yield promptly to OS scheduling and foreground user interaction.

## 7. Battery and thermal policy

- Define configurable battery thresholds and workload classes allowed at each threshold.
- Defer nonessential synchronization and maintenance during low battery or power saver.
- Respect charging-only policies for expensive model downloads, indexing or batch jobs.
- Reduce inference size, frame rate, sampling frequency or concurrency under thermal pressure.
- Never disable OS thermal protections or repeatedly restart a throttled workload.
- Surface a concise status when a requested task is delayed for battery or temperature reasons.

## 8. Android-first runtime lifecycle

Android is the primary target. The implementation must follow current OS restrictions and supported APIs:
- foreground services only for eligible, user-visible work with required service types and notifications;
- WorkManager or scheduled jobs for deferrable, persistent work;
- short-lived execution for immediate tasks;
- explicit user action for workflows that require sustained interaction;
- persist checkpoints before process death where possible;
- recover from process recreation without duplicating external side effects;
- handle permission revocation, Doze, app standby, battery saver and vendor-specific process management.

Do not rely on hidden APIs, accessibility abuse, permanent background polling or bypassing platform restrictions. Wake-word listening, when implemented, must use a compliant, user-consented runtime design and clear microphone indicators.

## 9. Cross-platform adapters

Windows, Linux and macOS adapters may expose different scheduling and resource signals. They must map to common concepts—budgets, priorities, admission outcomes, lifecycle events and cancellation—without pretending the underlying OS guarantees are identical.

## 10. Offline and network-aware operation

- Classify tasks as offline-capable, network-required or network-optional.
- Queue only tasks whose semantics permit delayed execution.
- Encrypt local queues and bind queued actions to their original authorization context.
- Re-evaluate authorization and expiry before replaying queued work.
- Use idempotency keys for external side effects.
- Never silently switch to a provider that violates privacy, residency or cost policy.
- Metered-network use follows owner-configured limits.

## 11. Runtime health and recovery

Track task state: created, admitted, running, paused, checkpointed, resuming, completed, failed, cancelled or expired. Capture bounded failure metadata and restart counts. Apply exponential backoff with jitter for retryable failures; do not retry non-idempotent actions without reconciliation. Repeated crashes trigger module quarantine or circuit breaker policy.

## 12. Acceptance tests

1. P0/P1 work is not starved by P3/P4 tasks.
2. A module cannot exceed its declared hard resource budget.
3. Low-memory pressure sheds optional work before active interaction.
4. Thermal pressure reduces or defers sustained accelerator workloads.
5. Low battery and power saver defer configured optional tasks.
6. Android process death resumes checkpointed work without duplicating side effects.
7. Permission revocation prevents queued work from using the revoked capability.
8. Offline queues are encrypted, bounded and authorization is re-evaluated before replay.
9. Unsupported GPU/NPU access is reported honestly and safely falls back or defers.
10. A telemetry outage does not bypass security or resource limits.

## 13. Implementation boundary

Resource & Runtime Manager exposes versioned admission, budget, scheduling, lifecycle, checkpoint and health interfaces. Platform-specific adapters provide OS signals and execution mechanisms. The manager must integrate with Security Manager, IAM, Audit & Observability Manager, Module Registry and Device Manager without bypassing their policies.
