import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const load = async name => JSON.parse(await readFile(new URL(`../../contracts/v1/${name}.schema.json`, import.meta.url), "utf8"));

test("storage provider contract separates connectivity from authorization", async () => {
  const schema = await load("storage-provider");
  assert.equal(schema.additionalProperties, false);
  assert.ok(schema.properties.provider_type.enum.includes("google_drive"));
  assert.ok(schema.properties.capabilities.items.enum.includes("create_container"));
  assert.ok(schema.properties.capabilities.items.enum.includes("quota"));
  assert.ok(schema.allOf.some(rule => rule.then?.properties?.authorization_state?.const === "authorized"));
});

test("transfer contract requires destination integrity evidence before completion", async () => {
  const schema = await load("file-transfer-job");
  const completionGate = schema.allOf.find(rule => rule.if?.properties?.state?.enum?.includes("completed"));
  assert.ok(completionGate);
  for (const field of ["source_hash_sha256", "destination_hash_sha256", "destination_object_ref", "destination_verified_at"]) {
    assert.ok(completionGate.then.required.includes(field));
  }
});

test("local cleanup is a separate approved phase, never implied by upload completion", async () => {
  const schema = await load("file-transfer-job");
  const approvalGate = schema.allOf.find(rule => rule.then?.required?.includes("cleanup_approval_ref"));
  assert.ok(approvalGate);
  assert.ok(approvalGate.then.required.includes("cleanup_approval_ref"));
  assert.ok(approvalGate.then.required.includes("cleanup_approved_at"));
  assert.ok(!schema.properties.state.enum.includes("delete_source_automatically"));
});

test("Android MediaStore inventory is metadata-only and explicitly scoped by OS permission state", async () => {
  const schema = await load("android-media-inventory");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, [
    "contract_version", "scan_id", "provider_id", "permission_state",
    "permission_scope", "scanned_at", "items"
  ]);
  assert.ok(schema.properties.permission_scope.enum.includes("user_selected_media"));
  assert.ok(schema.properties.permission_scope.enum.includes("user_selected_folder"));
  assert.equal(schema.properties.items.maxItems, 10000);
  assert.equal(schema.properties.items.items.additionalProperties, false);
  assert.ok(schema.properties.items.items.properties.content_reference);
  assert.ok(!schema.properties.items.items.properties.access_token);
  assert.ok(!schema.properties.items.items.properties.raw_path);
  assert.ok(schema.allOf.some(rule =>
    rule.then?.properties?.permission_scope?.const === "none" &&
    rule.then?.properties?.items?.maxItems === 0
  ));
});
