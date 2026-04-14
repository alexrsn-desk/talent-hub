import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Sparkles, ArrowRight, ArrowLeft, Check } from "lucide-react";

const NICHES = [
  "Tech/Digital", "Sales/Commercial", "Finance", "Legal",
  "HR", "Marketing", "Executive/C-Suite", "Engineering",
  "Healthcare", "Hospitality", "Construction", "Other",
];

const LOCATIONS = ["London", "UK Wide", "Remote First", "Regional", "International"];

const BD_APPROACHES = ["Heavy phone", "Mostly LinkedIn", "Email led", "Mix of everything"];

const CHALLENGES = [
  "Not enough jobs", "Not enough candidates", "Losing deals at offer",
  "Getting client meetings", "Staying organised", "All of the above",
];

export function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Form state
  const [niches, setNiches] = useState<string[]>([]);
  const [nicheOther, setNicheOther] = useState("");
  const [salaryRange, setSalaryRange] = useState([40, 100]);
  const [placementType, setPlacementType] = useState("Both");
  const [locations, setLocations] = useState<string[]>([]);
  const [regionalDetail, setRegionalDetail] = useState("");
  const [idealCandidate, setIdealCandidate] = useState("");
  const [bdApproach, setBdApproach] = useState("");
  const [biggestChallenge, setBiggestChallenge] = useState("");

  const toggleNiche = (n: string) =>
    setNiches(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);

  const toggleLocation = (l: string) =>
    setLocations(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]);

  const handleComplete = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("recruiter_profiles")
        .update({
          niches,
          niche_other: niches.includes("Other") ? nicheOther : null,
          salary_min: salaryRange[0] * 1000,
          salary_max: salaryRange[1] * 1000,
          placement_type: placementType,
          locations,
          location_regional_detail: locations.includes("Regional") ? regionalDetail : null,
          ideal_candidate: idealCandidate,
          bd_approach: bdApproach,
          biggest_challenge: biggestChallenge,
          onboarding_completed: true,
        })
        .eq("user_id", user.id);

      if (error) throw error;
      onComplete();
    } catch (err: any) {
      toast.error(err.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const canNext = () => {
    if (step === 2) return niches.length > 0;
    if (step === 3) return !!placementType;
    if (step === 4) return locations.length > 0;
    if (step === 5) return !!bdApproach && !!biggestChallenge;
    return true;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg space-y-8">
        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Setting up your desk</span>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  s <= step ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Step {step} of 5</p>
        </div>

        {/* Step 1: Welcome */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Welcome to RecruiterCRM</h2>
            <p className="text-sm text-muted-foreground">
              Before we set up your desk, tell us a bit about how you recruit. This personalises your AI coach so it speaks your language from day one.
            </p>
            <p className="text-xs text-muted-foreground">5 quick steps — takes about 60 seconds.</p>
          </div>
        )}

        {/* Step 2: Niches */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">What type of recruitment do you specialise in?</h2>
            <p className="text-xs text-muted-foreground">Select all that apply</p>
            <div className="grid grid-cols-2 gap-2">
              {NICHES.map((n) => (
                <button
                  key={n}
                  onClick={() => toggleNiche(n)}
                  className={`text-sm text-left rounded-lg border px-3 py-2.5 transition-colors ${
                    niches.includes(n)
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            {niches.includes("Other") && (
              <Input
                placeholder="Describe your niche…"
                value={nicheOther}
                onChange={(e) => setNicheOther(e.target.value)}
              />
            )}
          </div>
        )}

        {/* Step 3: Market */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">What's your typical salary range?</h2>
              <div className="px-2">
                <Slider
                  min={20}
                  max={200}
                  step={5}
                  value={salaryRange}
                  onValueChange={setSalaryRange}
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>£{salaryRange[0]}k</span>
                  <span>£{salaryRange[1]}k{salaryRange[1] >= 200 ? "+" : ""}</span>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-medium">What type of placements do you make?</h3>
              <div className="flex gap-2">
                {["Permanent", "Contract", "Both"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setPlacementType(t)}
                    className={`text-sm rounded-lg border px-4 py-2 transition-colors ${
                      placementType === t
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Location */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Where are your clients based?</h2>
              <p className="text-xs text-muted-foreground">Select all that apply</p>
              <div className="flex flex-wrap gap-2">
                {LOCATIONS.map((l) => (
                  <button
                    key={l}
                    onClick={() => toggleLocation(l)}
                    className={`text-sm rounded-lg border px-3 py-2 transition-colors ${
                      locations.includes(l)
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {locations.includes("Regional") && (
                <Input
                  placeholder="Which region? e.g. South West, Midlands…"
                  value={regionalDetail}
                  onChange={(e) => setRegionalDetail(e.target.value)}
                />
              )}
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Describe your typical candidate in one line</h3>
              <Input
                placeholder="e.g. Senior software engineers with 5+ years experience"
                value={idealCandidate}
                onChange={(e) => setIdealCandidate(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Step 5: Style */}
        {step === 5 && (
          <div className="space-y-6">
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">How would you describe your BD approach?</h2>
              <div className="grid grid-cols-2 gap-2">
                {BD_APPROACHES.map((a) => (
                  <button
                    key={a}
                    onClick={() => setBdApproach(a)}
                    className={`text-sm text-left rounded-lg border px-3 py-2.5 transition-colors ${
                      bdApproach === a
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-medium">What's your biggest challenge right now?</h3>
              <div className="grid grid-cols-2 gap-2">
                {CHALLENGES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setBiggestChallenge(c)}
                    className={`text-sm text-left rounded-lg border px-3 py-2.5 transition-colors ${
                      biggestChallenge === c
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between">
          {step > 1 ? (
            <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          ) : (
            <div />
          )}
          {step < 5 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>
              Next <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleComplete} disabled={!canNext() || saving}>
              {saving ? "Saving…" : (
                <>
                  <Check className="h-4 w-4 mr-1" /> Your desk is ready
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
