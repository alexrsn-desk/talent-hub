import { useEffect, useState } from "react";
import { FileText, ChevronDown, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const TEMPLATES = [
  { key: "linkedin_post_template", label: "LinkedIn post", hint: "Paste a post you liked, or describe the format: hook line, 3 bullets on the role, soft call to action…" },
  { key: "job_ad_template", label: "Full job ad", hint: "Sections and order, e.g. The company / The role / What you'll do / What you'll bring / Package / How to apply" },
  { key: "personal_candidate_template", label: "Candidate message", hint: "How you message people you know: tone, length, how you open and close" },
  { key: "li_connection_template", label: "LinkedIn DM", hint: "Short connection message style (under 300 characters)" },
  { key: "campaign_outreach_template", label: "Email sequence", hint: "First email format: subject style, length, call to action. Use {first_name} {current_company}" },
  { key: "email_sequence_template", label: "Follow-ups", hint: "e.g. Follow-up 1 after 3 days: short bump. Follow-up 2 after 7 days: new angle on the role. Breakup email after 14 days" },
] as const;
type Key = typeof TEMPLATES[number]["key"];

export function LaunchTemplatesEditor() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Partial<Record<Key, string>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data } = await supabase.from("recruiter_profiles")
        .select(TEMPLATES.map((t) => t.key).join(", ")).eq("user_id", user.id).maybeSingle();
      setValues((data as any) ?? {});
      setLoading(false);
    })();
  }, []);

  async function save() {
    if (!userId) return;
    setSaving(true);
    const payload = Object.fromEntries(TEMPLATES.map((t) => [t.key, values[t.key]?.trim() || null]));
    const { data, error } = await supabase.from("recruiter_profiles").update(payload as any).eq("user_id", userId).select("user_id");
    let err = error;
    if (!err && !data?.length) err = (await supabase.from("recruiter_profiles").insert({ user_id: userId, ...payload } as any)).error;
    setSaving(false);
    if (err) toast.error(err.message); else toast.success("Templates saved — every new launch will follow them");
  }

  const filled = TEMPLATES.filter((t) => values[t.key]?.trim()).length;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-xl border border-border bg-card/60">
      <CollapsibleTrigger className="flex w-full items-center gap-2 p-4 text-left">
        <FileText className="h-4 w-4 text-primary" />
        <span className="font-semibold text-sm">Edit templates</span>
        <span className="text-xs text-muted-foreground">{loading ? "" : `${filled}/${TEMPLATES.length} set`}</span>
        <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 space-y-3">
        <p className="text-xs text-muted-foreground">Desky writes every launch in these formats. Leave one blank to use the default style.</p>
        <Tabs defaultValue={TEMPLATES[0].key}>
          <TabsList className="flex-wrap h-auto">
            {TEMPLATES.map((t) => <TabsTrigger key={t.key} value={t.key} className="text-xs">{t.label}</TabsTrigger>)}
          </TabsList>
          {TEMPLATES.map((t) => (
            <TabsContent key={t.key} value={t.key}>
              <Textarea rows={8} value={values[t.key] ?? ""} placeholder={t.hint}
                onChange={(e) => setValues((v) => ({ ...v, [t.key]: e.target.value }))} />
            </TabsContent>
          ))}
        </Tabs>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || loading} className="gap-1">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save templates
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
