import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type TeamMember = {
  id: string;
  manager_user_id: string;
  member_user_id: string | null;
  name: string;
  email: string | null;
  joined_date: string | null;
  active: boolean;
  created_at: string;
};

export type TeamInvite = {
  id: string;
  manager_user_id: string;
  code: string;
  email: string | null;
  name: string | null;
  expires_at: string;
  used_at: string | null;
  used_by_user_id: string | null;
  created_at: string;
};

/** Returns the current user's role row(s). */
export function useMyRoles() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-roles", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles" as any)
        .select("role")
        .eq("user_id", user!.id);
      if (error) throw error;
      return ((data as any[]) || []).map((r) => r.role as "manager" | "consultant" | "solo");
    },
  });
}

export function useIsManager() {
  const { data: roles = [] } = useMyRoles();
  return roles.includes("manager");
}

/** Team members the current manager owns. */
export function useTeamMembers() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["team-members", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members" as any)
        .select("*")
        .eq("manager_user_id", user!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as unknown as TeamMember[]) || [];
    },
  });
}

/** Invite codes the current manager has created. */
export function useTeamInvites() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["team-invites", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_invites" as any)
        .select("*")
        .eq("manager_user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as TeamInvite[]) || [];
    },
  });
}

function genCode() {
  // 8-char base32-ish, easy to read
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function useCreateInvite() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name?: string; email?: string }) => {
      if (!user) throw new Error("Not signed in");
      // Make sure caller has manager role (idempotent)
      await supabase
        .from("user_roles" as any)
        .upsert({ user_id: user.id, role: "manager" } as any, { onConflict: "user_id,role" });

      const code = genCode();
      const { data, error } = await supabase
        .from("team_invites" as any)
        .insert({
          manager_user_id: user.id,
          code,
          email: input.email || null,
          name: input.name || null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as TeamInvite;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-invites"] });
      qc.invalidateQueries({ queryKey: ["my-roles"] });
    },
  });
}

export function useRevokeInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase.from("team_invites" as any).delete().eq("id", inviteId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-invites"] }),
  });
}

export function useDeactivateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from("team_members" as any)
        .update({ active: false } as any)
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-members"] }),
  });
}

/** Consume an invite code for the current user. */
export function useJoinTeam() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rawCode: string) => {
      if (!user) throw new Error("Not signed in");
      const code = rawCode.trim().toUpperCase();
      if (!code) throw new Error("Enter a code");

      const { data: invite, error: lookupErr } = await supabase
        .from("team_invites" as any)
        .select("*")
        .eq("code", code)
        .maybeSingle();
      if (lookupErr) throw lookupErr;
      if (!invite) throw new Error("Invite code not found");
      const inv = invite as unknown as TeamInvite;
      if (inv.used_at) throw new Error("This code has already been used");
      if (new Date(inv.expires_at).getTime() < Date.now()) throw new Error("This code has expired");
      if (inv.manager_user_id === user.id) throw new Error("You can't join your own team");

      // Create team_members row owned by the manager
      // (manager's RLS allows them to insert; we can't from here.)
      // Instead: add member-side row by using RLS that lets the consumer create their membership.
      // To keep policies simple, we let the manager's INSERT policy be the only writer,
      // so we use an RPC-style workaround: set member_user_id directly via an insert
      // that satisfies WITH CHECK (auth.uid() = manager_user_id) — which would fail.
      //
      // Simpler approach: use a SECURITY DEFINER function exposed via PostgREST.
      // We invoke it here.
      const { error: claimErr } = await supabase.rpc("claim_team_invite" as any, {
        _code: code,
      } as any);
      if (claimErr) throw claimErr;

      return inv;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-roles"] });
      qc.invalidateQueries({ queryKey: ["team-members"] });
      qc.invalidateQueries({ queryKey: ["team-invites"] });
    },
  });
}
