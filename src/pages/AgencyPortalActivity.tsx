import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailCheck } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

import { PortalAppShell } from "@/components/portal/PortalAppShell";
import { supabase } from "@/integrations/supabase/client";
import { approvePendingEmail } from "@/lib/agency.functions";

export default function AgencyPortalActivity() {
  const qc = useQueryClient();

  useEffect(() => {
    document.title = "Activity — Agency Portal";
  }, []);

  const pending = useQuery({
    queryKey: ["portal-pending-emails"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portal_candidate_emails")
        .select("id, subject, body, to_email, created_at, portal_candidates(name)")
        .eq("status", "awaiting_approval")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const notifications = useQuery({
    queryKey: ["portal-notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portal_notifications")
        .select("id, kind, title, body, created_at")
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return data;
    },
  });

  const act = useMutation({
    mutationFn: (input: { emailId: string; discard?: boolean }) =>
      approvePendingEmail({ data: input }),
    onSuccess: (_r, input) => {
      toast.success(input.discard ? "Draft discarded" : "Email sent");
      qc.invalidateQueries({ queryKey: ["portal-pending-emails"] });
      qc.invalidateQueries({ queryKey: ["portal-notifications"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PortalAppShell>
      <h1 className="text-3xl font-semibold">Activity</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Everything waiting on you, plus what's happened across your portals.
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Emails awaiting approval</h2>
        <div className="mt-4 space-y-3">
          {pending.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing waiting for approval.</p>
          )}
          {pending.data?.map((row) => {
            const rel = row.portal_candidates as { name?: string } | { name?: string }[] | null;
            const name = (Array.isArray(rel) ? rel[0] : rel)?.name ?? "Candidate";
            return (
              <article key={row.id} className="panel p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{name}</p>
                    <p className="text-sm text-muted-foreground">{row.subject}</p>
                    {row.to_email && (
                      <p className="text-xs text-muted-foreground">to {row.to_email}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={act.isPending}
                      onClick={() => act.mutate({ emailId: row.id })}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                    >
                      <MailCheck className="size-4" /> Approve &amp; send
                    </button>
                    <button
                      disabled={act.isPending}
                      onClick={() => act.mutate({ emailId: row.id, discard: true })}
                      className="rounded-lg border border-input px-3 py-2 text-sm hover:bg-secondary disabled:opacity-60"
                    >
                      Discard
                    </button>
                  </div>
                </div>
                <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-surface p-4 text-sm">
                  {row.body}
                </pre>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Recent activity</h2>
        <div className="mt-4 space-y-2">
          {notifications.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          )}
          {notifications.data?.map((n) => (
            <div key={n.id} className="panel p-4">
              <p className="text-sm font-medium">{n.title}</p>
              {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(n.created_at).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </section>
    </PortalAppShell>
  );
}
