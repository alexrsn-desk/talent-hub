import { Reply, Star } from "lucide-react";
import { useState } from "react";

import type { PortalFeedback } from "@/lib/portal.functions";

/** Relative timestamp, e.g. "3 hours ago". */
export function relativeTime(iso: string) {
  const then = new Date(iso).getTime();
  const secs = Math.max(1, Math.round((Date.now() - then) / 1000));
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.348, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];
  let value = secs;
  for (const [size, unit] of steps) {
    if (value < size) {
      return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
        -Math.round(value),
        unit,
      );
    }
    value = value / size;
  }
  return new Date(iso).toLocaleDateString();
}

const isAgency = (f: PortalFeedback) => (f.author_role ?? "client") === "agency";

function Stars({
  value,
  onChange,
}: {
  value: number | null;
  onChange?: (v: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n === value ? null : n)}
          className="p-0.5 disabled:cursor-default"
          aria-label={`Rate ${n}`}
        >
          <Star
            className={`size-3.5 ${value && n <= value ? "fill-accent text-accent" : "text-muted-foreground"}`}
          />
        </button>
      ))}
    </div>
  );
}

/** Shared inline editor for a single comment. */
function InlineEditor({
  initialComment,
  initialRating,
  showRating,
  onCancel,
  onSave,
}: {
  initialComment: string;
  initialRating: number | null;
  showRating: boolean;
  onCancel: () => void;
  onSave: (comment: string, rating: number | null) => void;
}) {
  const [comment, setComment] = useState(initialComment);
  const [rating, setRating] = useState<number | null>(initialRating);
  return (
    <div className="space-y-2">
      <textarea
        rows={3}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="flex items-center gap-2">
        {showRating && <Stars value={rating} onChange={setRating} />}
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted/50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => comment.trim() && onSave(comment.trim(), rating)}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
        >
          Save
        </button>
      </div>
    </div>
  );
}

export type FeedbackThreadProps = {
  feedback: PortalFeedback[];
  stages: string[];
  currentStage: string;
  /** Who is looking: drives the "Recruiter" badge on your own posts and edit rights. */
  viewer: "client" | "agency";
  viewerEmail?: string | null;
  onPost: (input: {
    comment: string;
    rating: number | null;
    stage: string;
    replyTo: string | null;
  }) => void;
  onEdit: (input: { id: string; comment: string; rating: number | null }) => void;
  posting?: boolean;
};

export function FeedbackThread({
  feedback,
  stages,
  currentStage,
  viewer,
  viewerEmail,
  onPost,
  onEdit,
  posting,
}: FeedbackThreadProps) {
  const [comment, setComment] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [stage, setStage] = useState(currentStage);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const roots = feedback.filter((f) => !f.reply_to);
  const repliesOf = (id: string) => feedback.filter((f) => f.reply_to === id);

  const canEdit = (f: PortalFeedback) => {
    if (viewer === "agency") return true;
    if (isAgency(f)) return false;
    const me = (viewerEmail ?? "").trim().toLowerCase();
    return !!me && me === (f.client_email ?? "").trim().toLowerCase();
  };

  const Comment = ({ f, nested }: { f: PortalFeedback; nested?: boolean }) => (
    <div className={nested ? "ml-5 border-l border-border pl-3" : ""}>
      <div className="rounded-lg bg-surface p-3 text-sm">
        {editing === f.id ? (
          <InlineEditor
            initialComment={f.comment}
            initialRating={f.rating}
            showRating={!isAgency(f)}
            onCancel={() => setEditing(null)}
            onSave={(c, r) => {
              onEdit({ id: f.id, comment: c, rating: r });
              setEditing(null);
            }}
          />
        ) : (
          <>
            <div className="flex items-center gap-2">
              {isAgency(f) ? (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                  Recruiter
                </span>
              ) : (
                <span className="text-xs font-medium text-foreground/80">
                  {f.client_email ?? "Client"}
                </span>
              )}
              {f.rating ? <Stars value={f.rating} /> : null}
            </div>
            <p className="mt-2 whitespace-pre-wrap">{f.comment}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {relativeTime(f.created_at)}
              {f.updated_at ? " · edited" : ""}
              {f.stage_at_time ? ` · ${f.stage_at_time}` : ""}
            </p>
            <div className="mt-2 flex items-center gap-3 text-xs">
              {!nested && (
                <button
                  type="button"
                  onClick={() => setReplyTo(replyTo === f.id ? null : f.id)}
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                >
                  <Reply className="size-3.5" /> Reply
                </button>
              )}
              {canEdit(f) && (
                <button
                  type="button"
                  onClick={() => setEditing(f.id)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Edit
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {repliesOf(f.id).map((r) => (
        <div key={r.id} className="mt-2">
          <Comment f={r} nested />
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-3">
      {roots.length === 0 && (
        <p className="text-xs text-muted-foreground">No feedback yet.</p>
      )}
      {roots.map((f) => (
        <Comment key={f.id} f={f} />
      ))}

      <div className="rounded-lg border border-border bg-card p-2">
        {replyTo && (
          <div className="mb-2 flex items-center justify-between rounded-md bg-secondary/60 px-2 py-1 text-xs">
            <span className="text-muted-foreground">Replying in thread</span>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        )}
        <textarea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={
            viewer === "agency" ? "Reply to the client…" : "Add your thoughts…"
          }
          className="w-full resize-none rounded-md bg-transparent px-2 py-1.5 text-sm outline-none"
        />
        {/* Composer footer: stage selector lives here, not as its own field. */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="rounded-md border border-input bg-card px-2 py-1 text-xs"
            aria-label="Stage this relates to"
          >
            {stages.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {viewer === "client" && <Stars value={rating} onChange={setRating} />}
          <button
            type="button"
            disabled={!comment.trim() || posting}
            onClick={() => {
              onPost({ comment: comment.trim(), rating, stage, replyTo });
              setComment("");
              setRating(null);
              setReplyTo(null);
            }}
            className="ml-auto rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {replyTo ? "Reply" : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}
