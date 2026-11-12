// Cloudflare Worker: serves /api/todos. Everything else is the page in public/.
// Needs in the project settings:
//   - KV namespace binding named TODOS (declared in wrangler.toml)

const MAX_BYTES = 1024 * 1024; // 1 MB

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
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
        (t.priority === undefined || typeof t.priority === "boolean") &&
        (t.doneAt === null || typeof t.doneAt === "number")
    )
  );
}

function validPickCount(n) {
  return Number.isInteger(n) && n >= 1 && n <= 999;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/todos") return new Response("Not found", { status: 404 });

    if (request.method === "GET") {
      const raw = await env.TODOS.get("list");
      const pick = await env.TODOS.get("pickCount");
      return json({
        tasks: raw ? JSON.parse(raw) : [],
        pickCount: pick ? Number(pick) : null,
      });
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
      if (body.pickCount !== undefined && !validPickCount(body.pickCount)) {
        return json({ error: "invalid pick count" }, 400);
      }

      await env.TODOS.put("list", JSON.stringify(body.tasks));
      if (body.pickCount !== undefined) {
        await env.TODOS.put("pickCount", String(body.pickCount));
      }
      return json({ ok: true });
    }

    return json({ error: "method not allowed" }, 405);
  },
};
