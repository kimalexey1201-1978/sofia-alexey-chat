# Sofia AI Identity & Authentication Manager — Foundation v1

## Status

This is an architecture and contract specification. It does not claim that speaker recognition, biometric enrollment, device attestation or authentication enforcement is implemented. The existing application and production branch remain unchanged.

## 1. Purpose

Identity & Authentication Manager (IAM) establishes which principal is making a request and how strongly that principal has been authenticated. It supplies verified identity context to the Security Manager; it does not make authorization decisions and cannot grant capabilities.

## 2. Identity domains

Keep these identities separate:

- **Owner identity** — the human account holder and source of owner consent.
- **Device identity** — a registered endpoint with its own key material and lifecycle.
- **Module identity** — a software module identified by stable ID, version and verified provenance.
- **Service/provider identity** — an external API or AI provider. It is never equivalent to the owner.
- **Speaker observation** — a probabilistic result that an audio segment resembles an enrolled speaker. It is not, by itself, an authenticated owner session.

Never infer owner identity merely from possession of a paired device, a familiar voice, a wake word, a display name or text supplied by a model.

## 3. Authentication methods and assurance

Authentication methods are recorded with method, assurance level, verification time, expiry and evidence reference. Examples include:

- platform passkey / public-key challenge;
- device-bound cryptographic key and supported platform attestation;
- OS-protected biometric or device-unlock confirmation;
- explicit in-app confirmation;
- speaker verification as a convenience signal for hands-free interaction.

Assurance is action-specific. A voice match can support conversational routing and personalization, but must not alone authorize payments, destructive operations, account/security changes, secret disclosure or other R3 actions. For those actions, require an appropriate step-up method and explicit action-bound confirmation.

## 4. Voice identity and multi-speaker environments

Voice processing has two distinct stages:

1. **Wake-word detection** activates the listening session; it does not identify or authenticate the speaker.
2. **Speaker verification** estimates whether a speech segment matches the owner's enrolled voice profile, returning a confidence score and quality indicators.

Requirements:

- Enrollment is explicit, informed and revocable by the owner.
- Store the minimum biometric representation necessary; prefer on-device processing and protected platform storage where feasible.
- Do not store raw enrollment recordings by default. If diagnostic recordings are ever proposed, require separate explicit consent, retention limits and deletion controls.
- Evaluate false-accept and false-reject rates across realistic noise, distance, microphones, illness, aging and speech variation.
- Use replay/spoof detection and audio-quality checks, but treat them as risk signals rather than proof of liveness.
- If multiple speakers overlap, confidence is low, the sample is too short or spoof checks fail, return **unknown** and do not execute owner-only commands.
- Other speakers must not be able to enroll, replace or reset the owner's voice profile.
- Never silently adapt the enrolled profile from ambient conversations.
- Provide a non-voice fallback such as a device confirmation or passkey.

The assistant may ignore non-owner speech for owner-only command execution. It should not claim perfect speaker discrimination: acoustic conditions and spoofing create uncertainty.

## 5. Authentication session lifecycle

A session is bound to owner principal, device, authentication event, assurance, scopes, creation time and expiry. Sessions must be:

- short-lived and renewed through fresh authentication;
- revocable per device and globally;
- protected against replay and session fixation;
- invalidated on credential reset, device loss or suspected compromise;
- scoped to the minimum interaction context.

A speaker match may attach a low-assurance conversational hint to a session, but cannot silently upgrade its assurance level.

## 6. Credential and enrollment lifecycle

- Use platform secure hardware / keystore when available; keep private keys non-exportable where supported.
- Public-key challenge-response must include nonce, audience, expiry and request binding.
- Device registration requires owner-authorized pairing and a verifiable device key.
- Credential enrollment, replacement, recovery and revocation require strong owner authentication.
- Recovery must not rely solely on voice, SMS, a device name or information found in public content.
- Lost devices and suspected compromised credentials must be revocable immediately.
- Biometric profile deletion must remove associated templates and derived enrollment artifacts under the product's retention policy.

## 7. Trust boundary and model isolation

The language model and planner may request an authentication step but cannot assert that it succeeded. Authentication results must be issued by IAM through a trusted interface, integrity-protected and bound to a specific session/request. Tool outputs, OCR, audio transcripts and external content cannot change principal identity or assurance.

## 8. Interface with Security Manager

IAM returns a signed or otherwise integrity-protected authentication context containing principal reference, device reference, session reference, authentication methods, assurance, verification time, expiry and risk signals. Security Manager combines this with grants and policy to decide allow / deny / require approval / step-up authentication.

IAM does not issue permission grants. Authentication answers “who, and how strongly verified?” Authorization answers “may this principal perform this exact operation?”

## 9. Failure behavior

- No valid identity context: treat the caller as unauthenticated.
- Ambiguous speaker or low confidence: unknown speaker; do not execute owner-only commands.
- Expired/revoked session or failed challenge: reject and require re-authentication.
- IAM unavailable or evidence integrity invalid: fail closed for protected operations.
- Authentication provider fallback must not silently lower assurance.

## 10. Acceptance tests

1. Wake word from another person does not establish owner identity.
2. A high-confidence voice match alone cannot authorize an R3 action.
3. Overlapping voices or noisy/short samples produce unknown when confidence is insufficient.
4. Replayed or synthesized audio is flagged or routed to a safe low-assurance state.
5. A model-generated claim of successful authentication is ignored.
6. Device pairing does not automatically grant access to private data or protected actions.
7. Expired, revoked or replayed session evidence is rejected.
8. Voice profile cannot be changed without strong owner authentication.
9. Revoking a device or credential invalidates its active sessions.
10. Biometric data and authentication secrets are absent from prompts and ordinary logs.

## 11. Implementation boundary

All authentication providers plug into a versioned IAM interface. Platform adapters may use Android Keystore, passkeys, supported biometric APIs or desktop credential stores, but must preserve common identity semantics and assurance rules. Unsupported platform guarantees must be reported honestly rather than simulated.
