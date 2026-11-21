# Owner addressing rule — correction and regression verification

**Date:** 2026-11-21  
**Branch:** `core/v0.1-admission-approval-guard`  
**Scope:** server-owned prompt, browser compatibility prompt, and local first-run greeting only.

## Finding

A prior remediation record and the Worker regression test encoded the prohibited form of address as the preferred form. The browser prompt had subsequently been corrected, but the server-owned Worker instruction and local first-run greeting had not been aligned. Since the Worker instruction is authoritative, changing only the browser prompt was insufficient.

## Correction

- The server-owned instruction now prohibits only the exact word `любимый` and explicitly permits other affectionate forms of address.
- The local greeting now uses `дорогой`, which is not prohibited.
- The browser instruction continues to state that only the specified word is prohibited and other affectionate forms are allowed.
- The Worker regression test now asserts the exact prohibition and confirms that other affectionate forms remain allowed.

## Acceptance criteria

1. The authoritative Worker instruction must not tell Sofia to use the prohibited form.
2. The instruction must explicitly permit other affectionate forms.
3. The local greeting must not contain the prohibited form.
4. A regression test must fail if the stale instruction returns.

## Verification status

The source changes and regression assertions are committed to the development PR branch. Automated CI and Cloudflare Preview results for the latest commit must be checked before this correction is considered verified or deployed. Production was not modified.
