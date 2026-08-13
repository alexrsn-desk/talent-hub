// Authenticated agency-side portal calls (port of agency.functions.ts).
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";

async function call<T>(action: string, payload: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke("portal-agency", {
    body: { action, payload },
  });
  if (error) throw new Error(error.message);
  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new Error(String(data.error));
  }
  return data as T;
}

export const generateApiKey = ({ data }: { data: { name: string; canWrite: boolean } }) => {
  const input = z.object({ name: z.string().min(1).max(80), canWrite: z.boolean() }).parse(data);
  return call<{
    id: string;
    name: string;
    key_prefix: string;
    can_write: boolean;
    created_at: string;
    key: string;
  }>("generateApiKey", input);
};

export const notifyCandidateCreated = ({ data }: { data: { candidateId: string } }) => {
  const input = z.object({ candidateId: z.string().uuid() }).parse(data);
  return call<{ ok: true }>("notifyCandidateCreated", input);
};

export type PushToPortalResult = {
  ok: true;
  created: boolean;
  portalCandidateId: string;
  accessToken: string | null;
  pushedAt: string;
  stage: string;
};

export const pushCandidateToPortal = ({
  data,
}: {
  data: { deskyCandidateId: string; portalJobId: string };
}) => {
  const input = z
    .object({ deskyCandidateId: z.string().uuid(), portalJobId: z.string().uuid() })
    .parse(data);
  return call<PushToPortalResult>("pushCandidateToPortal", input);
};
