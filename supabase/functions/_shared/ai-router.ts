// Automatic model routing for every Desky AI feature.
// Callers keep sending OpenAI-style chat-completions bodies; aiFetch picks the
// model for the task tier and, for Claude, translates to/from the Messages API.

export type AiTier = "writing" | "reasoning" | "fast";

export const TIER_MODELS: Record<AiTier, string> = {
  writing: "anthropic/claude-sonnet-5", // human-facing prose: emails, pitches, notes, briefs, chat
  reasoning: "openai/gpt-5.5", // structured extraction, scoring, comparisons
  fast: "google/gemini-3-flash-preview", // high-volume background scans & matching
};

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

// deno-lint-ignore no-explicit-any
type Any = any;

export async function aiFetch(tier: AiTier, _url: unknown, init: RequestInit): Promise<Response> {
  const body: Any = JSON.parse(String(init.body ?? "{}"));
  const model = TIER_MODELS[tier];
  const key = Deno.env.get("LOVABLE_API_KEY") ?? "";
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${key}`);

  if (model.startsWith("anthropic/")) {
    if (body.stream) {
      // Streaming isn't translated; fall back to the fast tier for streamed calls.
      return fetch(`${GATEWAY}/chat/completions`, { ...init, headers, body: JSON.stringify({ ...body, model: TIER_MODELS.fast }) });
    }
    return claudeCall(model, body, headers, init.signal ?? undefined);
  }

  const out: Any = { ...body, model };
  if (model.startsWith("openai/")) {
    delete out.temperature;
    delete out.top_p;
    if (out.max_tokens != null) { out.max_completion_tokens = out.max_tokens; delete out.max_tokens; }
  }
  return fetch(`${GATEWAY}/chat/completions`, { ...init, headers, body: JSON.stringify(out) });
}

function textOf(c: Any): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((p) => (typeof p === "string" ? p : p?.text ?? "")).join("");
  return c == null ? "" : String(c);
}

function toAnthropicContent(c: Any): Any {
  if (!Array.isArray(c)) return textOf(c);
  return c.map((p: Any) => {
    if (p?.type === "image_url") {
      const url: string = p.image_url?.url ?? "";
      const m = url.match(/^data:([^;]+);base64,(.*)$/);
      return m ? { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } }
               : { type: "image", source: { type: "url", url } };
    }
    return { type: "text", text: p?.text ?? textOf(p) };
  });
}

async function claudeCall(model: string, body: Any, headers: Headers, signal?: AbortSignal): Promise<Response> {
  const system: string[] = [];
  const messages: Any[] = [];
  const push = (role: string, block: Any) => {
    const last = messages[messages.length - 1];
    const blocks = typeof block === "string" ? [{ type: "text", text: block || " " }] : Array.isArray(block) ? block : [block];
    if (last && last.role === role) last.content.push(...blocks);
    else messages.push({ role, content: blocks });
  };
  for (const m of body.messages ?? []) {
    if (m.role === "system" || m.role === "developer") system.push(textOf(m.content));
    else if (m.role === "tool") push("user", { type: "tool_result", tool_use_id: m.tool_call_id, content: textOf(m.content) });
    else if (m.role === "assistant") {
      const blocks: Any[] = [];
      const t = textOf(m.content);
      if (t) blocks.push({ type: "text", text: t });
      for (const tc of m.tool_calls ?? []) {
        let input = {};
        try { input = JSON.parse(tc.function?.arguments || "{}"); } catch { /* keep empty */ }
        blocks.push({ type: "tool_use", id: tc.id, name: tc.function?.name, input });
      }
      push("assistant", blocks.length ? blocks : " ");
    } else push("user", toAnthropicContent(m.content));
  }
  if (body.response_format?.type?.startsWith("json")) {
    system.push("Respond with a single valid JSON object only, no prose or code fences.");
  }

  const req: Any = { model, max_tokens: body.max_tokens ?? body.max_completion_tokens ?? 8192, messages };
  if (system.length) req.system = system.join("\n\n");
  if (Array.isArray(body.tools) && body.tools.length) {
    req.tools = body.tools.map((t: Any) => ({
      name: t.function.name,
      description: t.function.description ?? "",
      input_schema: t.function.parameters ?? { type: "object", properties: {} },
    }));
    const tc = body.tool_choice;
    if (tc === "required") req.tool_choice = { type: "any" };
    else if (tc && typeof tc === "object" && tc.function?.name) req.tool_choice = { type: "tool", name: tc.function.name };
  }

  headers.set("anthropic-version", "2023-06-01");
  const res = await fetch(`${GATEWAY}/messages`, { method: "POST", headers, body: JSON.stringify(req), signal });
  if (!res.ok) return new Response(await res.text(), { status: res.status, headers: { "Content-Type": "application/json" } });
  const data: Any = await res.json();

  let text = "";
  const tool_calls: Any[] = [];
  for (const b of data.content ?? []) {
    if (b.type === "text") text += b.text;
    else if (b.type === "tool_use") tool_calls.push({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } });
  }
  const message: Any = { role: "assistant", content: text };
  if (tool_calls.length) message.tool_calls = tool_calls;
  const finish = data.stop_reason === "tool_use" ? "tool_calls" : data.stop_reason === "max_tokens" ? "length" : "stop";
  return new Response(JSON.stringify({
    id: data.id, object: "chat.completion", model,
    choices: [{ index: 0, message, finish_reason: finish }],
    usage: { prompt_tokens: data.usage?.input_tokens ?? 0, completion_tokens: data.usage?.output_tokens ?? 0 },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}
