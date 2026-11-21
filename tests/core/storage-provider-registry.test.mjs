import test from "node:test";
import assert from "node:assert/strict";
import {
  createStorageProviderRegistry,
  validateStorageProvider
} from "../../src/core/storage-provider-registry.mjs";

const baseProvider = {
  provider_id: "android-media-01",
  provider_type: "android_media_store",
  display_name: "Android media",
  status: "connected",
  authorization_state: "authorized",
  capabilities: ["list", "read", "checksum"],
  created_at: "2026-11-21T04:00:00.000Z"
};

test("validates and registers a provider-neutral storage record", () => {
  const registry = createStorageProviderRegistry();
  const result = registry.register(baseProvider);
  assert.equal(result.ok, true);
  assert.deepEqual(registry.get(baseProvider.provider_id).provider, baseProvider);
});

test("rejects connected providers without explicit authorization", () => {
  const result = validateStorageProvider({
    ...baseProvider, authorization_state: "pending"
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "CONNECTED_PROVIDER_REQUIRES_AUTHORIZATION");
});

test("rejects credentials and unknown fields from provider records", () => {
  const result = validateStorageProvider({
    ...baseProvider, access_token: "must-not-enter-registry"
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "PROVIDER_FIELD_NOT_ALLOWED");
});

test("rejects inconsistent or unsafe quota metadata", () => {
  for (const patch of [
    { quota_bytes: -1 },
    { quota_bytes: 100, used_bytes: 101 },
    { quota_bytes: 100, used_bytes: 40, available_bytes: 50 },
    { quota_bytes: Number.MAX_SAFE_INTEGER + 1 }
  ]) {
    const result = validateStorageProvider({ ...baseProvider, ...patch });
    assert.equal(result.ok, false);
  }
});

test("prevents duplicate provider identities", () => {
  const registry = createStorageProviderRegistry();
  assert.equal(registry.register(baseProvider).ok, true);
  assert.equal(registry.register(baseProvider).code, "PROVIDER_ALREADY_REGISTERED");
});

test("requires connected authorization and a declared capability before resolving an operation", () => {
  const registry = createStorageProviderRegistry();
  registry.register(baseProvider);
  assert.equal(registry.resolveOperation(baseProvider.provider_id, "read").allowed, true);
  assert.equal(registry.resolveOperation(baseProvider.provider_id, "write").reasonCode,
    "PROVIDER_CAPABILITY_NOT_GRANTED");

  const disconnected = {
    ...baseProvider, provider_id: "drive-provider-01",
    provider_type: "google_drive", status: "disconnected",
    authorization_state: "expired"
  };
  registry.register(disconnected);
  assert.equal(registry.resolveOperation(disconnected.provider_id, "read").reasonCode,
    "PROVIDER_NOT_CONNECTED_OR_AUTHORIZED");
});

test("registry returns defensive copies and isolates registry instances", () => {
  const first = createStorageProviderRegistry();
  const second = createStorageProviderRegistry();
  first.register(baseProvider);
  const exposed = first.get(baseProvider.provider_id).provider;
  exposed.capabilities.push("delete");
  assert.deepEqual(first.get(baseProvider.provider_id).provider.capabilities,
    ["list", "read", "checksum"]);
  assert.equal(second.get(baseProvider.provider_id).code, "PROVIDER_NOT_FOUND");
});
