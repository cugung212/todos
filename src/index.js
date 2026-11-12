// Cloudflare Worker: serves /api/todos. Everything else is the page in public/.
// Needs in the project settings:
//   - KV namespace binding named TODOS (declared in wrangler.toml)
//   - Secret environment variable TODO_TOKEN (at least 16 characters)

const MAX_BYTES = 1024 * 1024; // 1 MB

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// Compare every character so the check does not leak the token through timing.
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function tokenConfigured(env) {
  return typeof env.TODO_TOKEN === "string" && env.TODO_TOKEN.length >= 16;
}

function authorized(request, env) {
  const header = request.headers.get("Authorization") || "";
  return safeEqual(header, `Bearer ${env.TODO_TOKEN}`);
}

function validTasks(list) {
  return (
    Array.isArray(list) &&
    list.length <= 5000 &&
    list.every(
      (t) =>
        t &&
        typeof t.id === "string" && t.id.length <= 64 &&
        typeof t.text === "string" && t.text.length <= 500 &&
        typeof t.done === "boolean" &&
        (t.doneAt === null || typeof t.doneAt === "number")
    )
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/todos") return new Response("Not found", { status: 404 });
    if (!tokenConfigured(env)) return json({ error: "server token not configured" }, 500);
    if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);

    if (request.method === "GET") {
      const raw = await env.TODOS.get("list");
      return json({ tasks: raw ? JSON.parse(raw) : [] });
    }

    if (request.method === "PUT") {
      const text = await request.text();
      if (text.length > MAX_BYTES) return json({ error: "too large" }, 413);

      let body;
      try {
        body = JSON.parse(text);
      } catch (e) {
        return json({ error: "invalid json" }, 400);
      }
      if (!validTasks(body && body.tasks)) return json({ error: "invalid list" }, 400);

      await env.TODOS.put("list", JSON.stringify(body.tasks));
      return json({ ok: true });
    }

    return json({ error: "method not allowed" }, 405);
  },
};
