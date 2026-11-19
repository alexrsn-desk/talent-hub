import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";

interface Props { priceId: string; quantity?: number; returnUrl: string }

export function StripeEmbeddedCheckout({ priceId, quantity, returnUrl }: Props) {
  const fetchClientSecret = async (): Promise<string> => {
    const { data, error } = await supabase.functions.invoke("create-checkout", {
      body: { priceId, quantity, returnUrl, environment: getStripeEnvironment() },
    });
    if (error || !data?.clientSecret) throw new Error(data?.error || error?.message || "Failed to start checkout");
    return data.clientSecret;
  };
  return (
    <div id="checkout">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
