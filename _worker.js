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
        return new Response(null, { status: 204, headers: cors });
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
            { error: "Service is not configured" },
            { status: 503, headers: cors }
          );
        }

        const declaredLength = Number(request.headers.get("Content-Length") || "0");
        if (declaredLength > 1024 * 1024) {
          return Response.json(
            { error: "Request body is too large" },
            { status: 413, headers: cors }
          );
        }

        const rawBody = await request.text();
        if (new TextEncoder().encode(rawBody).byteLength > 1024 * 1024) {
          return Response.json(
            { error: "Request body is too large" },
            { status: 413, headers: cors }
          );
        }

        let body;
        try {
          body = JSON.parse(rawBody);
        } catch {
          return Response.json(
            { error: "Invalid JSON body" },
            { status: 400, headers: cors }
          );
        }

        if (!body || !Array.isArray(body.messages) ||
            body.messages.length < 1 || body.messages.length > 32) {
          return Response.json(
            { error: "Invalid messages payload" },
            { status: 400, headers: cors }
          );
        }

        const allowedRoles = new Set(["system", "user", "assistant"]);
        const validMessages = body.messages.every(message =>
          message &&
          typeof message === "object" &&
          allowedRoles.has(message.role) &&
          typeof message.content === "string" &&
          message.content.length > 0 &&
          message.content.length <= 20000
        );
        if (!validMessages) {
          return Response.json(
            { error: "Invalid message format" },
            { status: 400, headers: cors }
          );
        }

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

        const responseText = await upstream.text();
        if (!upstream.ok) {
          // Do not forward provider error bodies, which may contain internal diagnostics.
          return Response.json(
            { error: "The model provider request failed" },
            { status: 502, headers: cors }
          );
        }

        let data;
        try {
          data = JSON.parse(responseText);
        } catch {
          return Response.json(
            { error: "The model provider returned an invalid response" },
            { status: 502, headers: cors }
          );
        }

        return Response.json(data, {
          status: 200,
          headers: cors
        });

      } catch {
        return Response.json(
          { error: "The chat service encountered an internal error" },
          { status: 500, headers: cors }
        );
      }
    }

    return env.ASSETS.fetch(request);
  }
};
