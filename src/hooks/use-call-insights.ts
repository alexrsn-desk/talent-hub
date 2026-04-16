import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";

export interface CallInsight {
  id: string;
  note_id: string;
  candidate_id: string | null;
  kind: "field" | "tag";
  field_name: string | null;
  tag_category: string | null;
  tag_label: string | null;
  detected_value: string | null;
  confidence: "high" | "medium";
  source_quote: string | null;
  status: "pending" | "accepted" | "ignored";
  created_at: string;
}

export function useCallInsights(noteId: string | undefined) {
  return useQuery({
    queryKey: ["call-insights", noteId],
    queryFn: async () => {
      if (!noteId) return [];
      const { data, error } = await supabase
        .from("call_insights")
        .select("*")
        .eq("note_id", noteId)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as CallInsight[];
    },
    enabled: !!noteId,
    refetchInterval: (query) => {
      const data = query.state.data;
      const ageMs = Date.now() - new Date(query.state.dataUpdatedAt).getTime();
      if (!data || data.length === 0) return ageMs < 15000 ? 2000 : false;
      return false;
    },
  });
}

const FIELD_LABELS: Record<string, string> = {
  salary_current: "Current salary",
  salary_expectation: "Salary expectation",
  availability: "Availability / notice",
  notice_period: "Notice period",
  other_processes: "Other processes",
  counter_offer_risk: "Counter-offer risk",
};

export function fieldLabel(field: string | null) {
  if (!field) return "";
  return FIELD_LABELS[field] || field;
}

export function useAcceptInsight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { insight: CallInsight; overrideValue?: string }) => {
      const { insight, overrideValue } = params;
      const value = overrideValue ?? insight.detected_value ?? "";

      if (insight.kind === "field" && insight.candidate_id && insight.field_name) {
        const updates: any = {};
        const f = insight.field_name;
        if (f === "salary_current" || f === "salary_expectation") {
          const num = parseInt(String(value).replace(/[^0-9]/g, ""), 10);
          if (!isNaN(num)) updates[f] = num;
        } else if (f === "availability") {
          updates.availability = value;
        }
        if (Object.keys(updates).length > 0) {
          const { error } = await supabase.from("candidates").update(updates).eq("id", insight.candidate_id);
          if (error) throw error;
        }
        await logActivity({
          action_type: "candidate_updated",
          candidate_id: insight.candidate_id,
          metadata: {
            source: "ai_extracted",
            field: insight.field_name,
            value,
            quote: insight.source_quote,
            note_id: insight.note_id,
          },
        });
      }

      if (insight.kind === "tag" && insight.candidate_id && insight.tag_category && insight.tag_label) {
        let { data: defs } = await supabase
          .from("tag_definitions")
          .select("id")
          .eq("category", insight.tag_category)
          .eq("label", insight.tag_label)
          .limit(1);
        let defId = defs?.[0]?.id;
        if (!defId) {
          const { data: created, error: createErr } = await supabase
            .from("tag_definitions")
            .insert({ category: insight.tag_category, label: insight.tag_label })
            .select("id")
            .single();
          if (createErr) throw createErr;
          defId = created.id;
        }
        const { error: tagErr } = await supabase.from("candidate_tags").insert({
          candidate_id: insight.candidate_id,
          tag_definition_id: defId,
          source: `ai_transcript:${insight.source_quote || ""}`.slice(0, 500),
          confidence: insight.confidence,
        });
        if (tagErr) throw tagErr;
        await logActivity({
          action_type: "candidate_updated",
          candidate_id: insight.candidate_id,
          metadata: {
            source: "ai_extracted",
            tag: `${insight.tag_category}:${insight.tag_label}`,
            quote: insight.source_quote,
            note_id: insight.note_id,
          },
        });
      }

      const { error } = await supabase
        .from("call_insights")
        .update({ status: "accepted", resolved_at: new Date().toISOString() })
        .eq("id", insight.id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["call-insights", vars.insight.note_id] });
      qc.invalidateQueries({ queryKey: ["candidates"] });
      qc.invalidateQueries({ queryKey: ["candidate"] });
      if (vars.insight.candidate_id) {
        qc.invalidateQueries({ queryKey: ["candidate_tags", vars.insight.candidate_id] });
      }
    },
  });
}

export function useIgnoreInsight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (insight: CallInsight) => {
      const { error } = await supabase
        .from("call_insights")
        .update({ status: "ignored", resolved_at: new Date().toISOString() })
        .eq("id", insight.id);
      if (error) throw error;
    },
    onSuccess: (_, insight) => {
      qc.invalidateQueries({ queryKey: ["call-insights", insight.note_id] });
    },
  });
}
