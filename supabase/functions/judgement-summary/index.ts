import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, json, regenerateSummary } from "../_shared/judgement.ts";

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
    const candidateId: string | undefined = body?.candidate_id;
    if (!candidateId) return json({ error: "candidate_id is required" }, 400);

    const judgement = await regenerateSummary(supabase, apiKey, candidateId, user.id);
    return json({ judgement });
  } catch (e: any) {
    console.error("judgement-summary error", e);
    return json({ error: e?.message || "Unknown error" }, e?.status || 500);
  }
});
