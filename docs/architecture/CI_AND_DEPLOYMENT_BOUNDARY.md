# CI and Deployment Boundary — Observed Checks

## Purpose

Record observed CI/deployment signals before changing runtime code. This document is diagnostic only. It does not change GitHub Actions, Cloudflare Builds, branch settings, Worker configuration, secrets, or deployment behavior.

## Current branch and verified test signal

Working branch: `core/v0.1-minimal-cycle`.

The repository GitHub Actions workflow `.github/workflows/sofia-core-tests.yml` runs:
1. Cloudflare Worker dry-run build;
2. Draft 2020-12 JSON Schema compilation;
3. provider and Core Node.js tests.

The latest known successful run before the Durable Object design update is run `44828187755`, commit `cd13731de0e83e938d47b82db8f9a8eeae463798`. All three substantive steps completed successfully.

The Durable Object adapter design update is commit `5ba82a00cb7c967eed3127f45c0a203b2b86b4be`; its GitHub Actions run `44828396730` was still in progress at the time this document was prepared. Do not treat it as green until the run is completed successfully.

## Cloudflare integration observation

GitHub check-runs for commits `cf405f540354a0276c086b0ac85b2022572e612a` and `cbf8049ac9632cad2efc580c1c240d5dceb70ce2` included a check named `Workers Builds: sofia`. The check metadata points to the Cloudflare `sofia/production/builds` page and both checks concluded `failure`.

The GitHub check summary exposes only the build ID and Worker service name; it does not expose the underlying build log or failure reason. Therefore:
- the cause of the Cloudflare build failures is not established;
- a failed build check is not evidence of a successful deployment;
- the available GitHub metadata does not conclusively establish whether a deployment was attempted or whether any live Worker changed;
- no claim of production deployment or non-deployment should be made without checking Cloudflare's deployment history.

A later documentation-only commit did not show a Cloudflare Workers Builds check, which may indicate path-based build triggering, but that behavior has not been confirmed.

## Required gate before further runtime-code changes

Before adding or changing runtime source code on this branch:
1. Review Cloudflare Workers Builds branch and path triggers in the Cloudflare dashboard.
2. Confirm the production deployment branch and whether pushes to `core/v0.1-minimal-cycle` can trigger production builds/deployments.
3. Retrieve the failed build logs for the two build IDs above and identify the failure cause.
4. Confirm the currently active production deployment/version and compare it with the last known-good deployment.
5. Ensure future Core development commits cannot deploy to production without an explicit release action.

Do not change Cloudflare settings, GitHub integration, secrets, production branch configuration, or deployment controls as part of this investigation without explicit approval.

## Operational rule

Until the deployment boundary is verified, keep work to documentation, isolated tests, and local/dry-run validation. Do not add a Durable Object binding, namespace declaration, migration, route wiring, or production adapter.
