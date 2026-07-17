import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import { useDeskyAssistant } from "@/components/DeskyAssistant";

export default function AskDesky() {
  const { setOpen } = useDeskyAssistant();
  useEffect(() => { setOpen(true); }, [setOpen]);
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <Sparkles className="h-10 w-10 text-primary" />
      <h1 className="text-xl font-semibold">Desky is your recruiting PA</h1>
      <p className="text-sm text-muted-foreground max-w-md">
        Press <kbd className="border border-border rounded px-1.5 py-0.5 text-xs">⌘K</kbd> anywhere in Desky to
        ask, move candidates, add notes, set reminders, or draft outreach — plain English.
      </p>
      <button
        onClick={() => setOpen(true)}
        className="text-sm bg-primary text-primary-foreground rounded-lg px-4 py-2"
      >
        Open Desky
      </button>
    </div>
  );
}
