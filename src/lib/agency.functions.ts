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

/* ------------------------------ FEEDBACK ------------------------------ */

export type PortalFeedbackRow = {
  id: string;
  candidate_id: string;
  client_email: string | null;
  stage_at_time: string | null;
  comment: string;
  rating: number | null;
  created_at: string;
  author_role: string;
  reply_to: string | null;
  updated_at: string | null;
};

export const loadCandidateFeedback = ({ data }: { data: { candidateId: string } }) => {
  const input = z.object({ candidateId: z.string().uuid() }).parse(data);
  return call<{ feedback: PortalFeedbackRow[] }>("loadCandidateFeedback", input);
};

export const addAgencyReply = ({
  data,
}: {
  data: { candidateId: string; comment: string; stage?: string | null; replyTo?: string | null };
}) => {
  const input = z
    .object({
      candidateId: z.string().uuid(),
      comment: z.string().min(1).max(4000),
      stage: z.string().max(120).nullish(),
      replyTo: z.string().uuid().nullish(),
    })
    .parse(data);
  return call<{ ok: true; id: string }>("addAgencyReply", input);
};

export const editFeedback = ({
  data,
}: {
  data: { feedbackId: string; comment: string; rating?: number | null };
}) => {
  const input = z
    .object({
      feedbackId: z.string().uuid(),
      comment: z.string().min(1).max(4000),
      rating: z.number().int().min(1).max(5).nullish(),
    })
    .parse(data);
  return call<{ ok: true }>("editFeedback", input);
};

/* --------------------------- JOB EMAIL SETTINGS --------------------------- */

export const setRejectionEmailMode = ({
  data,
}: {
  data: { jobId: string; mode: "template" | "ai" };
}) => {
  const input = z
    .object({ jobId: z.string().uuid(), mode: z.enum(["template", "ai"]) })
    .parse(data);
  return call<{ ok: true }>("setRejectionEmailMode", input);
};

/* ------------------------------ BULK EMAILS ------------------------------ */

export type BulkEmailResult = {
  ok: true;
  sent: number;
  results: { candidateId: string; name: string; ok: boolean; error?: string }[];
};

export const bulkSendEmails = ({
  data,
}: {
  data: {
    candidateIds: string[];
    kind: "general" | "reject";
    subject?: string;
    body?: string;
    markRejected?: boolean;
  };
}) => {
  const input = z
    .object({
      candidateIds: z.array(z.string().uuid()).min(1),
      kind: z.enum(["general", "reject"]),
      subject: z.string().max(200).optional(),
      body: z.string().max(8000).optional(),
      markRejected: z.boolean().optional(),
    })
    .parse(data);
  return call<BulkEmailResult>("bulkSendEmails", input);
};

/* ------------------------------ AI PREVIEWS ------------------------------ */

export type EmailPreview = {
  subject: string;
  body: string;
  ai: boolean;
  stage?: string;
  toEmail: string | null;
};

export const previewInterviewEmail = ({
  data,
}: {
  data: { candidateId: string; stage?: string | null };
}) => {
  const input = z
    .object({ candidateId: z.string().uuid(), stage: z.string().max(120).nullish() })
    .parse(data);
  return call<EmailPreview>("previewInterviewEmail", input);
};

export const previewRejectionEmail = ({
  data,
}: {
  data: { candidateId: string; mode?: "template" | "ai" };
}) => {
  const input = z
    .object({ candidateId: z.string().uuid(), mode: z.enum(["template", "ai"]).optional() })
    .parse(data);
  return call<EmailPreview>("previewRejectionEmail", input);
};
