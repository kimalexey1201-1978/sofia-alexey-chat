# Sofia AI — Privacy & Observability Data Policy

Status: architectural policy proposal based on the Cloudflare Observability records inspected on 2026-11-20. Review and implementation are pending.
Scope: Sofia AI application, Cloudflare Workers runtime, diagnostics, logs, traces, and future telemetry. This document does not change Cloudflare account settings or production behavior.

## 1. Policy objectives

Sofia AI must collect and retain only telemetry necessary to operate, secure, troubleshoot, and improve the service. Diagnostic visibility must not become a secondary store of conversations, credentials, or unnecessary personal data.

Apply data minimization, purpose limitation, least privilege, bounded retention, access control, and explicit separation between application content and operational telemetry.

## 2. Observed Cloudflare event fields

The owner inspected a Workers Observability event for a POST request to the Sofia API. The screenshots showed the following categories. These observations describe the inspected event only; they do not prove that every event has identical fields or that the complete event has been exhaustively inspected.

- Event metadata: message, level, timestamp, duration/latency-related fields, identifiers and error-related fields.
- Request metadata: HTTP method/path, protocol, header names, selected header values, content length and content type.
- Client/network metadata: `cf-connecting-ip`, `cf-ipcountry`, ASN, Cloudflare Ray ID, colo and network performance fields.
- Approximate geolocation: country, region, city, timezone, coordinates and postal code.
- TLS metadata: TLS version, cipher suite, client hello characteristics, fingerprints and certificate-related fields.
- Browser/client metadata: user-agent, accept-language, origin, referer and browser/client hints.

The inspected record showed an informational message identifying the POST endpoint `/api/chat`; a request content length of 2446 bytes; an IPv6 value in `cf-connecting-ip`; country code KR; and other connection/geolocation metadata. The screenshots did not show a chat prompt, model response, or API key in the portions inspected. The event was not proven to be fully inspected, so absence of sensitive fields from the entire record has not been established.

## 3. Data classification

Classify telemetry into four groups:

1. **Operational minimum:** timestamp, route template, method, status/outcome, duration, bounded error code, deployment/version identifier and correlation ID.
2. **Potentially identifying metadata:** IP address, precise or approximate location, postal code, ASN, user-agent, language, origin and referer. Treat these as personal or linkable data; collect only where necessary and minimize precision and retention.
3. **Sensitive application content:** user prompts, assistant responses, uploaded file contents, extracted text, transcripts, message bodies and request/response payloads. Do not place these in routine logs or traces.
4. **Secrets and authentication material:** API keys, provider tokens, authorization values, cookies, session identifiers, passwords, private keys and signed credentials. Never log these. Redact at source before any log/trace sink.

## 4. Logging rules for Sofia application code

- Do not log complete request or response bodies for `/api/chat` or other content-bearing routes.
- Do not log user messages, assistant replies, system prompts, provider prompts, uploaded file contents, OCR, transcripts, or model outputs.
- Do not log environment variables, API keys, bearer tokens, cookies, authorization headers, or secret-bearing URLs.
- Prefer route templates such as `/api/chat` over full URLs and query strings.
- Use structured, allowlisted fields rather than serializing arbitrary request, response, exception, or environment objects.
- Sanitize exception messages and stack traces; provider errors must not leak request payloads, credentials, or private upstream details.
- Avoid recording IP addresses, exact coordinates, postal codes, full referers, and stable device identifiers in application-generated telemetry unless a documented security need requires them.
- If a security use case requires source IP, isolate it in a restricted security event stream with a documented purpose, short retention, and access audit; do not duplicate it into general application logs.
- Correlation IDs must be random/non-semantic and must not encode user identity or message content.

## 5. Cloudflare platform telemetry

Cloudflare may generate platform-level request and connection metadata independently of Sofia's application logging. Application code cannot be assumed to control every platform-generated field. Before promising that IP, location, headers, or TLS metadata are absent, verify the current Cloudflare product controls, plan behavior, retention, and applicable configuration.

Review and document separately:
- Workers Observability event/log collection and daily limits;
- Workers Logs and Traces settings, sampling, filtering and retention controls;
- which request headers and network fields are platform-generated and whether they can be excluded, masked, or disabled;
- whether request/response bodies are captured by any enabled tracing or logging feature;
- account plan and any billing/overage behavior effective on the date of review.

Do not upgrade, disable, or change account settings as part of this policy document. Make changes only after the owner reviews the exact setting, expected effect, cost, and rollback path.

## 6. Retention and access

- Set the shortest retention compatible with operational and security needs.
- Separate routine operational logs from security/audit records and application memory.
- Restrict log access to authorized maintainers; enable account MFA and review access periodically.
- Do not copy raw telemetry into issue trackers, chat, screenshots, or public repositories without redaction.
- Document deletion and export behavior, including any provider-side retention that Sofia cannot directly control.
- Never treat Cloudflare Observability as Sofia's conversation memory or durable task store.

## 7. Tracing and sampling

- Keep routine traces limited to operational spans and allowlisted attributes.
- Do not attach prompt text, completion text, request bodies, response bodies, file content, or credentials to spans.
- Prefer sampling over collecting every successful request when supported and when sampling preserves sufficient diagnostic value.
- Preserve error and latency diagnostics with sanitized attributes.
- Document sampling rate, exclusions, retention, and the operational reason for each trace attribute.

## 8. Provider and external-service boundaries

Before sending user data to any model/provider or external executor, apply the provider's permission, privacy, cost, and data-handling rules. Provider fallback must not silently broaden data disclosure. Telemetry must not expose provider request bodies, provider credentials, or private upstream responses.

## 9. Audit and verification checklist

Before enabling or changing telemetry, verify:

- no request/response body capture is enabled for content-bearing endpoints;
- no prompt, completion, file content, or transcript is emitted by application logs;
- no Authorization, Cookie, API key, token, or secret appears in event fields;
- IP and geolocation collection is understood, justified, minimized where controls permit, and access-restricted;
- header allowlists and redaction are applied before export;
- retention and access permissions are known;
- event volume and plan limits are monitored without enabling paid services automatically;
- test events with synthetic data are inspected end-to-end;
- changes have a documented rollback path and owner approval.

## 10. Implementation sequence

1. Complete the manual inspection of representative Cloudflare events and identify which fields are platform-generated versus application-generated.
2. Inspect the current Worker source for `console.log`, `console.error`, request/response serialization, tracing, and exception logging. Do not infer behavior from Observability screenshots alone.
3. Review Cloudflare account settings for Workers Logs, Traces, sampling, body capture, retention and pricing; record current values without changing them.
4. Add a small allowlisted structured logger and central redaction utility if needed, with unit tests that assert secrets and content are removed.
5. Add tests using synthetic prompts, responses, authorization headers, cookies, and provider errors to prove they do not enter application logs.
6. Configure platform telemetry only after confirming the exact controls and their impact; obtain explicit owner approval before changes.
7. Reinspect test events and verify the resulting data, volume, retention, and cost behavior.

## 11. Acceptance criteria

The policy is satisfied when Sofia's application logs contain only allowlisted operational data; conversation content and secrets are excluded at source; personal/network metadata is minimized and access-restricted to the extent supported by the platform; platform-generated collection and retention are documented accurately; no paid upgrade or account setting change occurs without explicit approval; and automated tests prevent regressions.