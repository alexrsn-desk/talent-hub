import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WeekStats = {
  weekStart: string; // YYYY-MM-DD (Monday)
  weekEnd: string;   // YYYY-MM-DD (Sunday)
  fridayLabel: string; // for display "Friday X Mon"
  overdue: number;
  cvsSent: number;
  interviews: number;
  atOffer: number;
  placements: number;
  /** Live CVs out — all candidates currently at Submitted or Client Review (all time, all active jobs) */
  liveCvsOut: number;
};

/** Returns the Monday (00:00) of the current week as a Date */
export function getWeekStart(d = new Date()): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay(); // 0 Sun ... 6 Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  date.setDate(date.getDate() + diff);
  return date;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function useWeekStats(ownerUserId?: string) {
  return useQuery({
    queryKey: ["week-stats", ownerUserId ?? "me"],
    queryFn: async () => {
      const monday = getWeekStart();
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const friday = new Date(monday);
      friday.setDate(monday.getDate() + 4);
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      const mondayIso = isoDate(monday);
      const sundayIso = isoDate(sunday);
      const todayIso = isoDate(new Date());

      // Resolve owner filter: default to current user if none given
      let owner = ownerUserId;
      if (!owner) {
        const { data: { user } } = await supabase.auth.getUser();
        owner = user?.id;
      }

      // Run in parallel
      const overdueP = supabase
        .from("notes")
        .select("id", { count: "exact", head: true })
        .not("follow_up_date", "is", null)
        .lt("follow_up_date", todayIso)
        .eq("owner_user_id", owner!);

      // CVs sent this week — count candidate_jobs where stage moved to Submitted this week.
      // Approximation: use stage_changed_at on candidate_jobs currently in Submitted stages.
      const cvsP = supabase
        .from("candidate_jobs")
        .select("id, stage, stage_changed_at, owner_user_id")
        .in("stage", ["Submitted", "Client Review", "First Interview", "Second Interview", "Offer", "Placed"])
        .gte("stage_changed_at", monday.toISOString())
        .lte("stage_changed_at", sunday.toISOString() + "T23:59:59")
        .eq("owner_user_id", owner!);

      // Interviews this week — interviews scheduled between Mon-Sun
      const interviewsP = supabase
        .from("interviews")
        .select("id", { count: "exact", head: true })
        .gte("scheduled_at", monday.toISOString())
        .lte("scheduled_at", sunday.toISOString() + "T23:59:59")
        .eq("owner_user_id", owner!);

      // At offer (currently in Offer stage)
      const atOfferP = supabase
        .from("candidate_jobs")
        .select("id", { count: "exact", head: true })
        .eq("stage", "Offer")
        .eq("owner_user_id", owner!);

      // Placements this week — start_date or offer_accepted_date this week
      const placementsP = supabase
        .from("placements")
        .select("id, start_date, offer_accepted_date, owner_user_id")
        .eq("owner_user_id", owner!);

      // Live CVs out — currently at Submitted or Client Review (all time)
      const liveCvsP = supabase
        .from("candidate_jobs")
        .select("id", { count: "exact", head: true })
        .in("stage", ["Submitted", "Client Review"])
        .eq("owner_user_id", owner!);

      const [overdueR, cvsR, interviewsR, atOfferR, placementsR, liveCvsR] = await Promise.all([
        overdueP, cvsP, interviewsP, atOfferP, placementsP, liveCvsP,
      ]);

      const placements = (placementsR.data || []).filter((p: any) => {
        const d = p.start_date || p.offer_accepted_date;
        return d && d >= mondayIso && d <= sundayIso;
      }).length;

      const stats: WeekStats = {
        weekStart: mondayIso,
        weekEnd: sundayIso,
        fridayLabel: friday.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }),
        overdue: overdueR.count ?? 0,
        cvsSent: (cvsR.data || []).length,
        interviews: interviewsR.count ?? 0,
        atOffer: atOfferR.count ?? 0,
        placements,
        liveCvsOut: liveCvsR.count ?? 0,
      };
      return stats;
    },
    staleTime: 60_000,
  });
}

export function formatWeekRange(s: WeekStats) {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const friday = new Date(s.weekStart);
  friday.setDate(friday.getDate() + 4);
  return `Week of ${fmt(s.weekStart)} — ${fmt(isoDate(friday))}`;
}

function isoDateLocal(d: Date) {
  return d.toISOString().slice(0, 10);
}
