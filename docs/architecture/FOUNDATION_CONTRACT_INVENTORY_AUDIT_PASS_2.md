# Sofia AI Foundation — Contract Inventory & Compatibility Audit, Pass 2

Status: inventory and static structural review; not full JSON Schema meta-validation, executable contract testing, or release qualification.
Branch: `foundation/bootstrap`.

## 1. Inventory scope

The recursive Git tree at the candidate branch was inspected. At the start of this pass the repository contained 169 tracked files, including 45 architecture Markdown documents and 119 schemas under `contracts/v1/`. The rental-session schema was subsequently relocated into the canonical contract directory, bringing that directory to 120 schema files. The separate architecture document was updated to reference the canonical path, and the misplaced duplicate was removed.

This pass fetched and parsed the 119 pre-existing `contracts/v1/*.schema.json` files as JSON. The newly relocated rental-session contract was fetched and parsed separately. All 120 contract files are therefore confirmed to be syntactically valid JSON at the time of review. This is not equivalent to validating them against the official Draft 2020-12 meta-schema or validating sample instances.

## 2. Positive findings

- All 119 pre-existing contract files parsed as JSON without syntax errors.
- The inspected schemas consistently declare JSON Schema Draft 2020-12.
- All inspected top-level schema objects use `additionalProperties: false`.
- The only external `$ref` occurrences found in this inventory were the three preference references in `user-profile.schema.json`; each points to an existing contract file in the canonical contract directory.
- The rental-session schema is now located at `contracts/v1/vehicle-rental-session.schema.json`, uses the canonical `https://sofia.ai/contracts/v1/...` identifier pattern, and requires a non-null `ended_at` when status is `ended` or `expired`.

## 3. Findings requiring remediation

### C-07 — Missing canonical schema_version in legacy contracts

The normative Contract & Identifier Standards document requires new schema artifacts to declare `schema_version: "1.0.0"`. The inventory found 56 of the 119 pre-existing schemas without a `schema_version` property. The remaining 63 include the field. The affected files span several foundation modules, including identity/security, API, device, event, memory, orchestration, autonomy, and vehicle contracts.

This is a mixed legacy baseline, not a reason to bulk-edit files. Required next step: create a field-level inventory and compatibility migration plan; then migrate one contract family at a time with producer/consumer tests. No existing contract was rewritten in this pass.

### C-08 — Non-canonical and placeholder $id namespaces

The inventory found multiple historical `$id` host patterns, including `https://sofia.ai`, `https://sofia-ai.local`, and `https://sofia-ai.example`. These identifiers are not uniformly canonical. In particular, `.local` and `.example` are placeholder-style namespaces and should not be silently treated as stable published identifiers.

Required next step: approve a canonical schema-ID namespace and a versioned reference migration strategy. Update referencing schemas and registry records together; preserve immutable historical identifiers through explicit aliases or migration records. Do not rename identifiers in bulk without checking downstream references.

### C-09 — Rental contract was initially stored outside the contract directory

The rental-session schema was first added under `docs/architecture/`. This was inconsistent with the repository's established contract layout. It has now been moved to `contracts/v1/vehicle-rental-session.schema.json`; both architecture references were updated and the misplaced duplicate deleted. The corrected file was fetched and parsed after relocation.

## 4. Structural limitations and unresolved validation

- JSON parsing confirms syntax only. Full Draft 2020-12 meta-schema validation has not yet been run.
- No representative positive/negative instance fixtures have been validated against all contracts.
- No automated compatibility test matrix has been run across producers and consumers.
- `$ref` resolution was checked for the three references in `user-profile.schema.json`; exhaustive reference resolution across every nested conditional/dynamic construct has not been independently run.
- The inventory did not establish that every architecture document, capability identifier, module identifier, and schema field is semantically aligned.
- No runtime, Android, CI, deployment, or live integration behavior was tested.

## 5. Disposition

**Result: PARTIAL / NOT RELEASE-READY.**

This pass confirms JSON syntax for 120 schema files and records concrete migration issues. It does not close C-01 through C-09. Existing legacy contracts remain unchanged except for the new rental contract being placed in its canonical directory and its architecture references being corrected.

## 6. Next work

1. Produce a complete schema metadata report: `schema_version`, `contract_version`, `$id`, required fields, identifier formats, timestamp conventions, and data-classification fields.
2. Resolve the canonical `$id` namespace and legacy schema-version migration strategy.
3. Validate every schema against the Draft 2020-12 meta-schema and build valid/invalid instance fixtures.
4. Build a producer-consumer compatibility matrix from architecture documents, capability IDs, and schema references.
5. Resolve the existing consistency findings C-01 through C-06 with explicit decisions and evidence before Sofia Core implementation begins.
