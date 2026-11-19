import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "Unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const environment = body.environment as StripeEnv;
    if (environment !== "sandbox" && environment !== "live") return json({ error: "Invalid environment" }, 400);
    const { data: member } = await admin.from("agency_members").select("agency_id, role").eq("user_id", user.id).maybeSingle();
    if (!member || !["owner", "admin"].includes(member.role)) return json({ error: "Only agency owners or admins can manage billing." }, 403);
    const { data: sub } = await admin.from("subscriptions").select("stripe_customer_id")
      .eq("agency_id", member.agency_id).eq("environment", environment)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!sub?.stripe_customer_id) return json({ error: "No subscription found" }, 404);
    const stripe = createStripeClient(environment);
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      ...(typeof body.returnUrl === "string" && /^https?:\/\//.test(body.returnUrl) && { return_url: body.returnUrl }),
    });
    return json({ url: portal.url });
  } catch (e) {
    console.error("create-portal-session error", e);
    return json({ error: e instanceof Error ? e.message : "Failed" }, 500);
  }
});
