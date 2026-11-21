import { handleChatRequest } from "./src/worker/chat-route.mjs";
import { handleImageAnalysisRequest } from "./src/worker/image-analysis-route.mjs";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/chat") return handleChatRequest(request, env);
    if (url.pathname === "/api/analyze-image") return handleImageAnalysisRequest(request, env);
    return env.ASSETS.fetch(request);
  }
};
