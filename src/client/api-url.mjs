const GITHUB_PAGES_HOST = "kimalexey1201-1978.github.io";
const PRODUCTION_WORKER_ORIGIN = "https://sofia.kim-alexey1201.workers.dev";

export function resolveApiUrl(path, locationLike = globalThis.location) {
  if (typeof path !== "string" || !/^\/api\/[a-z0-9-]+$/.test(path)) {
    throw new TypeError("A supported Sofia API path is required");
  }
  if (!locationLike || typeof locationLike.origin !== "string" ||
      typeof locationLike.hostname !== "string") {
    throw new TypeError("A browser location with origin and hostname is required");
  }
  const origin = locationLike.hostname.toLowerCase() === GITHUB_PAGES_HOST
    ? PRODUCTION_WORKER_ORIGIN
    : locationLike.origin;
  return new URL(path, origin).toString();
}
