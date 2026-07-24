import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Users, Waves, PlayCircle, Inbox, Pin, PinOff, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import CandidatesPage from "@/pages/Candidates";
import { TalentPoolsSettings } from "@/components/TalentPoolsSettings";
import { InPlaceCandidatesPanel } from "@/components/InPlaceCandidatesPanel";
import { BucketsPanel } from "@/components/BucketsPanel";
import { usePinnedSections, useTogglePin, type CandidateSection } from "@/hooks/use-pinned-sections";

type Tile = {
  key: CandidateSection;
  label: string;
  icon: any;
  description: string;
};

const TILES: Tile[] = [
  { key: "all", label: "All Candidates", icon: Users, description: "Full database with filters and AI search." },
  { key: "pools", label: "Talent Pools", icon: Waves, description: "Curated groups by discipline or specialism." },
  { key: "in-play", label: "In Play", icon: PlayCircle, description: "Candidates actively moving through a pipeline." },
  { key: "buckets", label: "Buckets", icon: Inbox, description: "Light-touch grouping across people and companies." },
];

export default function CandidatesHub() {
  const [params, setParams] = useSearchParams();
  const sectionParam = params.get("section") as CandidateSection | null;
  const [section, setSection] = useState<CandidateSection | null>(sectionParam);
  const { data: pinned = [] } = usePinnedSections();
  const togglePin = useTogglePin();

  useEffect(() => {
    setSection((params.get("section") as CandidateSection | null) ?? null);
  }, [params]);

  const openSection = (s: CandidateSection) => {
    const p = new URLSearchParams(params);
    p.set("section", s);
    setParams(p, { replace: false });
  };

  const backToHub = () => {
    const p = new URLSearchParams(params);
    p.delete("section");
    setParams(p, { replace: false });
  };

  if (!section) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-8 pt-10 pb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Candidates</h1>
          <p className="text-sm text-muted-foreground mt-1">One hub for everyone in your world.</p>
        </div>
        <div className="flex-1 overflow-auto px-8 pb-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl">
            {TILES.map((t) => {
              const Icon = t.icon;
              const isPinned = pinned.includes(t.key);
              return (
                <button
                  key={t.key}
                  onClick={() => openSection(t.key)}
                  className="group relative aspect-square rounded-2xl border border-border bg-card hover:bg-accent/40 hover:border-foreground/20 transition-all flex flex-col items-center justify-center gap-3 p-6 text-center"
                >
                  {isPinned && (
                    <Pin className="absolute top-3 right-3 h-3 w-3 text-primary fill-primary" />
                  )}
                  <div className="h-14 w-14 rounded-full bg-muted/60 group-hover:bg-background flex items-center justify-center transition-colors">
                    <Icon className="h-6 w-6 text-foreground" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">{t.label}</div>
                    <div className="text-[11px] text-muted-foreground mt-1 leading-snug">{t.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const active = TILES.find((t) => t.key === section)!;
  const isPinned = pinned.includes(section);
  const Icon = active.icon;

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border bg-background">
        <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="h-8 -ml-2" onClick={backToHub}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Hub
            </Button>
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <h1 className="text-lg font-semibold tracking-tight">{active.label}</h1>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={async () => {
              await togglePin.mutateAsync(section);
              toast.success(isPinned ? "Unpinned from sidebar" : "Pinned to sidebar");
            }}
          >
            {isPinned ? <><PinOff className="h-3 w-3 mr-1.5" /> Unpin</> : <><Pin className="h-3 w-3 mr-1.5" /> Pin to sidebar</>}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {section === "all" && <CandidatesPage />}
        {section === "pools" && <div className="px-6 py-6"><TalentPoolsSettings /></div>}
        {section === "in-play" && <div className="px-6 py-6"><InPlaceCandidatesPanel /></div>}
        {section === "buckets" && <div className="px-6 py-6"><BucketsPanel /></div>}
      </div>
    </div>
  );
}
