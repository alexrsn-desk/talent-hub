import { createClient } from "npm:@supabase/supabase-js@2";

export const OUT_OF_CREDITS =
  "Your agency has used all its AI credits for this month. Add a top-up pack in Settings → Agency & Billing, or wait for the monthly reset.";

// Deducts AI credits from the caller's agency. Returns false when the agency is out of credits.
export async function chargeAiCredit(userId: string, amount = 1): Promise<boolean> {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await admin.rpc("consume_ai_credit", { _user: userId, _amount: amount });
  if (error) { console.error("consume_ai_credit failed", error); return true; } // fail open: never block on metering errors
  return data !== false;
}
