export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        if (!env.OPENROUTER_API_KEY) {
          return Response.json(
            { error: "API key is not configured" },
            { status: 500 }
          );
        }

        const body = await request.json();

        const response = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
              "HTTP-Referer": url.origin,
              "X-Title": "Sofia and Alexey"
            },
            body: JSON.stringify({
              model: env.OPENROUTER_MODEL ||
                "nvidia/nemotron-3-nano-30b-a3b:free",
              messages: body.messages,
              temperature: 0.7
            })
          }
        );

        const data = await response.json();

        return Response.json(data, {
          status: response.status
        });

      } catch (error) {
        return Response.json(
          { error: error.message },
          { status: 500 }
        );
      }
    }

    return env.ASSETS.fetch(request);
  }
};
