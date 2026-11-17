export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const cors = {
      "Access-Control-Allow-Origin": "https://kimalexey1201-1978.github.io",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (url.pathname === "/api/chat") {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: cors
        });
      }

      if (request.method !== "POST") {
        return Response.json(
          { error: "Method not allowed" },
          { status: 405, headers: cors }
        );
      }

      try {
        if (!env.OPENROUTER_API_KEY) {
          return Response.json(
            { error: "API key is missing" },
            { status: 500, headers: cors }
          );
        }

        const body = await request.json();

        const upstream = await fetch(
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
              model: env.OPENROUTER_MODEL || "nvidia/nemotron-3-nano-30b-a3b:free",
              messages: body.messages,
              temperature: 0.7
            })
          }
        );

        const data = await upstream.json();

        return Response.json(data, {
          status: upstream.status,
          headers: cors
        });

      } catch (error) {
        return Response.json(
          { error: error.message },
          { status: 500, headers: cors }
        );
      }
    }

    return env.ASSETS.fetch(request);
  }
};
