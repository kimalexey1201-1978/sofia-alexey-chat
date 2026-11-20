import { handleChatRequest } from "./src/worker/chat-route.mjs";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/chat") {
      return handleChatRequest(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};
