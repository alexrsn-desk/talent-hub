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
  name: "create_note",
  title: "Create note",
  description:
    "Add a note attached to a candidate, job, client, or contact on the signed-in recruiter's desk. Exactly one of candidate_id, job_id, client_id, or contact_id must be provided.",
  inputSchema: {
    content: z.string().min(1).describe("The note body."),
    candidate_id: z.string().uuid().optional(),
    job_id: z.string().uuid().optional(),
    client_id: z.string().uuid().optional(),
    contact_id: z.string().uuid().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ content, candidate_id, job_id, client_id, contact_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const targets = [candidate_id, job_id, client_id, contact_id].filter(Boolean).length;
    if (targets !== 1) {
      return {
        content: [{ type: "text", text: "Provide exactly one of candidate_id, job_id, client_id, or contact_id." }],
        isError: true,
      };
    }
    const { data, error } = await client(ctx)
      .from("notes")
      .insert({
        content,
        candidate_id: candidate_id ?? null,
        job_id: job_id ?? null,
        client_id: client_id ?? null,
        contact_id: contact_id ?? null,
        owner_user_id: ctx.getUserId(),
      })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Note saved (id: ${data.id}).` }],
      structuredContent: { note: data },
    };
  },
});
