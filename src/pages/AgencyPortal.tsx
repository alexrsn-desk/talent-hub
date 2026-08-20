import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Plus, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { PortalAppShell } from "@/components/portal/PortalAppShell";
import { supabase } from "@/integrations/supabase/client";

const MIN_KEY = "portal-minimised-jobs";

function readMinimised(): string[] {
  try {
    const raw = localStorage.getItem(MIN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export default function AgencyPortal() {
  const qc = useQueryClient();
  const [minimised, setMinimised] = useState<string[]>(() => readMinimised());
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);

  const toggleMinimise = (id: string) => {
    setMinimised((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem(MIN_KEY, JSON.stringify(next));
      return next;
    });
  };
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

  const deleteJob = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("portal_jobs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Job deleted");
      setConfirmDelete(null);
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
        {jobs.data?.map((job) => {
          const isMin = minimised.includes(job.id);
          return (
            <div key={job.id} className="panel relative p-5 transition-shadow hover:shadow-[var(--shadow-lift)]">
              <div className="absolute right-3 top-3 flex items-center gap-1">
                <button
                  type="button"
                  aria-label={isMin ? "Expand job card" : "Minimise job card"}
                  onClick={() => toggleMinimise(job.id)}
                  className="rounded-md border border-border bg-card p-1.5 text-muted-foreground hover:bg-muted"
                >
                  {isMin ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
                </button>
                <button
                  type="button"
                  aria-label="Delete job"
                  onClick={() => setConfirmDelete({ id: job.id, title: job.title })}
                  className="rounded-md border border-border bg-card p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <Link to={`/agency-portal/${job.id}`} className="block pr-20">
                <p className="text-xs font-medium uppercase tracking-wide text-accent">
                  {job.client_name}
                </p>
                <h2 className="mt-1 text-lg font-semibold">{job.title}</h2>
                {!isMin && (
                  <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="size-4" />
                    {job.portal_candidates?.[0]?.count ?? 0} candidates
                  </p>
                )}
              </Link>
            </div>
          );
        })}
        {jobs.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">No jobs yet. Create your first search.</p>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="panel w-full max-w-md p-6">
            <h2 className="text-lg font-semibold">Delete {confirmDelete.title}?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure? This will delete all data associated with this.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="rounded-lg border border-input px-3 py-2 text-sm hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                disabled={deleteJob.isPending}
                onClick={() => deleteJob.mutate(confirmDelete.id)}
                className="rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-60"
              >
                {deleteJob.isPending ? "Deleting…" : "Delete everything"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalAppShell>
  );
}
