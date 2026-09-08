import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { Rocket, Eye, Mail, MessageSquare, Users, CheckCircle2, Circle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LaunchStatusSection } from "@/components/LaunchStatusSection";
import { supabase } from "@/integrations/supabase/client";
import type { Job } from "@/hooks/use-data";

type LaunchRow = {
  id: string;
  launched_at: string;
  post_text: string | null;
  campaign_subject: string | null;
  campaign_body: string | null;
  known_count: number;
  li_count: number;
  client_email_sent: boolean;
};

export function JobLaunchTab({ job }: { job: Job }) {
  const launchedAt = (job as any).search_launched_at as string | null;
  const [viewing, setViewing] = useState<{ title: string; body: string } | null>(null);

  const launches = useQuery({
    queryKey: ["job-launches", job.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_launches")
        .select("id, launched_at, post_text, campaign_subject, campaign_body, known_count, li_count, client_email_sent")
        .eq("job_id", job.id)
        .order("launched_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LaunchRow[];
    },
  });

  const latest = launches.data?.[0];

  if (!launchedAt && !latest) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-border p-8 text-center space-y-3">
          <Rocket className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">This search hasn't been launched yet.</p>
          <Button asChild>
            <Link to={`/jobs/${job.id}/launch`}><Rocket className="mr-2 h-4 w-4" /> Launch search</Link>
          </Button>
        </div>
        <LaunchStatusSection jobId={job.id} />
      </div>
    );
  }

  const when = latest?.launched_at ?? launchedAt!;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-4 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-medium">
              Search launched: {format(new Date(when), "d MMM yyyy")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(when), { addSuffix: true })}
              {launches.data && launches.data.length > 1 && ` · ${launches.data.length} launches`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to={`/jobs/${job.id}/launch`}>Launch additional outreach</Link>
            </Button>
            <Button asChild size="sm">
              <Link to={`/jobs/${job.id}/launch`}><Rocket className="mr-2 h-4 w-4" /> Re-run launch</Link>
            </Button>
          </div>
        </div>

        <ul className="divide-y divide-border text-sm">
          <li className="flex items-center gap-3 py-2.5">
            <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="flex-1">LinkedIn post</span>
            {latest?.post_text ? (
              <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs"
                onClick={() => setViewing({ title: "LinkedIn post", body: latest.post_text! })}>
                <Eye className="h-3.5 w-3.5" /> View
              </Button>
            ) : <NotSent />}
          </li>
          <li className="flex items-center gap-3 py-2.5">
            <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="flex-1">Campaign message</span>
            {latest?.campaign_body ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px] h-5">Prepared</Badge>
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs"
                  onClick={() => setViewing({ title: latest.campaign_subject || "Campaign message", body: latest.campaign_body! })}>
                  <Eye className="h-3.5 w-3.5" /> View
                </Button>
              </div>
            ) : <NotSent />}
          </li>
          <li className="flex items-center gap-3 py-2.5">
            <Users className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="flex-1">Personal messages to known candidates</span>
            <span className="tabular-nums font-medium">{latest?.known_count ?? 0}</span>
          </li>
          <li className="flex items-center gap-3 py-2.5">
            <Users className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="flex-1">LI connection DMs</span>
            <span className="tabular-nums font-medium">{latest?.li_count ?? 0}</span>
          </li>
          <li className="flex items-center gap-3 py-2.5">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="flex-1">Client confirmation</span>
            {latest?.client_email_sent
              ? <Badge variant="secondary" className="text-[10px] h-5">Sent</Badge>
              : <Badge variant="outline" className="text-[10px] h-5 text-muted-foreground">Draft</Badge>}
          </li>
        </ul>
      </div>

      <LaunchStatusSection jobId={job.id} />

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{viewing?.title}</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm">{viewing?.body}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NotSent() {
  return (
    <Badge variant="outline" className="gap-1 text-[10px] h-5 text-muted-foreground">
      <Circle className="h-2.5 w-2.5" /> Not sent
    </Badge>
  );
}
