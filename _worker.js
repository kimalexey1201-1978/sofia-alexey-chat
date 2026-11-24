export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const cors = {
      "Access-Control-Allow-Origin": "https://kimalexey1201-1978.github.io",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Expose-Headers": "Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset"
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
              model: env.OPENROUTER_MODEL || "openrouter/free",
              messages: body.messages,
              temperature: 0.7
            })
          }
        );

        const data = await upstream.json();

        // Forward only safe rate-limit diagnostics. Never expose provider credentials.
        const responseHeaders = new Headers(cors);
        for (const name of [
          "Retry-After",
          "X-RateLimit-Limit",
          "X-RateLimit-Remaining",
          "X-RateLimit-Reset"
        ]) {
          const value = upstream.headers.get(name);
          if (value !== null) responseHeaders.set(name, value);
        }

        return Response.json(data, {
          status: upstream.status,
          headers: responseHeaders
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
