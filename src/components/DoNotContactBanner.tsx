import { Ban } from "lucide-react";

type Props = {
  reason?: string | null;
  reasonOther?: string | null;
  setAt?: string | null;
  setByName?: string | null;
};

export function DoNotContactBanner({ reason, reasonOther, setAt, setByName }: Props) {
  const reasonLabel = reason === "Other" && reasonOther ? `Other — ${reasonOther}` : reason ?? "Not specified";
  const dateLabel = setAt ? new Date(setAt).toLocaleDateString() : "—";
  return (
    <div
      role="alert"
      aria-live="polite"
      className="sticky top-0 z-30 w-full border-b-2 border-destructive bg-destructive text-destructive-foreground"
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <Ban className="h-5 w-5 mt-0.5 shrink-0" aria-hidden />
        <div className="min-w-0 text-sm leading-relaxed">
          <div className="font-bold tracking-wide">DO NOT CONTACT</div>
          <div className="opacity-95">
            <span className="font-medium">Reason:</span> {reasonLabel}
            <span className="mx-2 opacity-60">•</span>
            <span className="font-medium">Date set:</span> {dateLabel}
            {setByName && (
              <>
                <span className="mx-2 opacity-60">•</span>
                <span className="font-medium">Set by:</span> {setByName}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
