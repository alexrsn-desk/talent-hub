import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, json, callTool, regenerateSummary } from "../_shared/judgement.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Not authenticated" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "Not authenticated" }, 401);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const transcriptId: string | undefined = body?.transcript_id;
    if (!transcriptId) return json({ error: "transcript_id is required" }, 400);

    const { data: t } = await supabase
      .from("call_transcripts").select("*").eq("id", transcriptId).maybeSingle();
    if (!t) return json({ error: "Transcript not found" }, 404);
    if (!t.candidate_id) return json({ error: "Transcript has no candidate" }, 400);

    const system = `You extract impact claims from a recruitment call transcript or written call summary.
For each project, piece of work or achievement the candidate describes, return:
- what_they_did: the specific thing described, in their terms (one short sentence)
- claimed_impact: any stated outcome — numbers, before/after, what changed. null if none stated.
- specificity:
  high = named system/product AND a quantified outcome AND a clear causal claim
  medium = named system/product but no quantification
  low = vague self-description with no concrete detail
Extract only what is actually said. Never invent numbers, systems or outcomes.
If nothing concrete is described, return an empty list.`;

    const out = await callTool(
      apiKey,
      system,
      `Call date: ${t.call_date}. Source: ${t.source}.\n\nCONTENT:\n${(t.content || "").slice(0, 20000)}`,
      {
        name: "return_impact_claims",
        description: "Return extracted impact claims",
        parameters: {
          type: "object",
          properties: {
            claims: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  what_they_did: { type: "string" },
                  claimed_impact: { type: "string" },
                  specificity: { type: "string", enum: ["high", "medium", "low"] },
                },
                required: ["what_they_did", "specificity"],
              },
            },
          },
          required: ["claims"],
        },
      },
    );

    const claims = (out.claims || []).filter((c: any) => c?.what_they_did?.trim());
    if (claims.length) {
      await supabase.from("candidate_impact_claims").insert(
        claims.map((c: any) => ({
          user_id: user.id,
          candidate_id: t.candidate_id,
          transcript_id: t.id,
          what_they_did: c.what_they_did,
          claimed_impact: c.claimed_impact || null,
          specificity: ["high", "medium", "low"].includes(c.specificity) ? c.specificity : "low",
        })),
      );
    }

    await supabase.from("call_transcripts").update({ extraction_status: "done" }).eq("id", t.id);

    const judgement = await regenerateSummary(supabase, apiKey, t.candidate_id, user.id);

    return json({ claims_extracted: claims.length, judgement });
  } catch (e: any) {
    console.error("judgement-extract error", e);
    return json({ error: e?.message || "Unknown error" }, e?.status || 500);
  }
});
