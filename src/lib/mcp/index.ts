import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listCandidates from "./tools/list-candidates";
import listJobs from "./tools/list-jobs";
import listClients from "./tools/list-clients";
import createNote from "./tools/create-note";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "desky-mcp",
  title: "Desky CRM",
  version: "0.1.0",
  instructions:
    "Tools for the Desky recruitment CRM. Use list_candidates, list_jobs, and list_clients to read data on the signed-in recruiter's desk, and create_note to attach a note to a candidate, job, client, or contact.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listCandidates, listJobs, listClients, createNote],
});
