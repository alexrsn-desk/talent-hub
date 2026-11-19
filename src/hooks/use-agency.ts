import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getStripeEnvironment } from "@/lib/stripe";

export function useAgency() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["agency", user?.id],
    enabled: !!user,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data: member } = await supabase.from("agency_members").select("agency_id, role").eq("user_id", user!.id).maybeSingle();
      if (!member) return null;
      const [{ data: agency }, { data: members }] = await Promise.all([
        supabase.from("agencies").select("*").eq("id", member.agency_id).single(),
        supabase.from("agency_members").select("user_id, role").eq("agency_id", member.agency_id),
      ]);
      let env: string | null = null;
      try { env = getStripeEnvironment(); } catch { env = null; }
      const { data: sub } = env
        ? await supabase.from("subscriptions").select("*").eq("agency_id", member.agency_id).eq("environment", env)
            .order("created_at", { ascending: false }).limit(1).maybeSingle()
        : { data: null };
      return { role: member.role, agency, memberCount: members?.length ?? 1, subscription: sub };
    },
  });
}
