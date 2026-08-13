import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { PortalAppShell } from "@/components/portal/PortalAppShell";
import { supabase } from "@/integrations/supabase/client";

export default function AgencyPortal() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [jobSpec, setJobSpec] = useState("");

  useEffect(() => {
    document.title = "Jobs — Agency Portal";
  }, []);

  const jobs = useQuery({
    queryKey: ["portal-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portal_jobs")
        .select("id, title, client_name, status, stages, created_at, portal_candidates(count)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createJob = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("portal_jobs")
        .insert({
          user_id: auth.user.id,
          title,
          client_name: clientName,
          job_spec: jobSpec,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: pErr } = await supabase
        .from("portal_client_portals")
        .insert({ job_id: data.id });
      if (pErr) throw pErr;
      return data;
    },
    onSuccess: () => {
      toast.success("Job created");
      setOpen(false);
      setTitle("");
      setClientName("");
      setJobSpec("");
      qc.invalidateQueries({ queryKey: ["portal-jobs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PortalAppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Jobs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every live search, its pipeline and its shareable portals.
          </p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="size-4" /> New job
        </button>
      </div>

      {open && (
        <form
          className="panel mt-6 space-y-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            createJob.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Job title</label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Senior Backend Engineer"
                className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Client name</label>
              <input
                required
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Northwind Ltd"
                className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Job spec</label>
            <textarea
              value={jobSpec}
              onChange={(e) => setJobSpec(e.target.value)}
              rows={5}
              placeholder="Role overview, responsibilities, requirements…"
              className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            disabled={createJob.isPending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            Create job
          </button>
        </form>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.data?.map((job) => (
          <Link
            key={job.id}
            to={`/agency-portal/${job.id}`}
            className="panel group p-5 transition-shadow hover:shadow-[var(--shadow-lift)]"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-accent">
              {job.client_name}
            </p>
            <h2 className="mt-1 text-lg font-semibold">{job.title}</h2>
            <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="size-4" />
              {job.portal_candidates?.[0]?.count ?? 0} candidates
            </p>
          </Link>
        ))}
        {jobs.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">No jobs yet. Create your first search.</p>
        )}
      </div>
    </PortalAppShell>
  );
}
