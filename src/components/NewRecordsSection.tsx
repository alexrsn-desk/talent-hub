import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FilePlus2, ChevronDown, ChevronRight, Check } from "lucide-react";
import { useIncompleteRecords, markRecordComplete } from "@/hooks/use-quick-notes";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function NewRecordsSection() {
  const { data, refetch } = useIncompleteRecords();
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const total =
    (data?.candidates.length || 0) +
    (data?.clients.length || 0) +
    (data?.contacts.length || 0) +
    (data?.jobs.length || 0);

  if (total === 0) return null;

  const dismiss = async (table: "candidates" | "clients" | "contacts" | "jobs", id: string) => {
    await markRecordComplete(table, id);
    await Promise.all([
      refetch(),
      qc.invalidateQueries({ queryKey: [table] }),
    ]);
    toast.success("Marked complete");
  };

  const open = (table: string, id: string) => {
    if (table === "candidates") navigate(`/candidates?id=${id}`);
    else if (table === "clients") navigate(`/clients?id=${id}`);
    else if (table === "contacts") navigate(`/contacts?id=${id}`);
    else if (table === "jobs") navigate(`/jobs?id=${id}`);
  };

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex items-center gap-2 w-full text-left mb-3"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        <FilePlus2 className="h-4 w-4 text-amber-400" />
        <h2 className="text-sm font-medium">
          {total} record{total === 1 ? "" : "s"} added quickly — complete their profiles
        </h2>
      </button>
      {!collapsed && (
        <div className="space-y-2">
          {data?.candidates.map(c => (
            <Row key={c.id} label={c.name} sub={[c.job_title, c.current_employer].filter(Boolean).join(" · ") || "Candidate"}
              onOpen={() => open("candidates", c.id)} onDismiss={() => dismiss("candidates", c.id)} />
          ))}
          {data?.clients.map(c => (
            <Row key={c.id} label={c.company_name} sub={c.contact_name || c.sector || "Client"}
              onOpen={() => open("clients", c.id)} onDismiss={() => dismiss("clients", c.id)} />
          ))}
          {data?.contacts.map(c => (
            <Row key={c.id} label={c.name} sub={c.job_title || "Contact"}
              onOpen={() => open("contacts", c.id)} onDismiss={() => dismiss("contacts", c.id)} />
          ))}
          {data?.jobs.map(j => (
            <Row key={j.id} label={j.title} sub="Job"
              onOpen={() => open("jobs", j.id)} onDismiss={() => dismiss("jobs", j.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, sub, onOpen, onDismiss }: { label: string; sub: string; onOpen: () => void; onDismiss: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        <p className="text-xs text-muted-foreground truncate">{sub}</p>
      </div>
      <div className="flex gap-1 shrink-0">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onOpen}>Complete</Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onDismiss}>
          <Check className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
