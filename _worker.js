export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        if (!env.OPENROUTER_API_KEY) {
          return Response.json({ error: "На сервере не настроен секрет OPENROUTER_API_KEY." }, { status: 500 });
        }
        const body = await request.json();
        if (!Array.isArray(body.messages) || !body.messages.length) {
          return Response.json({ error: "Не передана история сообщений." }, { status: 400 });
        }
        const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
        });
        const data = await upstream.json();
        return Response.json(data, { status: upstream.status });
      } catch (error) {
        return Response.json({ error: error?.message || "Внутренняя ошибка Worker." }, { status: 500 });
      }
    }
    return env.ASSETS.fetch(request);
  }
};
