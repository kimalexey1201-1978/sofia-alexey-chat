const GITHUB_PAGES_HOST = "kimalexey1201-1978.github.io";
const PRODUCTION_WORKER_API = "https://sofia.kim-alexey1201.workers.dev/api/chat";

export function resolveChatApiUrl(locationLike = globalThis.location) {
  if (!locationLike || typeof locationLike.origin !== "string" ||
      typeof locationLike.hostname !== "string") {
    throw new TypeError("A browser location with origin and hostname is required");
  }

  // GitHub Pages is a static host, so it must call the production Worker.
  // Worker-hosted Preview and Production pages use a same-origin API route.
  if (locationLike.hostname.toLowerCase() === GITHUB_PAGES_HOST) {
    return PRODUCTION_WORKER_API;
  }

  return new URL("/api/chat", locationLike.origin).toString();
}
