import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@22.0.2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const ALLOWED_PRICES = new Set(["desky_seat_monthly", "ai_credits_250"]);
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function resolveOrCreateCustomer(stripe: Stripe, options: { email?: string; userId?: string; agencyId?: string }): Promise<string> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) throw new Error("Invalid userId");
  if (options.userId) {
    const found = await stripe.customers.search({ query: `metadata['userId']:'${options.userId}'`, limit: 1 });
    if (found.data.length) return found.data[0].id;
  }
  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    if (existing.data.length) {
      const customer = existing.data[0];
      if (options.userId && customer.metadata?.userId !== options.userId) {
        await stripe.customers.update(customer.id, { metadata: { ...customer.metadata, userId: options.userId } });
      }
      return customer.id;
    }
  }
  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    metadata: { ...(options.userId && { userId: options.userId }), ...(options.agencyId && { agencyId: options.agencyId }) },
  });
  return created.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "Please sign in first." }, 401);

    const body = await req.json().catch(() => ({}));
    const priceId = String(body.priceId ?? "");
    const environment = body.environment as StripeEnv;
    const quantity = Math.max(1, Math.min(100, Math.floor(Number(body.quantity) || 1)));
    const returnUrl = String(body.returnUrl ?? "");
    if (!ALLOWED_PRICES.has(priceId)) return json({ error: "Unknown plan" }, 400);
    if (environment !== "sandbox" && environment !== "live") return json({ error: "Invalid environment" }, 400);
    if (!/^https?:\/\//.test(returnUrl)) return json({ error: "Invalid return URL" }, 400);

    const { data: member } = await admin.from("agency_members").select("agency_id, role").eq("user_id", user.id).maybeSingle();
    if (!member) return json({ error: "No agency found for your account." }, 400);
    if (!["owner", "admin"].includes(member.role)) return json({ error: "Only agency owners or admins can manage billing." }, 403);

    const stripe = createStripeClient(environment);
    const prices = await stripe.prices.list({ lookup_keys: [priceId] });
    if (!prices.data.length) return json({ error: "Price not found" }, 400);
    const stripePrice = prices.data[0];
    const isRecurring = stripePrice.type === "recurring";

    if (isRecurring) {
      const { data: existing } = await admin.from("subscriptions").select("status, current_period_end")
        .eq("agency_id", member.agency_id).eq("environment", environment).in("status", ["active", "trialing", "past_due"]).limit(1);
      if (existing?.length) return json({ error: "Your agency already has an active subscription — change seats from Manage billing." }, 409);
    }

    const customerId = await resolveOrCreateCustomer(stripe, { email: user.email ?? undefined, userId: user.id, agencyId: member.agency_id });
    let description: string | undefined;
    if (!isRecurring) {
      const productId = typeof stripePrice.product === "string" ? stripePrice.product : stripePrice.product.id;
      description = (await stripe.products.retrieve(productId)).name;
    }
    const meta = { userId: user.id, agencyId: member.agency_id, priceId, quantity: String(quantity), managed_payments: "true" };
    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: stripePrice.id, quantity }],
      mode: isRecurring ? "subscription" : "payment",
      ui_mode: "embedded_page",
      return_url: returnUrl,
      customer: customerId,
      managed_payments: { enabled: true },
      metadata: meta,
      ...(isRecurring ? { subscription_data: { metadata: meta } } : { payment_intent_data: { description } }),
    } as Stripe.Checkout.SessionCreateParams);
    return json({ clientSecret: session.client_secret });
  } catch (e) {
    console.error("create-checkout error", e);
    return json({ error: e instanceof Error ? e.message : "Checkout failed" }, 500);
  }
});
