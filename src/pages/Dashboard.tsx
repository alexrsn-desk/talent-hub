import { useState } from "react";
import { DeskBrief } from "@/components/DeskBrief";
import { ThisWeekRow } from "@/components/ThisWeekRow";
import { LiveJobsStatus } from "@/components/LiveJobsStatus";
import { TeamView } from "@/components/TeamView";
import { useIsManager } from "@/hooks/use-team";

/**
 * My Desk — a pure status page. Readable in about fifteen seconds:
 * brief, this week's numbers, live jobs. Nothing here is clickable
 * except opening a job; every action lives on the Actions page.
 */
export default function DashboardPage() {
  const isManager = useIsManager();
  const [view, setView] = useState<"my" | "team">("my");

  return (
    <div className="space-y-5">
      {isManager && (
        <div className="inline-flex rounded-lg border border-border bg-card p-1 text-sm">
          <button
            onClick={() => setView("my")}
            className={`px-3 py-1 rounded-md transition-colors ${
              view === "my" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            My Desk
          </button>
          <button
            onClick={() => setView("team")}
            className={`px-3 py-1 rounded-md transition-colors ${
              view === "team" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Team View
          </button>
        </div>
      )}

      {isManager && view === "team" ? (
        <TeamView />
      ) : (
        <>
          <DeskBrief />
          <ThisWeekRow />
          <LiveJobsStatus />
        </>
      )}
    </div>
  );
}
