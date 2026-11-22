export class AgentRegistry {
  #agents = new Map();

  register(manifest, executor) {
    if (!manifest || typeof manifest.id !== "string" || !manifest.id.trim()) {
      throw new TypeError("Executor manifest requires an id");
    }
    if (typeof manifest.version !== "string" || !manifest.version.trim()) {
      throw new TypeError("Executor manifest requires a version");
    }
    if (!Array.isArray(manifest.capabilities) || manifest.capabilities.some(x => typeof x !== "string")) {
      throw new TypeError("Executor manifest capabilities must be a string array");
    }
    if (!executor || typeof executor.execute !== "function") {
      throw new TypeError("Executor must implement execute(task, context)");
    }
    if (this.#agents.has(manifest.id)) throw new Error(`Executor already registered: ${manifest.id}`);

    this.#agents.set(manifest.id, {
      manifest: Object.freeze({
        id: manifest.id,
        version: manifest.version,
        capabilities: Object.freeze([...manifest.capabilities]),
        enabled: manifest.enabled === true
      }),
      executor
    });
  }

  resolve(capability) {
    for (const entry of this.#agents.values()) {
      if (entry.manifest.enabled && entry.manifest.capabilities.includes(capability)) return entry;
    }
    return null;
  }

  list() {
    return [...this.#agents.values()].map(({ manifest }) => ({ ...manifest, capabilities: [...manifest.capabilities] }));
  }
}
