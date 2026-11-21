import test from "node:test";
import assert from "node:assert/strict";
import { reconcileFileInventories } from "../../src/core/file-inventory-reconciler.mjs";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const OWNER = "owner-1";
const created = "2026-11-21T04:00:00.000Z";

function file(overrides = {}) {
  return {
    file_id: "123e4567-e89b-42d3-a456-426614174000",
    provider_id: "android",
    original_filename: "photo.jpg",
    size_bytes: 2048,
    content_hash_sha256: HASH_A,
    owner_principal_id: OWNER,
    data_classification: "personal",
    lifecycle_state: "available",
    created_at: created,
    ...overrides
  };
}

test("matches identical content across providers even when filenames differ", () => {
  const result = reconcileFileInventories([
    { provider_id: "android", items: [file()] },
    { provider_id: "drive", items: [file({
      file_id: "123e4567-e89b-42d3-a456-426614174001",
      provider_id: "drive", original_filename: "IMG_2026_01.jpg"
    })] }
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.exact_duplicates.length, 1);
  assert.equal(result.same_content_not_mergeable.length, 0);
});

test("does not match different content merely because filenames are equal", () => {
  const result = reconcileFileInventories([
    { provider_id: "android", items: [file()] },
    { provider_id: "drive", items: [file({
      file_id: "123e4567-e89b-42d3-a456-426614174001",
      provider_id: "drive", content_hash_sha256: HASH_B
    })] }
  ]);
  assert.equal(result.exact_duplicates.length, 0);
});

test("keeps matching bytes separate when owner, access, retention or consent scope differs", () => {
  for (const patch of [
    { owner_principal_id: "another-owner" },
    { access_control_ref: "restricted-acl" },
    { retention_expires_at: "2027-01-01T00:00:00.000Z" },
    { consent_ref: "different-consent" }
  ]) {
    const result = reconcileFileInventories([
      { provider_id: "android", items: [file()] },
      { provider_id: "drive", items: [file({
        file_id: "123e4567-e89b-42d3-a456-426614174001",
        provider_id: "drive", ...patch
      })] }
    ]);
    assert.equal(result.exact_duplicates.length, 0);
    assert.equal(result.same_content_not_mergeable.length, 1);
    assert.equal(result.same_content_not_mergeable[0].reason, "GOVERNANCE_SCOPE_MISMATCH");
  }
});

test("rejects malformed hashes from duplicate matching", () => {
  const result = reconcileFileInventories([
    { provider_id: "android", items: [file({ content_hash_sha256: "not-a-hash" })] },
    { provider_id: "drive", items: [file({
      file_id: "123e4567-e89b-42d3-a456-426614174001", provider_id: "drive"
    })] }
  ]);
  assert.equal(result.invalid.length, 1);
  assert.equal(result.exact_duplicates.length, 0);
});

test("does not compare a file against itself and ignores deleted records", () => {
  const result = reconcileFileInventories([
    { provider_id: "android", items: [file(), file({
      file_id: "123e4567-e89b-42d3-a456-426614174001",
      lifecycle_state: "deleted"
    })] }
  ]);
  assert.equal(result.exact_duplicates.length, 0);
  assert.equal(result.scanned_count, 1);
});

test("isolates provider inventory scopes and rejects mismatched provider IDs", () => {
  const result = reconcileFileInventories([
    { provider_id: "android", items: [file({ provider_id: "drive" })] }
  ]);
  assert.equal(result.invalid[0].reason, "PROVIDER_SCOPE_MISMATCH");
  assert.equal(result.scanned_count, 0);
});
