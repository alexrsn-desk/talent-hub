// Typed client layer for the token-gated portal endpoints.
// Same signatures as the source's server function layer — the validation schemas
// are kept here and the handlers now live in the portal-public edge function.
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";

const slotSchema = z.object({ id: z.string(), label: z.string() });

async function call<T>(action: string, payload: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke("portal-public", {
    body: { action, payload },
  });
  if (error) throw new Error(error.message);
  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new Error(String(data.error));
  }
  return data as T;
}

export type Slot = { id: string; label: string };

export type PortalFeedback = {
  id: string;
  candidate_id?: string;
  client_email: string | null;
  stage_at_time: string | null;
  comment: string;
  rating: number | null;
  created_at: string;
  author_role: string;
  reply_to: string | null;
  updated_at: string | null;
};

export type ClientPortalData = {
  job: {
    id: string;
    title: string;
    clientName: string;
    stages: string[];
    jobSpecUrl: string | null;
    jobSpecFilename: string | null;
  };
  candidates: {
    id: string;
    name: string;
    headline: string | null;
    clientNotes: string | null;
    currentStage: string;
    rejected: boolean;
    cvUrl: string | null;
    feedback: PortalFeedback[];
  }[];
  scheduling: { calendlyUrl: string | null; slots: Slot[] };
  notes: {
    id: string;
    author_role: string;
    author_email: string | null;
    body: string;
    created_at: string;
  }[];
  stageContent: { stage: string; prepMaterial: string; interviewDetails: string }[];
  notifications: {
    interview: boolean;
    rejection: boolean;
    interviewOverridden: boolean;
    rejectionOverridden: boolean;
    defaults: { interview: boolean; rejection: boolean };
  };
};

export type CandidatePortalData = {
  candidate: { id: string; name: string; currentStage: string; rejected: boolean };
  job: {
    title: string;
    clientName: string;
    companyInfo: string | null;
    companyWebsite: string | null;
  };
  stages: { label: string; raw: string; reached: boolean; current: boolean }[];
  pack: {
    jobPack: string | null;
    jobSpec: string | null;
    jobSpecUrl: string | null;
    jobSpecFilename: string | null;
    prepMaterial: string | null;
    interviewDetails: string | null;
  };
  stageContent: { stage: string; prepMaterial: string; interviewDetails: string }[];
  scheduling: { calendlyUrl: string | null; slots: Slot[] } | null;
  booking: { slot: string; status: string; created_at: string } | null;
};

export const getClientPortal = ({ data }: { data: { token: string } }) => {
  const input = z.object({ token: z.string() }).parse(data);
  return call<ClientPortalData | null>("loadClientPortal", input);
};

export const clientMoveCandidate = ({
  data,
}: {
  data: {
    token: string;
    candidateId: string;
    toStage: string;
    reject?: boolean;
    actorEmail?: string | null;
  };
}) => {
  const input = z
    .object({
      token: z.string(),
      candidateId: z.string(),
      toStage: z.string(),
      reject: z.boolean().optional(),
      actorEmail: z.string().nullable().optional(),
    })
    .parse(data);
  return call<{ ok: true }>("moveCandidate", input);
};

export const clientAddFeedback = ({
  data,
}: {
  data: {
    token: string;
    candidateId: string;
    comment: string;
    stage: string;
    rating?: number | null;
    clientEmail?: string | null;
    replyTo?: string | null;
  };
}) => {
  const input = z
    .object({
      token: z.string(),
      candidateId: z.string(),
      comment: z.string().min(1).max(4000),
      stage: z.string(),
      rating: z.number().int().min(1).max(5).nullable().optional(),
      clientEmail: z.string().email().nullable().optional(),
      replyTo: z.string().nullable().optional(),
    })
    .parse(data);
  return call<{ ok: true }>("addFeedback", input);
};

/** Clients edit their own comments only — ownership is checked server-side by email. */
export const clientEditFeedback = ({
  data,
}: {
  data: {
    token: string;
    feedbackId: string;
    comment: string;
    rating?: number | null;
    clientEmail?: string | null;
  };
}) => {
  const input = z
    .object({
      token: z.string(),
      feedbackId: z.string(),
      comment: z.string().min(1).max(4000),
      rating: z.number().int().min(1).max(5).nullable().optional(),
      clientEmail: z.string().email().nullable().optional(),
    })
    .parse(data);
  return call<{ ok: true }>("clientEditFeedback", input);
};

export const clientSaveScheduling = ({
  data,
}: {
  data: { token: string; calendlyUrl: string | null; slots: Slot[] };
}) => {
  const input = z
    .object({
      token: z.string(),
      calendlyUrl: z.string().nullable(),
      slots: z.array(slotSchema),
    })
    .parse(data);
  return call<{ ok: true }>("saveScheduling", input);
};

export const clientAddNote = ({
  data,
}: {
  data: { token: string; body: string; authorEmail?: string | null };
}) => {
  const input = z
    .object({
      token: z.string(),
      body: z.string().min(1).max(8000),
      authorEmail: z.string().nullable().optional(),
    })
    .parse(data);
  return call<{ ok: true }>("addJobNote", input);
};

export const clientSaveStageContent = ({
  data,
}: {
  data: { token: string; stage: string; prepMaterial: string; interviewDetails: string };
}) => {
  const input = z
    .object({
      token: z.string(),
      stage: z.string().min(1),
      prepMaterial: z.string().max(20000),
      interviewDetails: z.string().max(20000),
    })
    .parse(data);
  return call<{ ok: true }>("saveStageContent", input);
};

export const getCandidatePortal = ({ data }: { data: { token: string } }) => {
  const input = z.object({ token: z.string() }).parse(data);
  return call<CandidatePortalData | null>("loadCandidatePortal", input);
};

export const candidateRequestSlot = ({ data }: { data: { token: string; slot: string } }) => {
  const input = z.object({ token: z.string(), slot: z.string().min(1) }).parse(data);
  return call<{ ok: true }>("requestSlot", input);
};
