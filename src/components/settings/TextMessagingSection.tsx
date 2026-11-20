import { useQuery } from "@tanstack/react-query";
import { Smartphone, CheckCircle2, Circle, Copy, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const WEBHOOK_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/twilio-webhook`;

export function TextMessagingSection() {
  const status = useQuery({
    queryKey: ["sms-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("send-sms", { body: { action: "status" } });
      if (error) throw error;
      return data as { twilio_connected: boolean; sender_number: string | null };
    },
  });
  const connected = !!status.data?.twilio_connected;
  const number = status.data?.sender_number;
  const ready = connected && !!number;
  const copy = async () => { await navigator.clipboard.writeText(WEBHOOK_URL); toast.success("Link copied"); };

  const steps = [
    { done: connected, title: "Create a Twilio account and buy a mobile number", body: <>Sign up at <a className="text-primary underline" href="https://www.twilio.com/try-twilio" target="_blank" rel="noopener noreferrer">twilio.com <ExternalLink className="inline h-3 w-3" /></a>, then buy a UK mobile number that can send texts.</> },
    { done: connected, title: "Connect Twilio to Desky", body: <>Ask Desky in chat: <em>“connect my Twilio account”</em>. You'll be asked for your Twilio details once.</> },
    { done: !!number, title: "Tell Desky your Twilio number", body: number ? <>Sending from <span className="font-mono">{number}</span></> : <>Share the number in chat so Desky knows which number to text from.</> },
    { done: false, optional: true, title: "Receive replies in Conversations", body: <div className="space-y-1.5"><p>In Twilio → Phone Numbers → your number → Messaging, set <em>“A message comes in”</em> to this link:</p><div className="flex items-center gap-2"><code className="text-[11px] bg-muted rounded px-2 py-1 truncate flex-1">{WEBHOOK_URL}</code><Button size="sm" variant="outline" className="h-7" onClick={copy}><Copy className="h-3 w-3 mr-1" />Copy</Button></div></div> },
    { done: false, optional: true, title: "Protect your account from fraud", body: <>In Twilio, turn on <em>SMS Pumping Protection</em> and only allow the countries you text (e.g. UK).</> },
  ];

  return (
    <div className="space-y-3 mt-6">
      <div>
        <h2 className="text-lg font-semibold">Text messaging (SMS)</h2>
        <p className="text-sm text-muted-foreground">Send and receive texts with candidates and clients straight from Conversations.</p>
      </div>
      <div className="rounded-lg border border-border bg-card/60 p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Smartphone className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Twilio</p>
            {status.isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> :
              ready ? <p className="text-xs text-primary flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Ready to send texts</p> :
              <p className="text-xs text-muted-foreground">Not set up yet — follow the steps below whenever you're ready.</p>}
          </div>
        </div>
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              {s.done ? <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" /> : <Circle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
              <div className="min-w-0 flex-1 text-xs text-muted-foreground">
                <p className="text-sm text-foreground font-medium">{i + 1}. {s.title}{s.optional && <span className="text-muted-foreground font-normal"> · recommended</span>}</p>
                <div className="mt-0.5">{s.body}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
