import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireRecord } from "../supabase";
import { searchLiteral } from "../validation";

export default defineTool({
  name: "list_candidates",
  title: "List candidates",
  description:
    "List candidates on the signed-in recruiter's desk. Optional filters: text search across name/title/employer, location, minimum salary, and status. Results are capped at 50.",
  inputSchema: {
    search: z.string().optional().describe("Free text matched against name, current job title, and current employer."),
    location: z.string().optional().describe("Substring match on candidate location."),
    min_salary: z.number().optional().describe("Minimum salary expectation."),
    status: z.string().optional().describe("Exact candidate status (e.g. Active, Placed, Uncontacted)."),
    limit: z.number().int().min(1).max(50).optional().describe("Max rows to return, default 20."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ search, location, min_salary, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = supabaseForUser(ctx)
      .from("candidates")
      .select("id,name,job_title,current_employer,location,salary_expectation,status,email,linkedin_url,note,updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit ?? 20);
    if (search) q = q.or(`name.ilike.%${searchLiteral(search)}%,job_title.ilike.%${searchLiteral(search)}%,current_employer.ilike.%${searchLiteral(search)}%`);
    if (location) q = q.ilike("location", `%${searchLiteral(location)}%`);
    if (typeof min_salary === "number") q = q.gte("salary_expectation", min_salary);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
