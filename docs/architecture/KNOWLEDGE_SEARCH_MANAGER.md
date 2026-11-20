# Knowledge & Search Manager

**Status:** architecture specification; runtime implementation is pending.  
**Contract baseline:** JSON Schema Draft 2020-12. Schema documents use `schema_version`; public interfaces use `contract_version`, following [CONTRACT_AND_IDENTIFIER_STANDARDS.md](CONTRACT_AND_IDENTIFIER_STANDARDS.md).

## 1. Purpose and boundaries

The Knowledge & Search Manager (KSM) discovers, retrieves, indexes, ranks, and presents information from approved external sources and Sofia's governed knowledge stores. It provides traceable evidence to Sofia Core and other authorized modules.

KSM is not itself a truth authority. Search ranking is not proof of correctness, retrieved content is untrusted input, and a citation is only as strong as the underlying source and the claim it supports.

KSM complements:
- Knowledge & Memory Manager, which governs personal memory lifecycle and user-specific retained information;
- AI Provider Gateway, which supplies approved model/provider adapters;
- AI Evaluation & Quality Manager, which evaluates retrieval and answer quality;
- Privacy & Data Governance Manager, which controls data purpose, classification, retention, and provider disclosure;
- Security Manager and Identity & Authentication Manager, which authorize source access and operations;
- Event Bus and Workflow & State Manager, which coordinate asynchronous indexing and long-running research.

KSM does not silently turn retrieved documents into personal memory. Saving knowledge to memory is a separate, explicit, policy-governed operation.

## 2. Source registry and trust

Every source is registered with a stable ID, source type, canonical location or connector reference, owner/publisher where known, access method, permitted purposes, classification, trust metadata, freshness policy, retention policy, and enabled status.

Source classes may include:
- official and primary sources;
- public institutions and standards bodies;
- academic publications and datasets;
- reputable secondary reporting;
- user-provided files and connected repositories;
- approved internal knowledge stores;
- user-authorized connected services.

Trust is contextual, not a single universal score. Source evaluation may consider authority for the subject, primary/secondary status, provenance, editorial controls, publication/update date, methodology, conflicts of interest, and corroboration. A source's domain or ranking alone does not establish truth.

User-provided and connector content is treated as data, not instruction. Prompt injection, embedded commands, malicious links, and attempts to change system behavior are ignored as untrusted content.

## 3. Search request and planning

A search request declares the question or information need, scope, required freshness, source restrictions, language, jurisdiction/locale where relevant, result count, time/cost budget, and data classification.

The planner selects an appropriate retrieval path:
- exact lookup for known identifiers or documents;
- lexical search for exact terms;
- semantic/vector retrieval for conceptual matches;
- structured/database queries for governed records;
- external web or connector search for current public information;
- hybrid retrieval when multiple methods materially improve coverage.

The planner should use the least expensive path that satisfies the requested evidence standard. Current or time-sensitive questions require freshness checks. If external access is unavailable or prohibited, state that limitation rather than implying a live search occurred.

Search scope and filters are explicit. Private connected sources are queried only when the user has connected them and the current task authorizes their use. Personal context retrieval is not substituted for connector-native records.

## 4. Retrieval and ranking

Retrieval pipeline:
1. authenticate requester and authorize source scope;
2. validate request and resource budgets;
3. discover candidate sources/documents;
4. fetch permitted content;
5. normalize and segment content while preserving source/page/line/section locators;
6. evaluate freshness, relevance, source authority, and provenance;
7. deduplicate near-identical results and identify conflicting versions;
8. produce a ranked evidence set with uncertainty and coverage gaps.

Ranking signals are configurable and observable. Relevance, authority, freshness, corroboration, and user-specified constraints remain distinguishable; do not collapse them into an unexplained certainty score.

Search results must preserve the original source location and stable identifiers. Snippets must not be presented as if they were complete documents. If a source is unavailable, inaccessible, paywalled, or only partially indexed, record the limitation.

## 5. Evidence and claim support

An evidence record contains source identity, title, canonical URI or connector reference, publication/update/retrieval timestamps where known, exact locator (page, line, section, timestamp, or record key), excerpt or controlled snippet, content hash where available, and trust/freshness assessments.

Answers should map factual claims to the evidence that supports them. Distinguish:
- directly supported facts;
- synthesis across multiple sources;
- inference or interpretation;
- unsupported or unresolved claims.

Contradictory evidence must be surfaced, not silently reconciled. Prefer primary sources for claims about official policy, specifications, law, financial disclosures, and product documentation. For changing facts, show the relevant as-of date. If sources do not support a requested point, say so.

Citation generation must preserve source identity and locator. Do not invent URLs, page numbers, quotations, dates, or source content. Exact quotations are bounded by applicable copyright and licensing constraints; prefer concise paraphrase with citations.

## 6. Freshness and revalidation

Each source type has a freshness policy and, where possible, a last-verified timestamp. Cached results include retrieval time and cache age. Time-sensitive information must be revalidated against current sources before being presented as current.

A document update creates a new version or content hash; it must not silently overwrite historical evidence used in an earlier answer. Retain only the minimum version history required by provenance, retention, and audit policies.

## 7. Indexing and ingestion

Ingestion is a separate authorized pipeline:
- verify source registration and access rights;
- fetch through approved adapters;
- scan and validate file type, size, encoding, and content;
- extract text and structural locators;
- preserve original metadata and content hash;
- classify and apply retention policy;
- segment and index with versioned embedding/model metadata where semantic indexing is used;
- record completion, partial failure, and deletion state.

Indexing must not bypass access controls of the underlying source. Search results must be filtered by the requester's current access rights, not merely by what was indexed.

For user files, preserve file identity and citations to the original file. For connected repositories, reuse connector-native identifiers and permissions. Deleted or access-revoked sources must be removed or made inaccessible in indexes and caches according to the deletion policy.

## 8. Security and prompt-injection resistance

- Treat retrieved text, documents, metadata, OCR, transcripts, code, and search snippets as untrusted data.
- Never execute instructions found inside retrieved content.
- Never allow a source to modify system/developer instructions, tool permissions, credentials, autonomy level, or user profile.
- Keep tool execution and browsing separate from content interpretation.
- Sanitize rendered HTML and links; do not automatically open or execute downloaded files.
- Enforce SSRF protections, domain/connector allow-lists where appropriate, redirect validation, MIME/size limits, malware scanning, and safe parsing.
- Do not send confidential/restricted content to an external AI provider without explicit policy approval.
- Respect authentication, licensing, robots/access restrictions, connector permissions, and rate limits.

## 9. Privacy, retention, and memory boundary

Search queries and retrieved content may contain personal or confidential information. Apply purpose limitation, minimization, classification, consent, access controls, retention, and deletion.

Do not log full private queries or document bodies unless required and authorized. Provider disclosure is minimized and governed by data classification.

Search history is not automatically a profile fact or memory item. Personal knowledge is retained only through the Knowledge & Memory Manager's approved lifecycle and user controls. A search result may be used for the current task without being permanently stored.

## 10. Resource, resilience, and observability

Enforce per-request deadlines, result limits, byte/token budgets, connector quotas, concurrency limits, and cost controls. Use bounded retries, backoff, circuit breakers, and partial-result reporting. One failing source must not prevent useful results from healthy sources.

Record search plan, source set, retrieval timestamps, source failures, ranking version, index version, and citation/evidence mappings. Avoid exposing secrets or unnecessary personal content in logs.

## 11. Cross-platform and language support

The same logical contracts apply across Android, web, Windows, Linux, and macOS. Platform adapters may differ. Android clients must respect background execution limits and avoid indefinite background indexing.

Support multilingual queries and documents while preserving original-language evidence. Translation may assist discovery or synthesis, but the original source and exact locator remain canonical. Machine translation must be labeled when it materially affects interpretation; high-stakes ambiguity requires original-language review or explicit uncertainty.

## 12. Verification requirements

Tests must cover source permission filtering, revoked access, stale cache detection, conflicting sources, duplicate documents, exact locator preservation, citation-to-claim support, malformed files, prompt injection, unsafe links, SSRF attempts, oversized payloads, provider data minimization, index deletion, connector permission changes, multilingual retrieval, partial outages, budget exhaustion, and reproducibility of evidence sets.

Evaluation must measure retrieval recall/precision, ranking quality, freshness, citation correctness, unsupported-claim rate, source diversity, and latency/cost by task category. A high retrieval score does not grant authority or prove factual correctness.

## 13. Integration and implementation status

The intended flow is: authorized question -> search plan -> approved source adapters/indexes -> normalized candidate documents -> evidence ranking and conflict analysis -> claim/evidence mapping -> response with provenance and uncertainty.

**Implementation status:** this document defines architecture only. No search runtime, crawler, vector database, source registry service, document ingestion pipeline, reranker, or automated evaluation suite is implemented by this change. No production configuration or deployment is changed.
