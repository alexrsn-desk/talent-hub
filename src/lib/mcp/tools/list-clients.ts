import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireRecord } from "../supabase";
import { searchLiteral } from "../validation";

export default defineTool({
  name: "list_clients",
  title: "List clients",
  description: "List clients on the signed-in recruiter's desk. Optional text search on company name.",
  inputSchema: {
    search: z.string().optional().describe("Substring match on company name."),
    limit: z.number().int().min(1).max(50).optional(),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = supabaseForUser(ctx)
      .from("clients")
      .select("id,company_name,status,sector,updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit ?? 20);
    if (search) q = q.ilike("company_name", `%${searchLiteral(search)}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
