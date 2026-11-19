import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "@/hooks/use-agency";
import { getStripeEnvironment } from "@/lib/stripe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Building2, CreditCard, Sparkles, Loader2 } from "lucide-react";
import { StripeEmbeddedCheckout } from "./StripeEmbeddedCheckout";
import { PaymentTestModeBanner } from "./PaymentTestModeBanner";

export const SEAT_PRICE_GBP = 35;
export const TOPUP_PRICE_GBP = 10;
export const TOPUP_CREDITS = 250;

export function AgencyBillingSection() {
  const { data, isLoading } = useAgency();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [seats, setSeats] = useState(1);
  const [checkout, setCheckout] = useState<{ priceId: string; quantity: number } | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    if (data?.agency) { setName(data.agency.name); setSeats(Math.max(1, data.memberCount)); }
  }, [data?.agency?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("checkout") === "success") {
      toast.success("Payment received — your plan updates in a few seconds.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading agency…</div>;
  if (!data?.agency) return null;
  const { agency, role, subscription } = data;
  const isAdmin = role === "owner" || role === "admin";
  const allowance = agency.monthly_ai_credits * agency.seats;
  const total = allowance + agency.bonus_ai_credits;
  const used = agency.used_ai_credits;
  const pct = total ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const active = subscription && ["active", "trialing", "past_due"].includes(subscription.status);

  const saveName = async () => {
    if (!name.trim() || name === agency.name) return;
    const { error } = await supabase.from("agencies").update({ name: name.trim() }).eq("id", agency.id);
    if (error) toast.error("Couldn't rename agency"); else { toast.success("Agency renamed"); qc.invalidateQueries({ queryKey: ["agency"] }); }
  };

  const openPortal = async () => {
    setPortalLoading(true);
    const { data: r, error } = await supabase.functions.invoke("create-portal-session", {
      body: { environment: getStripeEnvironment(), returnUrl: window.location.href },
    });
    setPortalLoading(false);
    if (error || !r?.url) return toast.error(r?.error || "Couldn't open billing");
    window.open(r.url, "_blank");
  };

  const returnUrl = `${window.location.origin}/settings?checkout=success&session_id={CHECKOUT_SESSION_ID}`;

  return (
    <div className="space-y-4">
      <PaymentTestModeBanner />
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /><h3 className="font-semibold">Agency & Billing</h3>
          <Badge variant="outline" className="ml-auto capitalize">{role}</Badge></div>
        <div className="grid gap-2 max-w-md">
          <Label>Agency name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} disabled={!isAdmin} />
          <p className="text-xs text-muted-foreground">{data.memberCount} member{data.memberCount === 1 ? "" : "s"} · your agency's records are only visible to its members.</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" /><h3 className="font-semibold">Plan</h3></div>
        {active ? (
          <div className="space-y-2">
            <p className="text-sm">Desky — <b>{subscription.quantity} seat{subscription.quantity === 1 ? "" : "s"}</b> at £{SEAT_PRICE_GBP}/seat/month
              {subscription.status === "past_due" && <Badge variant="destructive" className="ml-2">Payment failed — update card</Badge>}</p>
            {subscription.current_period_end && <p className="text-xs text-muted-foreground">
              {subscription.cancel_at_period_end ? "Ends" : "Renews"} {new Date(subscription.current_period_end).toLocaleDateString()}</p>}
            {isAdmin && <Button variant="outline" size="sm" onClick={openPortal} disabled={portalLoading}>
              {portalLoading && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Manage billing, seats & invoices</Button>}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">£{SEAT_PRICE_GBP} per recruiter seat per month. Includes {agency.monthly_ai_credits} AI credits per seat, every month.</p>
            {isAdmin ? (
              <div className="flex items-end gap-2">
                <div className="grid gap-1"><Label className="text-xs">Seats</Label>
                  <Input type="number" min={1} max={100} value={seats} className="w-24" onChange={(e) => setSeats(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} /></div>
                <Button onClick={() => setCheckout({ priceId: "desky_seat_monthly", quantity: seats })}>Subscribe — £{SEAT_PRICE_GBP * seats}/month</Button>
              </div>
            ) : <p className="text-xs text-muted-foreground">Ask your agency owner to subscribe.</p>}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><h3 className="font-semibold">AI credits</h3></div>
        <Progress value={pct} />
        <p className="text-sm"><b>{used}</b> / {total} AI actions used this month
          {agency.bonus_ai_credits > 0 && <span className="text-muted-foreground"> (includes {agency.bonus_ai_credits} top-up credits)</span>}</p>
        <p className="text-xs text-muted-foreground">Resets {new Date(agency.credits_reset_at).toLocaleDateString()}. When credits run out, AI pauses — everything else keeps working.</p>
        {pct >= 80 && <p className="text-xs text-primary">You've used {pct}% of your AI credits.</p>}
        {isAdmin && <Button variant="outline" size="sm" onClick={() => setCheckout({ priceId: "ai_credits_250", quantity: 1 })}>
          Buy {TOPUP_CREDITS} credits — £{TOPUP_PRICE_GBP}</Button>}
      </div>

      <Dialog open={!!checkout} onOpenChange={(o) => !o && setCheckout(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Checkout</DialogTitle></DialogHeader>
          {checkout && <StripeEmbeddedCheckout priceId={checkout.priceId} quantity={checkout.quantity} returnUrl={returnUrl} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
