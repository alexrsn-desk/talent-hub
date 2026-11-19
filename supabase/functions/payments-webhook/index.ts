import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, verifyWebhook } from "../_shared/stripe.ts";

const CREDITS_PER_TOPUP = 250;
let _sb: ReturnType<typeof createClient> | null = null;
const sb = () => (_sb ??= createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!));
const iso = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : null);

// deno-lint-ignore no-explicit-any
async function syncAgency(agencyId: string | undefined, env: StripeEnv, status: string, seats: number, periodEnd: number | null) {
  if (!agencyId) return;
  const active = ["active", "trialing", "past_due"].includes(status) || (status === "canceled" && periodEnd && periodEnd * 1000 > Date.now());
  await sb().from("agencies").update({
    subscription_status: status,
    plan: active ? "desky_seat" : "free",
    seats: active ? Math.max(1, seats) : 1,
  }).eq("id", agencyId);
}

// deno-lint-ignore no-explicit-any
async function upsertSubscription(subscription: any, env: StripeEnv) {
  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id || item?.price?.id;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;
  const userId = subscription.metadata?.userId;
  const agencyId = subscription.metadata?.agencyId;
  const row = {
    stripe_subscription_id: subscription.id,
    stripe_customer_id: subscription.customer,
    product_id: item?.price?.product,
    price_id: priceId,
    quantity: item?.quantity ?? 1,
    status: subscription.status,
    current_period_start: iso(periodStart),
    current_period_end: iso(periodEnd),
    cancel_at_period_end: subscription.cancel_at_period_end || false,
    environment: env,
    updated_at: new Date().toISOString(),
    ...(userId && { user_id: userId }),
    ...(agencyId && { agency_id: agencyId }),
  };
  if (userId) await sb().from("subscriptions").upsert(row, { onConflict: "stripe_subscription_id" });
  else await sb().from("subscriptions").update(row).eq("stripe_subscription_id", subscription.id).eq("environment", env);
  await syncAgency(agencyId, env, subscription.status, item?.quantity ?? 1, periodEnd);
}

// deno-lint-ignore no-explicit-any
async function fulfillTopup(session: any, env: StripeEnv) {
  if (session.mode !== "payment" || session.metadata?.priceId !== "ai_credits_250") return;
  const agencyId = session.metadata?.agencyId;
  if (!agencyId) return;
  const qty = Math.max(1, Number(session.metadata?.quantity) || 1);
  const credits = CREDITS_PER_TOPUP * qty;
  const { error } = await sb().from("ai_topup_purchases").insert({ agency_id: agencyId, stripe_session_id: session.id, credits, environment: env });
  if (error) { console.log("top-up already recorded or failed", error.message); return; }
  const { data: a } = await sb().from("agencies").select("bonus_ai_credits").eq("id", agencyId).single();
  await sb().from("agencies").update({ bonus_ai_credits: (a?.bonus_ai_credits ?? 0) + credits }).eq("id", agencyId);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const rawEnv = new URL(req.url).searchParams.get("env");
  if (rawEnv !== "sandbox" && rawEnv !== "live") {
    return new Response(JSON.stringify({ received: true, ignored: "invalid env" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  const env: StripeEnv = rawEnv;
  try {
    const event = await verifyWebhook(req, env);
    const obj = event.data.object;
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await upsertSubscription(obj, env); break;
      case "customer.subscription.deleted":
        await upsertSubscription({ ...obj, status: "canceled" }, env); break;
      case "checkout.session.completed":
        if (obj.payment_status !== "unpaid") await fulfillTopup(obj, env); break;
      case "checkout.session.async_payment_succeeded":
        await fulfillTopup(obj, env); break;
      default:
        console.log("Unhandled event:", event.type);
    }
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response("Webhook error", { status: 400 });
  }
});
