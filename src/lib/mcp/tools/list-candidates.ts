import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function client(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

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
    let q = client(ctx)
      .from("candidates")
      .select("id,name,current_job_title,current_employer,location,salary_expectation,status,email,linkedin_url,note,updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit ?? 20);
    if (search) q = q.or(`name.ilike.%${search}%,current_job_title.ilike.%${search}%,current_employer.ilike.%${search}%`);
    if (location) q = q.ilike("location", `%${location}%`);
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
