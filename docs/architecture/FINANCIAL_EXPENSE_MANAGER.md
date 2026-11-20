# Financial & Expense Manager

**Status:** architecture specification; runtime implementation is pending.  
**Contract baseline:** JSON Schema Draft 2020-12. Versioning follows [CONTRACT_AND_IDENTIFIER_STANDARDS.md](CONTRACT_AND_IDENTIFIER_STANDARDS.md).

## 1. Purpose

Financial & Expense Manager (FEM) provides privacy-controlled personal finance organization: income and expense records, account and transaction views where authorized, budgets, savings goals, recurring obligations, cash-flow summaries, and payment preparation. It is designed to help the user understand and organize financial information, not to make autonomous financial decisions or act as a bank.

The default posture is read-only. Any transfer, purchase, bill payment, investment order, credit application, account change, or other movement of value is a separate high-impact operation requiring explicit, fresh, action-specific authorization and any confirmation imposed by the financial provider.

## 2. Responsibility boundaries

- FEM owns normalized personal-finance records, budgets, expense categorization, financial goals, cash-flow analysis, and payment-intent preparation.
- Automation & Integration Manager supplies approved bank, payment, payroll, and finance-provider adapters and connection lifecycle.
- Identity & Authentication Manager resolves the user and provider account identity.
- Security Manager authorizes every protected read or write.
- Privacy & Data Governance Manager enforces purpose, consent, classification, retention, export, and deletion.
- Autonomy & Decision Manager sets authority and confirmation requirements; FEM cannot grant authority.
- Task Orchestrator coordinates analysis and planning tasks.
- Workflow & State Manager owns durable workflow state and recovery.
- Resource & Runtime Manager enforces quotas, deadlines, and concurrency.
- Audit & Observability Manager records access decisions and financial side effects with strict data minimization.
- Notification & Reminder Manager delivers payment reminders and alerts; it does not initiate payments.
- AI Provider Gateway may support categorization or explanation only when permitted data is minimized and disclosed.

FEM does not custody funds, hold credentials, bypass bank controls, or treat a model-generated suggestion as authorization.

## 3. Data sources and trust

Potential sources include user-entered records, imported statements, authorized bank APIs, payroll providers, payment processors, and receipts/documents processed through File & Document Manager.

Each record carries source provenance, account reference, observation/import time, currency, and confidence/status where applicable. Imported data is not automatically authoritative: duplicates, pending versus posted transactions, reversals, refunds, exchange-rate conversions, and provider corrections must be represented distinctly.

Do not scrape banking websites, bypass MFA, store bank passwords, or request credentials in chat. Use official APIs or user-mediated file import and supported secure authorization flows.

## 4. Financial data model

Support accounts, balances, transactions, counterparties, categories, budgets, recurring obligations, savings goals, and reconciliation references. Amounts use decimal-safe representations (never binary floating-point for money), an explicit ISO 4217 currency code where available, and clear sign/flow semantics.

Never silently combine currencies. Exchange-rate values require source and timestamp. Distinguish available, current, ledger, and pending balances. Distinguish estimated, imported, provider-confirmed, and user-confirmed values.

Transaction states may include pending, posted, declined, reversed, refunded, disputed, and unknown. Duplicate detection must not discard evidence; uncertain matches are surfaced for review.

## 5. Budgeting and expense analysis

Budgets may be scoped by period, category, account, currency, and user-defined envelope. Expense categories can be user-defined or suggested. AI-generated categorization remains a proposal until accepted or governed by a user-configured low-risk rule.

Cash-flow projections must state assumptions, date range, included accounts, treatment of pending items, and uncertainty. Do not present projections as guaranteed balances or guaranteed ability to pay. Avoid shame-based or coercive language.

## 6. Savings goals and obligations

Goals define target amount, currency, target date, current confirmed amount, contribution plan, and optional priority. Contribution plans are informational unless the user explicitly authorizes a separate payment operation.

Recurring obligations include due date, expected amount/range, currency, payee reference, recurrence, and source. A reminder is not a payment authorization. Changes in payee, amount, currency, or due date require revalidation.

## 7. Financial advice boundary

The manager may summarize records, explain calculations, compare user-defined scenarios, identify cash-flow gaps, and provide educational context. It must distinguish facts, calculations, assumptions, and recommendations.

It must not claim to be a licensed financial adviser, guarantee returns, predict market outcomes as facts, or make suitability determinations from incomplete data. Investment, lending, tax, legal, and regulated financial questions require appropriate scope and clear uncertainty. Model output cannot authorize a financial transaction.

## 8. Payment preparation and execution boundary

Payment support is disabled by default and begins with read-only due-date and payee information. If a provider supports payment initiation through an approved API, the system must use a separate payment workflow with:

- authenticated account and payee resolution;
- exact amount and currency;
- fees, exchange rate, and execution date where relevant;
- idempotency key and provider transaction reference;
- explicit purpose and policy decision;
- fresh confirmation bound to the exact payee, amount, currency, source account, and date;
- step-up authentication or provider approval as required;
- independent status reconciliation.

Any change to those parameters invalidates the previous approval. Never infer approval from a general budget, recurring schedule, conversation tone, or prior payment. Never execute an investment trade, loan, transfer, or purchase merely because an agent proposes it.

## 9. Security and privacy

Financial information is highly sensitive. Apply restricted classification by default unless a policy explicitly determines otherwise. Minimize collection and provider disclosure; isolate accounts and principals; encrypt data in transit and at rest; redact account identifiers and amounts from ordinary logs; and use protected vault references for tokens.

Require explicit consent and least-privilege scopes. Provide access review, disconnect, revocation, export, correction, and deletion. Enforce retention limits and do not retain raw statements or receipts longer than necessary.

Protect against prompt injection in transaction descriptions, malicious attachments, account substitution, payee spoofing, replay, duplicate payment, unauthorized sharing, and confused-deputy attacks. External descriptions are untrusted data, never instructions.

## 10. Reliability and reconciliation

Use decimal-safe arithmetic, deterministic rounding rules, explicit currency conversion, provider revision references, bounded retries, and idempotency. Distinguish payment submitted, provider accepted, processing, settled, rejected, reversed, refunded, and completion unknown.

When payment completion is unknown, reconcile with the provider before retrying. Do not report a payment as completed based only on a local click or queued request. Preserve an immutable audit trail for authorized financial side effects without retaining unnecessary sensitive payloads.

## 11. Android-first and cross-platform requirements

Android is the primary client. Use secure OS storage for tokens where appropriate, biometric/device credential gates only as an additional factor rather than a substitute for provider authentication, and visible confirmation screens. Respect app lifecycle, background limits, and notification permissions.

Other platforms use the same contracts and policy boundary. Financial capabilities are discovered per provider, account, region, API version, and authorization scope. Unsupported services remain unavailable; no universal bank connectivity is assumed.

## 12. Verification requirements

Test decimal arithmetic, rounding, currency mismatch, FX provenance, duplicate transactions, pending-to-posted transitions, reversals/refunds, account isolation, revoked tokens, scope escalation, provider outage, stale balances, malicious transaction descriptions, statement import limits, retention/deletion, audit redaction, payment parameter tampering, approval expiry/invalidation, idempotency, uncertain completion, reconciliation, and unauthorized model/tool attempts.

## 13. Implementation status

**Implementation status:** this change adds architecture and versioned contracts only. It does not connect bank accounts, import statements, store financial records, calculate live balances, initiate payments, or access investment accounts. No production configuration or existing prototype data is changed.
