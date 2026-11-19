import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireRecord } from "../supabase";
import { searchLiteral } from "../validation";

export default defineTool({
  name: "create_note",
  title: "Create note",
  description:
    "Add a note attached to a candidate, job, client, or contact on the signed-in recruiter's desk. Exactly one of candidate_id, job_id, client_id, or contact_id must be provided.",
  inputSchema: {
    activity_type: z.enum(["Note", "Call", "Email", "Meeting"]).default("Note"),
    content: z.string().min(1).describe("The note body."),
    candidate_id: z.string().uuid().optional(),
    job_id: z.string().uuid().optional(),
    client_id: z.string().uuid().optional(),
    contact_id: z.string().uuid().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ content, activity_type, candidate_id, job_id, client_id, contact_id }, ctx) => {
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
    const sb = supabaseForUser(ctx);
    const target = candidate_id ? ['candidates', candidate_id] : job_id ? ['jobs', job_id] : client_id ? ['clients', client_id] : contact_id ? ['contacts', contact_id] : null;
    if (!target) throw new Error('Note target required');
    await requireRecord(sb, target[0], target[1]);
    const { data, error } = await sb
      .from("notes")
      .insert({
        content,
        activity_type,
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
