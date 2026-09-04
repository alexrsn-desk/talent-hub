// Centrally managed email templates. Automations should fetch an approved
// template rather than writing communications from scratch.
// Falls back to the recruiter's own style templates on recruiter_profiles.
import { type ActionDef, ActionError, paging, uuid, z } from "./core.ts";

const PROFILE_TEMPLATE_KEYS: Record<string, string> = {
  linkedin_post: "linkedin_post_template",
  personal_candidate: "personal_candidate_template",
  li_connection: "li_connection_template",
  campaign_outreach: "campaign_outreach_template",
  client_confirmation: "client_confirmation_template",
};

export const templateActions: ActionDef[] = [
  {
    name: "get_email_template",
    kind: "read",
    description:
      "Fetch an approved email/message template by key (or id), falling back to the recruiter's saved style templates.",
    schema: z.object({
      key: z.string().max(80).optional(),
      template_id: uuid.optional(),
      category: z.string().max(60).optional(),
    }),
    handler: async (i, ctx) => {
      if (i.template_id) {
        const { data } = await ctx.db.from("email_templates").select("*").eq("id", i.template_id).maybeSingle();
        if (!data) throw new ActionError("not_found", "Template not found", 404);
        return data;
      }
      if (i.key) {
        const { data } = await ctx.db.from("email_templates").select("*")
          .eq("key", i.key).eq("archived", false).maybeSingle();
        if (data) return data;
        const profileField = PROFILE_TEMPLATE_KEYS[i.key];
        if (profileField) {
          const { data: profile } = await ctx.db.from("recruiter_profiles")
            .select(profileField).eq("user_id", ctx.userId).maybeSingle();
          // deno-lint-ignore no-explicit-any
          const body = (profile as any)?.[profileField];
          if (body) return { key: i.key, name: i.key, category: "style", subject: "", body, source: "recruiter_profile" };
        }
        throw new ActionError("not_found", `No template found for key "${i.key}"`, 404);
      }
      throw new ActionError("invalid_input", "Provide key or template_id");
    },
  },
  {
    name: "list_email_templates",
    kind: "read",
    description: "List the caller's approved templates, optionally filtered by category.",
    schema: z.object({ category: z.string().max(60).optional(), ...paging }),
    handler: async (i, ctx) => {
      let q = ctx.db.from("email_templates").select("*").eq("archived", false)
        .order("name", { ascending: true }).limit(i.limit ?? 100);
      if (i.category) q = q.eq("category", i.category);
      const { data } = await q;
      return { rows: data ?? [] };
    },
  },
];
