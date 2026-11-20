# Sofia AI — privacy and telemetry policy

Status: approved architectural requirement; applies to future implementation and operational configuration.
Scope: minimize diagnostic data while retaining enough information to detect and investigate service failures. This document does not itself change Cloudflare or production configuration.

## 1. Data-minimization principles

- Collect only telemetry needed for availability, reliability, security, and performance.
- Prefer aggregate counters and coarse timings over request-level records.
- Do not collect conversation text, prompts, model responses, uploaded file contents, or attachment names in routine telemetry.
- Never log API keys, authorization headers, cookies, access tokens, passwords, or other secrets.
- Avoid collecting or retaining precise location, full IP addresses, browser fingerprints, or unrelated request headers unless a documented security need requires them.
- Treat request metadata and diagnostic output as potentially personal data.

## 2. Operational logging

- Keep application error logging available, but make log fields explicit and allowlisted.
- Log stable error categories, component names, status codes, bounded duration measurements, and correlation IDs where useful.
- Redact or omit sensitive values before logs leave the Worker.
- Do not serialize the complete request, environment, headers, provider payload, or exception object into logs.
- Successful request-by-request invocation records should be disabled by default when aggregate metrics and application error logs are sufficient.
- Diagnostic verbosity may be temporarily increased for a specific incident, with an explicit reason, limited scope, and a return to the privacy-preserving baseline.

## 3. Retention and access

- Persist only the minimum operational logs needed for troubleshooting.
- Use the shortest practical retention period supported by the selected platform and the operational need.
- Restrict dashboard and log access to authorized owners/operators; protect access with strong authentication.
- Do not export telemetry to a third party or another provider without an explicit privacy, security, and owner-authorization review.
- Document the data categories, destination, retention period, and access roles for each telemetry destination.

## 4. Sampling and cost control

- Prefer aggregate metrics and error-focused records over full-fidelity successful invocation logs.
- Use sampling for high-volume diagnostic events where supported; preserve critical security and failure signals.
- Distinguish platform event quotas from Worker request quotas, CPU/runtime limits, and model-provider quotas.
- Do not generate synthetic traffic or extra requests merely to test logging settings.
- Review telemetry volume periodically and remove redundant events before increasing paid limits.

## 5. Cloudflare operational baseline

The owner has manually changed the Production Worker Observability settings as follows:

- Logs: enabled.
- Include Invocation logs: disabled.
- Persist logs to the Workers dashboard: enabled.
- Traces: disabled.
- Issues: disabled (as observed in the dashboard review).

This is a privacy- and cost-conscious operational choice, not a claim that all logging is disabled. Application-generated logs may still be persisted. Those logs must follow the allowlist and redaction rules above.

The Cloudflare dashboard displayed a recommendation to synchronize observability settings with `wrangler.jsonc`. Do not modify the repository configuration automatically. First inspect the current Wrangler schema and project configuration, determine the exact supported fields and deployment implications, then propose a minimal reviewed change. Production deployment requires separate owner approval.

## 6. Incident diagnostics

When troubleshooting:
1. Start with aggregate status, error counts, and bounded timing metrics.
2. Inspect only the smallest relevant time window.
3. Avoid exposing raw headers, IP addresses, user content, or secrets in screenshots and copied reports.
4. If more detail is necessary, enable narrowly scoped diagnostics for a limited period and turn them off afterward.
5. Record the reason, scope, and cleanup of any temporary diagnostic expansion.

## 7. Acceptance criteria

- Routine telemetry excludes message contents, prompts, model outputs, files, credentials, and unnecessary identifying metadata.
- Successful invocation-level logging is off by default unless a documented operational need justifies it.
- Error diagnosis remains possible through sanitized application errors and aggregate metrics.
- Retention and access are explicit for each telemetry destination.
- Configuration changes are reviewed against the actual platform schema and are not deployed without owner approval.
- Privacy controls do not silently disable the Worker, API functionality, or essential security monitoring.
