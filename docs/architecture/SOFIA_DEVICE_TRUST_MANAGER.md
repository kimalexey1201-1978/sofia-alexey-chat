# Sofia Device Trust Manager — Architecture Specification v1

## Status and scope

Architecture specification only. It does not implement cryptographic pairing, platform attestation, secure key storage, device enrollment, revocation propagation, or hardware integrations. It does not change the working chat, `main`, production settings, secrets, deployments, or Cloudflare configuration.

## 1. Purpose

Device Trust Manager (DTM) evaluates whether a registered device's identity and security posture are sufficiently supported by current evidence for a narrowly defined use. It supplies time-bounded, provenance-bearing trust assessments to Sofia Security Manager (SSM) and Sofia Universal Device Manager (SDM).

DTM does not authenticate the human owner, grant capabilities, decide whether a task is authorized, or execute device commands.

## 2. Separate trust domains

DTM must preserve the following distinctions:

- **Owner authentication (IAM):** who is acting and the assurance of that session.
- **Device identity:** which cryptographic endpoint is presenting proof.
- **Pairing:** an owner-authorized association procedure; not proof of continuing trust.
- **Device trust (DTM):** evidence-based assessment of identity binding and posture for defined use classes.
- **Capability authorization (CPR/SSM):** whether this principal/module may perform this exact operation on this target.
- **Connection state:** whether a transport currently reaches the device.
- **Health state:** whether the device/adapter appears operational.
- **Privacy state (PAOM):** whether an output route or sensor context is suitable for a particular disclosure.

No one state substitutes for another. A familiar device name, nearby radio beacon, MAC address, QR code, serial number, vendor label, successful network connection, or model assertion is not cryptographic identity proof.

## 3. Trust assessment model

A DTM assessment is a deterministic evaluation of evidence with provenance, integrity, freshness, scope and limitations. Evidence may include:

- proof of possession of a device-bound private key using a fresh challenge;
- secure platform/vendor pairing evidence;
- supported platform attestation and its validation status;
- credential/key status, rotation and revocation state;
- owner confirmation performed within an authenticated IAM session;
- vendor-account binding, where independently verified;
- device integrity or posture signals, where the platform actually supports them.

Evidence must record issuer/source, verification method, observation time, expiry, request/audience binding, nonce or challenge reference, and validation result. Unsupported evidence is `not_supported`, unavailable evidence is `unavailable`, and expired evidence is `stale`; none is silently upgraded to valid.

DTM returns one of:
- `trusted`: current evidence meets policy for the declared use classes;
- `trusted_with_limits`: only explicitly listed use classes or constraints are acceptable;
- `untrusted`: evidence failed or identity binding is invalid;
- `unknown`: evidence is missing, stale, unsupported or inconclusive;
- `revoked`: device or credential has been revoked.

Trust is not a single permanent score. Use class and risk matter. A device may be trusted for read-only status but not for sensor capture, physical control or administration.

## 4. Secure pairing protocol

Pairing must be initiated by the owner from a valid IAM session. Discovery never starts privileged pairing automatically.

1. SDM creates a pending candidate record with minimal discovery metadata. It remains untrusted.
2. The owner selects the exact device and sees its claimed identity, requested capabilities, data classes and permissions.
3. The pairing broker selects a supported platform/vendor secure pairing method. The selected method and its security properties are explicit.
4. DTM issues a short-lived, single-use cryptographic challenge bound to the candidate device reference, owner session, pairing transaction, expected audience, requested method and expiry.
5. Device proves possession of its private key or completes the supported authenticated pairing ceremony. Where available, compare a short authentication string or confirm out-of-band on both endpoints.
6. DTM validates the response, nonce, audience, signature/key binding, expiry, replay state and any attestation chain. It does not accept a client-supplied “verified” boolean.
7. Owner confirms the exact device and requested association. Sensitive devices and sensor/control capabilities require clear additional disclosure and explicit confirmation.
8. A credential reference is registered in protected storage; raw private keys, pairing secrets and bearer tokens are never returned to the model or written to logs.
9. DTM issues a time-bounded assessment. SDM transitions the device only to the state justified by evidence. CPR grants remain a separate process.

If the device cannot prove cryptographic identity, the system may support a clearly labeled lower-assurance/manual association only where policy permits; it must remain limited and must never be described as cryptographically verified. For R3 physical control or administration, unsupported identity proof fails closed.

## 5. Challenge and replay protection

Challenges must be generated by a cryptographically secure random source and be unpredictable, single-use, short-lived and audience-bound. Bind each challenge to:

- challenge ID and nonce;
- device candidate/reference and expected public-key fingerprint where known;
- owner principal/session and pairing transaction;
- expected protocol, audience and operation;
- issue/expiry timestamps and policy version.

Responses must be checked for exact binding. Reject reused, expired, malformed, wrong-audience, wrong-device, wrong-key, or already-consumed challenges. A retry requires a fresh challenge. Do not reuse pairing challenges for command authorization or owner authentication.

## 6. Credential and key lifecycle

Where supported, generate device keys in hardware-backed or OS-protected keystores and mark private keys non-exportable. Prefer modern, standardized cryptographic protocols and platform APIs; do not invent cryptography or implement custom algorithms.

Store only public-key material or fingerprints, algorithm/key identifiers, attestation references, status and opaque secure-store handles. Secret material remains in the device/platform secure element or protected server-side vault as appropriate. Do not store secrets in localStorage, chat history, source code, ordinary database fields, prompts or logs.

Credential lifecycle states include pending, active, rotation_pending, suspended, revoked, expired and compromised. Rotation must prove continuity or require a fresh owner-approved pairing ceremony. Old keys are invalidated after successful rotation according to a documented overlap window; no indefinite dual-key acceptance.

## 7. Attestation validation and limitations

Attestation is optional and platform-dependent. DTM must validate certificate chains, issuer, signature, freshness, challenge binding, revocation status and the exact claims supported by the platform. It must distinguish hardware-backed proof from software-only claims.

Never infer that a device is uncompromised merely because attestation passed. Attestation is one evidence source with a bounded meaning and validity period. If the platform does not expose reliable attestation, report `not_supported` and apply a policy-approved restricted path rather than fabricating assurance.

Vendor account linking is not automatically device attestation. Vendor assertions are treated as external evidence and independently validated where possible.

## 8. Revocation, loss and compromise response

The owner must be able to suspend or revoke a device/credential from another authenticated device or recovery channel. Support:
- per-device and per-key revocation;
- immediate invalidation of active trust assessments and pairing sessions;
- propagation to SDM registry, IAM sessions bound to the device, CPR grants, SSM decisions, active command queues and adapter sessions;
- cancellation of queued commands where possible;
- rotation of affected credentials;
- audit event with reason, actor, time and affected references;
- recovery by fresh owner authentication and a new pairing ceremony.

A lost, stolen, compromised, or ownership-disputed device is denied protected operations immediately. If revocation propagation cannot be confirmed, protected operations remain blocked. Re-registering a device must not restore old grants or trust automatically.

## 9. SSM integration and fail-closed rules

For every protected operation, SSM receives a current DTM assessment reference and checks:
- device reference exactly matches the requested target;
- verdict and allowed-use class cover the requested operation;
- assessment and evidence have not expired or been revoked;
- device credential/key is active;
- pairing and owner/session context remain valid;
- no revocation, compromise or policy conflict exists.

DTM cannot return ALLOW for an operation. Only SSM issues the authorization decision after checking IAM, CPR grants, Authority Envelope, owner consent/approval, DGLM, risk and RBM. Execution Supervisor revalidates the decision immediately before side effects.

Unknown, stale, unavailable, invalid, conflicting or unverifiable trust evidence blocks protected operations. Policy may permit explicitly defined low-risk read-only use with limited evidence, but never silently downgrade the assurance required for a higher-risk action.

## 10. Privacy and audit

DTM records only minimal security evidence references and decision metadata. Never log private keys, shared secrets, raw biometric data, raw audio/video, full location history, access tokens or unnecessary device telemetry. Do not expose fingerprints or internal attestation details to untrusted external content or models.

Audit events should identify device and credential references, pairing transaction, proof method, evidence verdicts, policy version, assessment validity, revocation propagation status and correlation ID. Retention and deletion follow Data Governance & Lifecycle Manager policies.

## 11. Android-first and cross-platform behavior

Android is the first implementation target. Use Android Keystore and platform-supported secure pairing/attestation APIs only where the specific device and OS version support them. Report hardware backing, StrongBox availability, biometric/device-unlock requirements and attestation support accurately. Do not promise hardware-backed storage or attestation on every Android device.

Future Windows, Linux and macOS adapters must map native credential stores and device identity mechanisms into the same versioned contracts. Platform-specific claims remain explicit; no adapter may simulate unsupported security properties.

## 12. Acceptance tests

1. Nearby/discovered device cannot become trusted without the required pairing proof.
2. Device name, MAC address, QR payload or model text cannot establish identity.
3. Pairing challenge is unpredictable, single-use, audience-bound and expires.
4. Replayed, expired, wrong-device, wrong-key or wrong-audience responses are rejected.
5. Owner confirmation is required in an authenticated session and is bound to the exact device and pairing request.
6. Attestation is accepted only after chain, signature, issuer, freshness, nonce and claim validation.
7. Unsupported attestation is reported as unsupported, never as passed.
8. Trust verdict is scoped to permitted use classes and expires.
9. Pairing, trust, health, connectivity and capability grant remain separate.
10. Revocation invalidates assessments, sessions, grants, decisions and pending commands according to the defined propagation contract.
11. A revoked or compromised device cannot be reactivated by a stale cached assessment.
12. Key rotation rejects old credentials after the defined overlap window.
13. DTM cannot issue capability grants or SSM ALLOW decisions.
14. Private keys, tokens and raw biometric/audio/video data never enter prompts or ordinary logs.
15. Existing chat, history, frontend, Worker API and production branch remain unchanged.

## 13. Implementation sequence

A. Validate contracts and threat model with IAM, SDM, SSM, CPR and Audit.
B. Implement a deterministic trust evaluator with fixture-based tests and no hardware access.
C. Implement challenge issuance/consumption and replay storage.
D. Integrate Android Keystore and one supported secure-pairing flow.
E. Add attestation validation only for platforms with verifiable support.
F. Implement revocation propagation and recovery tests.
G. Connect DTM assessments to SSM and SDM behind disabled-by-default feature flags.
H. Conduct security review and adversarial testing before enabling real device control.

No pairing, key management, attestation, or revocation runtime is implemented by this specification.
