// Cloudflare Pages Function, served at /api/todos.
// Needs two settings in the Pages project (see the instructions):
//   - KV namespace binding named TODOS
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

function authorized(request, env) {
  if (!env.TODO_TOKEN || env.TODO_TOKEN.length < 16) return false;
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

export async function onRequestGet({ request, env }) {
  if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);
  const raw = await env.TODOS.get("list");
  return json({ tasks: raw ? JSON.parse(raw) : [] });
}

export async function onRequestPut({ request, env }) {
  if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);

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
