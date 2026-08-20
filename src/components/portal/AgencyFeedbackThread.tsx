import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { FeedbackThread } from "@/components/portal/FeedbackThread";
import { addAgencyReply, editFeedback, loadCandidateFeedback } from "@/lib/agency.functions";

/**
 * Agency-side view of a candidate's client feedback thread.
 * Staff can reply and edit both their own replies and client comments.
 */
export function AgencyFeedbackThread({
  candidateId,
  currentStage,
  stages,
}: {
  candidateId: string;
  currentStage: string;
  stages: string[];
}) {
  const qc = useQueryClient();
  const key = ["portal-feedback", candidateId];

  const thread = useQuery({
    queryKey: key,
    queryFn: () => loadCandidateFeedback({ data: { candidateId } }),
  });

  const post = useMutation({
    mutationFn: (v: { comment: string; stage: string; replyTo: string | null }) =>
      addAgencyReply({
        data: { candidateId, comment: v.comment, stage: v.stage, replyTo: v.replyTo },
      }),
    onSuccess: () => {
      toast.success("Reply posted");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const edit = useMutation({
    mutationFn: (v: { id: string; comment: string; rating: number | null }) =>
      editFeedback({ data: { feedbackId: v.id, comment: v.comment, rating: v.rating } }),
    onSuccess: () => {
      toast.success("Comment updated");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (thread.isLoading) {
    return <p className="text-xs text-muted-foreground">Loading feedback…</p>;
  }

  return (
    <FeedbackThread
      feedback={thread.data?.feedback ?? []}
      stages={stages}
      currentStage={currentStage}
      viewer="agency"
      onPost={(v) => post.mutate({ comment: v.comment, stage: v.stage, replyTo: v.replyTo })}
      onEdit={(v) => edit.mutate(v)}
      posting={post.isPending}
    />
  );
}
