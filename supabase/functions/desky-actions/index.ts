// Desky Action Layer HTTP entrypoint.
// POST { action, payload, mode? } with the caller's Supabase JWT.
//   mode: "execute" (default) | "preview" — preview never writes.
// Every call is authenticated, validated with zod and executed through a
// user-scoped Supabase client, so RLS decides what the caller can touch.
// No service-role key is used anywhere in this function.
import { ActionError, buildContext } from "../_shared/actions/core.ts";
import { catalogue, registry } from "../_shared/actions/registry.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-desky-client",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const ctx = await buildContext(req);

    // GET-style discovery for MCP/agent tooling.
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = String(body.action ?? "").trim();
    if (!action || action === "list_actions") return json({ actions: catalogue() });

    const def = registry.get(action);
    if (!def) return json({ error: `Unknown action "${action}"`, code: "unknown_action" }, 404);

    const parsed = def.schema.safeParse(body.payload ?? {});
    if (!parsed.success) {
      return json({
        error: "Invalid input",
        code: "invalid_input",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      }, 400);
    }

    if (body.mode === "preview") {
      if (!def.preview) {
        return json({ error: `Action "${action}" has no preview`, code: "no_preview" }, 400);
      }
      const preview = await def.preview(parsed.data, ctx);
      return json({ mode: "preview", ...preview });
    }

    const data = await def.handler(parsed.data, ctx);
    return json({ data });
  } catch (e) {
    if (e instanceof ActionError) {
      return json({ error: e.message, code: e.code }, e.status);
    }
    console.error("[desky-actions] unexpected error", e);
    return json({ error: "Request could not be completed", code: "internal_error" }, 500);
  }
});
