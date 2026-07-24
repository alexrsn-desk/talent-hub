import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Users, Waves, PlayCircle, Inbox, Pin, PinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import CandidatesPage from "@/pages/Candidates";
import { TalentPoolsSettings } from "@/components/TalentPoolsSettings";
import { InPlaceCandidatesPanel } from "@/components/InPlaceCandidatesPanel";
import { BucketsPanel } from "@/components/BucketsPanel";
import { usePinnedSections, useTogglePin, type CandidateSection } from "@/hooks/use-pinned-sections";

const TABS: { key: CandidateSection; label: string; icon: any; description: string }[] = [
  { key: "all", label: "All Candidates", icon: Users, description: "Full database — every candidate you've captured." },
  { key: "pools", label: "Talent Pools", icon: Waves, description: "Curated groups organised by discipline or specialism." },
  { key: "in-play", label: "In Play", icon: PlayCircle, description: "Candidates actively moving through a job pipeline." },
  { key: "buckets", label: "Buckets", icon: Inbox, description: "Unsorted capture — light-touch grouping across candidates, contacts, and companies." },
];

export default function CandidatesHub() {
  const [params, setParams] = useSearchParams();
  const initial = (params.get("section") as CandidateSection) || "all";
  const [tab, setTab] = useState<CandidateSection>(initial);
  const { data: pinned = [] } = usePinnedSections();
  const togglePin = useTogglePin();

  useEffect(() => {
    const s = params.get("section") as CandidateSection | null;
    if (s && s !== tab) setTab(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const setTabAndUrl = (s: CandidateSection) => {
    setTab(s);
    const p = new URLSearchParams(params);
    p.set("section", s);
    setParams(p, { replace: true });
  };

  const active = TABS.find((t) => t.key === tab)!;
  const isPinned = pinned.includes(tab);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border bg-background">
        <div className="px-6 pt-5 pb-3">
          <h1 className="text-xl font-semibold tracking-tight">Candidates</h1>
          <p className="text-sm text-muted-foreground mt-0.5">One hub for everyone in your world.</p>
        </div>
        <nav className="px-4 flex items-center gap-1 -mb-px overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = t.key === tab;
            const pinnedHere = pinned.includes(t.key);
            return (
              <button
                key={t.key}
                onClick={() => setTabAndUrl(t.key)}
                className={`group relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
                {pinnedHere && <Pin className="h-2.5 w-2.5 text-primary fill-primary" />}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="px-6 py-4 flex items-start justify-between gap-4 border-b border-border/50 bg-muted/10">
          <p className="text-xs text-muted-foreground max-w-2xl">{active.description}</p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs shrink-0"
            onClick={async () => {
              await togglePin.mutateAsync(tab);
              toast.success(isPinned ? "Unpinned from sidebar" : "Pinned to sidebar");
            }}
          >
            {isPinned ? <><PinOff className="h-3 w-3 mr-1.5" /> Unpin from sidebar</> : <><Pin className="h-3 w-3 mr-1.5" /> Pin to sidebar</>}
          </Button>
        </div>

        {tab === "all" && (
          <div className="-mt-px">
            <CandidatesPage />
          </div>
        )}
        {tab === "pools" && (
          <div className="px-6 py-6"><TalentPoolsSettings /></div>
        )}
        {tab === "in-play" && (
          <div className="px-6 py-6"><InPlaceCandidatesPanel /></div>
        )}
        {tab === "buckets" && (
          <div className="px-6 py-6"><BucketsPanel /></div>
        )}
      </div>
    </div>
  );
}
