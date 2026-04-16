import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Search, ExternalLink, Trash2, PhoneCall, Globe, ArrowLeft } from "lucide-react";
import { useClients, useCreateClient, useUpdateClient, useDeleteClient, useContacts, useCreateContact, useCreateNote, useJobs, type Client, type Contact } from "@/hooks/use-data";
import { Textarea } from "@/components/ui/textarea";
import { NotesSection } from "@/components/NotesSection";
import { LogTouchpointModal } from "@/components/LogTouchpointModal";
import { ClientPortalInvite } from "@/components/ClientPortalInvite";
import { CallPrepButton } from "@/components/CallPrep";
import { ClickToEditField } from "@/components/ClickToEditField";
import { toast } from "sonner";

const STATUSES = ["Active", "Warm", "Cold", "Target"] as const;
const SECTORS = ["Tech", "Digital", "FinTech", "SaaS", "Other"] as const;

const statusColor: Record<string, string> = {
  Active: "bg-success/20 text-green-400",
  Warm: "bg-orange-500/20 text-orange-400",
  Cold: "bg-blue-500/20 text-blue-400",
  Target: "bg-purple-500/20 text-purple-400",
};

export default function ClientsPage() {
  const { data: clients = [], isLoading } = useClients();
  const { data: allContacts = [] } = useContacts();
  const { data: allJobs = [] } = useJobs();
  const createClient = useCreateClient();
  const createContact = useCreateContact();
  const createNote = useCreateNote();
  const updateClient = useUpdateClient();
  const deleteClient = useDeleteClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const [showContactPrompt, setShowContactPrompt] = useState(false);
  const [newClientId, setNewClientId] = useState<string | null>(null);
  const [newClientName, setNewClientName] = useState("");

  const filtered = clients.filter((c) => {
    const matchesSearch = c.company_name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const contactCountMap = allContacts.reduce<Record<string, number>>((acc, c) => {
    acc[c.client_id] = (acc[c.client_id] || 0) + 1;
    return acc;
  }, {});

  const openJobCountMap = allJobs
    .filter(j => j.status === "Open")
    .reduce<Record<string, number>>((acc, j) => {
      if (j.client_id) acc[j.client_id] = (acc[j.client_id] || 0) + 1;
      return acc;
    }, {});

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const companyName = fd.get("company_name") as string;
    const result = await createClient.mutateAsync({
      company_name: companyName,
      contact_name: null, job_title: null, email: null, phone: null,
      linkedin_url: (fd.get("linkedin_url") as string) || null,
      sector: (fd.get("sector") as string) || "Tech",
      status: (fd.get("status") as string) || "Target",
      location: (fd.get("location") as string) || null,
      website: (fd.get("website") as string) || null,
      last_activity_date: new Date().toISOString().split("T")[0],
      next_action: null, next_action_due_date: null,
    });
    const notes = (fd.get("notes") as string || "").trim();
    if (notes && result?.id) {
      const dateStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      await createNote.mutateAsync({
        client_id: result.id,
        content: `Added on creation — ${dateStr}\n\n${notes}`,
        activity_type: "Note",
      });
    }
    setDialogOpen(false);
    setNewClientId(result.id);
    setNewClientName(companyName);
    setShowContactPrompt(true);
  };

  const handleAddContactToNew = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newClientId) return;
    const fd = new FormData(e.currentTarget);
    const name = fd.get("contact_name") as string;
    const parts = name.trim().split(" ");
    await createContact.mutateAsync({
      client_id: newClientId, name: name.trim(),
      first_name: parts[0] || null, last_name: parts.slice(1).join(" ") || null,
      job_title: (fd.get("job_title") as string) || null,
      email: (fd.get("email") as string) || null,
      phone: (fd.get("phone") as string) || null,
      linkedin_url: null,
    });
    toast.success(`Contact added to ${newClientName}`);
    setShowContactPrompt(false);
    setNewClientId(null);
  };

  if (selectedClient) {
    return (
      <ClientFullView
        client={selectedClient}
        onBack={() => setSelectedClient(null)}
        onUpdate={async (updates) => {
          await updateClient.mutateAsync({ id: selectedClient.id, ...updates });
          setSelectedClient({ ...selectedClient, ...updates });
        }}
        onDelete={async () => {
          await deleteClient.mutateAsync(selectedClient.id);
          setSelectedClient(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1 h-4 w-4" />Add Client</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>New Client (Company)</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div><Label>Company Name *</Label><Input name="company_name" required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Sector</Label>
                  <select name="sector" defaultValue="Tech" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    {SECTORS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div><Label>Status</Label>
                  <select name="status" defaultValue="Target" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div><Label>Location</Label><Input name="location" placeholder="e.g. London, Remote" /></div>
              <div><Label>LinkedIn URL</Label><Input name="linkedin_url" /></div>
              <div><Label>Website</Label><Input name="website" placeholder="https://..." /></div>
              <div>
                <Label>Notes</Label>
                <Textarea name="notes" placeholder="Add any notes about this client — how you found them, key info, first impressions..." className="min-h-[80px]" />
              </div>
              <Button type="submit" className="w-full" disabled={createClient.isPending}>
                {createClient.isPending ? "Creating..." : "Create Client"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={showContactPrompt} onOpenChange={setShowContactPrompt}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add a contact at {newClientName}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">A client without a contact is hard to action.</p>
          <form onSubmit={handleAddContactToNew} className="space-y-3">
            <div><Label>Contact Name *</Label><Input name="contact_name" required /></div>
            <div><Label>Job Title</Label><Input name="job_title" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label><Input name="email" type="email" /></div>
              <div><Label>Phone</Label><Input name="phone" /></div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1">Add Contact</Button>
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowContactPrompt(false)}>Skip for now</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search companies..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
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
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contacts</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Open Jobs</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last Activity</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No clients found</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} className="border-b border-border hover:bg-muted/20 cursor-pointer transition-colors" onClick={() => setSelectedClient(c)}>
                  <td className="px-4 py-3">
                    <span className="font-medium">{c.company_name}</span>
                    {c.sector && <span className="text-xs text-muted-foreground ml-2">{c.sector}</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{contactCountMap[c.id] || 0}</td>
                  <td className="px-4 py-3 text-muted-foreground">{openJobCountMap[c.id] || 0}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.last_activity_date ? new Date(c.last_activity_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}
                  </td>
                  <td className="px-4 py-3"><Badge variant="secondary" className={statusColor[c.status] || ""}>{c.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ClientFullView({ client, onBack, onUpdate, onDelete }: {
  client: Client;
  onBack: () => void;
  onUpdate: (updates: Partial<Client>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { data: contacts = [] } = useContacts(client.id);
  const { data: allJobs = [] } = useJobs();
  const createContact = useCreateContact();
  const [touchpointOpen, setTouchpointOpen] = useState(false);
  const [addingContact, setAddingContact] = useState(false);

  const clientJobs = allJobs.filter(j => j.client_id === client.id);

  const handleFieldSave = async (field: string, value: string) => {
    await onUpdate({ [field]: value || null } as any);
  };

  const handleAddContact = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = fd.get("name") as string;
    const parts = name.trim().split(" ");
    await createContact.mutateAsync({
      client_id: client.id, name: name.trim(),
      first_name: parts[0] || null, last_name: parts.slice(1).join(" ") || null,
      job_title: (fd.get("job_title") as string) || null,
      email: (fd.get("email") as string) || null,
      phone: (fd.get("phone") as string) || null,
      linkedin_url: null,
    });
    setAddingContact(false);
    toast.success("Contact added");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{client.company_name}</h1>
          <p className="text-xs text-muted-foreground">
            {client.sector || ""}{client.location ? ` · ${client.location}` : ""}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <CallPrepButton entityType="client" entityId={client.id} entityName={client.company_name} />
          <Button size="sm" variant="outline" onClick={() => setTouchpointOpen(true)}>
            <PhoneCall className="h-3.5 w-3.5 mr-1" /> Log Touchpoint
          </Button>
          <Badge variant="secondary" className={statusColor[client.status] || ""}>{client.status}</Badge>
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      {/* Company info — click to edit */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm rounded-lg border border-border p-4">
        <ClickToEditField label="Company Name" value={client.company_name} field="company_name" layout="stacked" onSave={(v) => handleFieldSave("company_name", v)} entityType="client" entityId={client.id} />
        <ClickToEditField label="Sector" value={client.sector || ""} field="sector" options={SECTORS} layout="stacked" onSave={(v) => handleFieldSave("sector", v)} entityType="client" entityId={client.id} />
        <ClickToEditField label="Location" value={client.location || ""} field="location" layout="stacked" onSave={(v) => handleFieldSave("location", v)} entityType="client" entityId={client.id} />
        <ClickToEditField label="Status" value={client.status} field="status" options={STATUSES} layout="stacked" onSave={(v) => handleFieldSave("status", v)} entityType="client" entityId={client.id} />
        <div>
          <span className="text-muted-foreground block text-xs">LinkedIn</span>
          {client.linkedin_url ? (
            <a href={client.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 text-sm">
              <ExternalLink className="h-3 w-3" /> Profile
            </a>
          ) : (
            <ClickToEditField label="" value="" field="linkedin_url" layout="stacked" onSave={(v) => handleFieldSave("linkedin_url", v)} entityType="client" entityId={client.id} />
          )}
        </div>
        <div>
          <span className="text-muted-foreground block text-xs">Website</span>
          {client.website ? (
            <a href={client.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 text-sm">
              <Globe className="h-3 w-3" /> Visit
            </a>
          ) : (
            <ClickToEditField label="" value="" field="website" layout="stacked" onSave={(v) => handleFieldSave("website", v)} entityType="client" entityId={client.id} />
          )}
        </div>
      </div>

      <Tabs defaultValue="contacts">
        <TabsList>
          <TabsTrigger value="contacts">Contacts ({contacts.length})</TabsTrigger>
          <TabsTrigger value="jobs">Jobs ({clientJobs.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes & Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="contacts" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setAddingContact(!addingContact)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Contact
            </Button>
          </div>

          {addingContact && (
            <form onSubmit={handleAddContact} className="rounded-md border border-border p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Name *</Label><Input name="name" required /></div>
                <div><Label className="text-xs">Job Title</Label><Input name="job_title" /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Email</Label><Input name="email" type="email" /></div>
                <div><Label className="text-xs">Phone</Label><Input name="phone" /></div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm">Save</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setAddingContact(false)}>Cancel</Button>
              </div>
            </form>
          )}

          {contacts.length === 0 && !addingContact ? (
            <p className="text-sm text-muted-foreground py-4">No contacts yet. Add one to start tracking relationships.</p>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Job Title</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Email</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Phone</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map(ct => (
                    <tr key={ct.id} className="border-b border-border">
                      <td className="px-4 py-2 font-medium">{ct.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{ct.job_title || "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{ct.email || "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{ct.phone || "—"}</td>
                      <td className="px-4 py-2">
                        <Badge variant="secondary" className="text-xs">
                          {(ct as any).status || "Active"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="jobs" className="mt-4">
          {clientJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No jobs linked to this client.</p>
          ) : (
            <div className="space-y-2">
              {clientJobs.map(j => (
                <div key={j.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium">{j.title}</span>
                    <span className="text-muted-foreground ml-2">{j.job_type} · {j.location || "Remote"}</span>
                  </div>
                  <Badge variant="secondary" className={j.status === "Open" ? "bg-success/20 text-green-400" : ""}>{j.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <NotesSection entityType="client" entityId={client.id} />
        </TabsContent>
      </Tabs>

      <ClientPortalInvite clientId={client.id} />

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
