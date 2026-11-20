import { defineReconciliationStorageContract } from "../contracts/reconciliation-storage.contract.mjs";
import { createInMemoryReconciliationStore } from "../../src/core/reconciliation-storage.mjs";

defineReconciliationStorageContract({
  name: "in-memory reconciliation storage test double",
  createStore: async () => createInMemoryReconciliationStore()
});
