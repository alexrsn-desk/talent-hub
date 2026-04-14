import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { Save, Loader2, Upload, Palette } from "lucide-react";
import { DataImport } from "@/components/DataImport";

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

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [niches, setNiches] = useState<string[]>([]);
  const [nicheOther, setNicheOther] = useState("");
  const [salaryRange, setSalaryRange] = useState([40, 100]);
  const [placementType, setPlacementType] = useState("Both");
  const [locations, setLocations] = useState<string[]>([]);
  const [regionalDetail, setRegionalDetail] = useState("");
  const [idealCandidate, setIdealCandidate] = useState("");
  const [bdApproach, setBdApproach] = useState("");
  const [biggestChallenge, setBiggestChallenge] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [agencyLogoUrl, setAgencyLogoUrl] = useState("");
  const [brandColor, setBrandColor] = useState("#3B82F6");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("recruiter_profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();
      if (data) {
        setNiches(data.niches || []);
        setNicheOther(data.niche_other || "");
        setSalaryRange([(data.salary_min || 40000) / 1000, (data.salary_max || 100000) / 1000]);
        setPlacementType(data.placement_type || "Both");
        setLocations(data.locations || []);
        setRegionalDetail(data.location_regional_detail || "");
        setIdealCandidate(data.ideal_candidate || "");
        setBdApproach(data.bd_approach || "");
        setBiggestChallenge(data.biggest_challenge || "");
        setDisplayName(data.display_name || "");
        setAgencyName((data as any).agency_name || "");
        setAgencyLogoUrl((data as any).agency_logo_url || "");
        setBrandColor((data as any).brand_color || "#3B82F6");
      }
      setLoading(false);
    })();
  }, [user]);

  const toggleNiche = (n: string) =>
    setNiches(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);
  const toggleLocation = (l: string) =>
    setLocations(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/logo.${ext}`;
      const { error: uploadError } = await supabase.storage.from("agency-logos").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("agency-logos").getPublicUrl(path);
      setAgencyLogoUrl(urlData.publicUrl);
      toast.success("Logo uploaded");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("recruiter_profiles")
        .update({
          display_name: displayName,
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
          agency_name: agencyName || null,
          agency_logo_url: agencyLogoUrl || null,
          brand_color: brandColor,
        } as any)
        .eq("user_id", user.id);
      if (error) throw error;
      toast.success("Profile updated — AI coach will use your new preferences");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const SelectButton = ({ selected, onClick, label }: { selected: boolean; onClick: () => void; label: string }) => (
    <button
      onClick={onClick}
      className={`text-sm text-left rounded-lg border px-3 py-2 transition-colors ${
        selected
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-card text-muted-foreground hover:border-primary/50"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h1 className="text-lg font-semibold">My Profile</h1>
        <p className="text-sm text-muted-foreground">Update your preferences — changes immediately affect your AI coach.</p>
      </div>

      {/* Agency Branding */}
      <div className="space-y-4 border border-border rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          <label className="text-sm font-medium">Client Portal Branding</label>
        </div>
        <p className="text-xs text-muted-foreground">This branding appears on your client portal — clients see your agency, not the CRM.</p>

        <div className="space-y-2">
          <label className="text-xs font-medium">Agency Name</label>
          <Input value={agencyName} onChange={(e) => setAgencyName(e.target.value)} placeholder="Your Agency Name" />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium">Agency Logo</label>
          <div className="flex items-center gap-3">
            {agencyLogoUrl && (
              <img src={agencyLogoUrl} alt="Logo" className="h-10 w-auto rounded border border-border bg-white p-1" />
            )}
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            <Button size="sm" variant="outline" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}>
              {uploadingLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
              {agencyLogoUrl ? "Change" : "Upload"}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium">Brand Colour</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              className="h-9 w-12 rounded border border-border cursor-pointer bg-transparent"
            />
            <Input value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="w-28 font-mono text-sm" />
            <div className="h-9 flex-1 rounded border border-border" style={{ backgroundColor: brandColor }} />
          </div>
        </div>
      </div>

      {/* Display name */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Display name</label>
        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </div>

      {/* Niches */}
      <div className="space-y-3">
        <label className="text-sm font-medium">Recruitment specialisms</label>
        <div className="grid grid-cols-2 gap-2">
          {NICHES.map((n) => (
            <SelectButton key={n} selected={niches.includes(n)} onClick={() => toggleNiche(n)} label={n} />
          ))}
        </div>
        {niches.includes("Other") && (
          <Input placeholder="Describe your niche…" value={nicheOther} onChange={(e) => setNicheOther(e.target.value)} />
        )}
      </div>

      {/* Salary */}
      <div className="space-y-3">
        <label className="text-sm font-medium">Typical salary range</label>
        <div className="px-2">
          <Slider min={20} max={200} step={5} value={salaryRange} onValueChange={setSalaryRange} />
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>£{salaryRange[0]}k</span>
            <span>£{salaryRange[1]}k{salaryRange[1] >= 200 ? "+" : ""}</span>
          </div>
        </div>
      </div>

      {/* Placement type */}
      <div className="space-y-3">
        <label className="text-sm font-medium">Placement type</label>
        <div className="flex gap-2">
          {["Permanent", "Contract", "Both"].map((t) => (
            <SelectButton key={t} selected={placementType === t} onClick={() => setPlacementType(t)} label={t} />
          ))}
        </div>
      </div>

      {/* Locations */}
      <div className="space-y-3">
        <label className="text-sm font-medium">Client locations</label>
        <div className="flex flex-wrap gap-2">
          {LOCATIONS.map((l) => (
            <SelectButton key={l} selected={locations.includes(l)} onClick={() => toggleLocation(l)} label={l} />
          ))}
        </div>
        {locations.includes("Regional") && (
          <Input placeholder="Which region?" value={regionalDetail} onChange={(e) => setRegionalDetail(e.target.value)} />
        )}
      </div>

      {/* Ideal candidate */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Typical candidate</label>
        <Input
          placeholder="e.g. Senior software engineers with 5+ years experience"
          value={idealCandidate}
          onChange={(e) => setIdealCandidate(e.target.value)}
        />
      </div>

      {/* BD approach */}
      <div className="space-y-3">
        <label className="text-sm font-medium">BD approach</label>
        <div className="grid grid-cols-2 gap-2">
          {BD_APPROACHES.map((a) => (
            <SelectButton key={a} selected={bdApproach === a} onClick={() => setBdApproach(a)} label={a} />
          ))}
        </div>
      </div>

      {/* Challenge */}
      <div className="space-y-3">
        <label className="text-sm font-medium">Biggest challenge</label>
        <div className="grid grid-cols-2 gap-2">
          {CHALLENGES.map((c) => (
            <SelectButton key={c} selected={biggestChallenge === c} onClick={() => setBiggestChallenge(c)} label={c} />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
          Save changes
        </Button>
        <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground">
          Sign out
        </Button>
      </div>
    </div>
  );
}
