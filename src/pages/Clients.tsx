import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search, ExternalLink, Trash2, PhoneCall, Phone } from "lucide-react";
import { useClients, useCreateClient, useUpdateClient, useDeleteClient, type Client } from "@/hooks/use-data";
import { NotesSection } from "@/components/NotesSection";
import { LogTouchpointModal } from "@/components/LogTouchpointModal";
import { ClientPortalInvite } from "@/components/ClientPortalInvite";
import { CallPrepButton } from "@/components/CallPrep";

const STATUSES = ["Target", "Contacted", "Conversation Started", "Meeting Booked", "Terms Sent", "Active Client"] as const;

const statusColor: Record<string, string> = {
  Target: "bg-purple-500/20 text-purple-400",
  Contacted: "bg-blue-500/20 text-blue-400",
  "Conversation Started": "bg-orange-500/20 text-orange-400",
  "Meeting Booked": "bg-yellow-500/20 text-yellow-400",
  "Terms Sent": "bg-cyan-500/20 text-cyan-400",
  "Active Client": "bg-success/20 text-green-400",
};

export default function ClientsPage() {
  const { data: clients = [], isLoading } = useClients();
  const createClient = useCreateClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const updateClient = useUpdateClient();
  const deleteClient = useDeleteClient();

  const filtered = clients.filter((c) => {
    const matchesSearch = c.company_name.toLowerCase().includes(search.toLowerCase()) ||
      (c.contact_name || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await createClient.mutateAsync({
      company_name: fd.get("company_name") as string,
      contact_name: (fd.get("contact_name") as string) || null,
      job_title: (fd.get("job_title") as string) || null,
      email: (fd.get("email") as string) || null,
      phone: (fd.get("phone") as string) || null,
      linkedin_url: (fd.get("linkedin_url") as string) || null,
      sector: (fd.get("sector") as string) || "Tech",
      status: (fd.get("status") as string) || "Target",
      last_activity_date: new Date().toISOString().split("T")[0],
      next_action: null,
      next_action_due_date: null,
    });
    setDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1 h-4 w-4" />Add Client</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>New Client</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div><Label>Company Name *</Label><Input name="company_name" required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Contact Name</Label><Input name="contact_name" /></div>
                <div><Label>Job Title</Label><Input name="job_title" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Email</Label><Input name="email" type="email" /></div>
                <div><Label>Phone</Label><Input name="phone" /></div>
              </div>
              <div><Label>LinkedIn URL</Label><Input name="linkedin_url" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Sector</Label>
                  <select name="sector" defaultValue="Tech" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option>Tech</option><option>Digital</option>
                  </select>
                </div>
                <div>
                  <Label>Status</Label>
                  <select name="status" defaultValue="Target" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={createClient.isPending}>
                {createClient.isPending ? "Creating..." : "Create Client"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search clients..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading...</div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Company</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contact</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Sector</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No clients found</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} className="border-b border-border hover:bg-muted/20 cursor-pointer transition-colors" onClick={() => { setSelectedClient(c); setDetailOpen(true); }}>
                  <td className="px-4 py-3 font-medium">{c.company_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.contact_name || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.email || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.sector || "—"}</td>
                  <td className="px-4 py-3"><Badge variant="secondary" className={statusColor[c.status]}>{c.status}</Badge></td>
                  <td className="px-4 py-3">
                    {c.linkedin_url && (
                      <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                        <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-primary" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedClient && (
            <ClientDetail
              client={selectedClient}
              onUpdate={(updates) => { updateClient.mutate({ id: selectedClient.id, ...updates }); setSelectedClient({ ...selectedClient, ...updates }); }}
              onDelete={async () => { await deleteClient.mutateAsync(selectedClient.id); setDetailOpen(false); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClientDetail({ client, onUpdate, onDelete }: {
  client: Client;
  onUpdate: (updates: Partial<Client>) => void;
  onDelete: () => Promise<void>;
}) {
  const [touchpointOpen, setTouchpointOpen] = useState(false);
  const STATUSES = ["Target", "Contacted", "Conversation Started", "Meeting Booked", "Terms Sent", "Active Client"] as const;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">{client.company_name}</h2>
          <p className="text-muted-foreground">{client.contact_name || ""} {client.job_title ? `· ${client.job_title}` : ""}</p>
        </div>
        <div className="flex gap-2 items-start flex-wrap">
          {client.phone && (
            <a href={`tel:${client.phone}`}>
              <Button size="sm" variant="default" className="gap-1.5">
                <Phone className="h-3.5 w-3.5" /> Call Now
              </Button>
            </a>
          )}
          <CallPrepButton entityType="client" entityId={client.id} entityName={client.company_name} />
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setTouchpointOpen(true)}>
            <PhoneCall className="h-3.5 w-3.5" /> Log Touchpoint
          </Button>
          <Select defaultValue={client.status} onValueChange={(v) => onUpdate({ status: v })}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div><span className="text-muted-foreground">Email:</span> {client.email || "—"}</div>
        <div><span className="text-muted-foreground">Phone:</span> {client.phone || "—"}</div>
        <div><span className="text-muted-foreground">Sector:</span> {client.sector || "—"}</div>
        {client.linkedin_url && (
          <div>
            <a href={client.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
              <ExternalLink className="h-3 w-3" /> LinkedIn
            </a>
          </div>
        )}
      </div>
      <ClientPortalInvite clientId={client.id} />
      <NotesSection entityType="client" entityId={client.id} />
      <LogTouchpointModal
        open={touchpointOpen}
        onOpenChange={setTouchpointOpen}
        entityType="client"
        entityId={client.id}
        entityName={client.company_name}
      />
    </div>
  );
}
