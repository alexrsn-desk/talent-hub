import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search, ExternalLink, ArrowLeft, Trash2, PhoneCall } from "lucide-react";
import { useContacts, useCreateContact, useDeleteContact, useClients, useCreateNote, type Contact, type Client } from "@/hooks/use-data";
import { Textarea } from "@/components/ui/textarea";
import { ProfileTabs } from "@/components/ProfileTabs";
import { LogTouchpointModal } from "@/components/LogTouchpointModal";
import { CallPrepButton } from "@/components/CallPrep";
import { ClickToEditField } from "@/components/ClickToEditField";
import { SummaryField } from "@/components/SummaryField";
import { ConversationPrompts } from "@/components/ConversationPrompts";
import { ReengageBadge, ReengageInlineEditor, formatReengageDate } from "@/components/ReengageDate";
import { AddToSequencePanel } from "@/components/AddToSequencePanel";
import { ActiveSequencesSection } from "@/components/ActiveSequencesSection";
import { GitBranch } from "lucide-react";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const CONTACT_STATUSES = ["Active", "Warm", "Cold", "Left Company"] as const;

const statusColor: Record<string, string> = {
  Active: "bg-success/20 text-green-400",
  Warm: "bg-orange-500/20 text-orange-400",
  Cold: "bg-blue-500/20 text-blue-400",
  "Left Company": "bg-red-500/20 text-red-400",
};

export default function ContactsPage() {
  const { data: contacts = [], isLoading } = useContacts();
  const { data: clients = [] } = useClients();
  const createContact = useCreateContact();
  const createNote = useCreateNote();
  const deleteContact = useDeleteContact();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const clientMap = clients.reduce<Record<string, Client>>((acc, c) => {
    acc[c.id] = c;
    return acc;
  }, {});

  const filtered = contacts.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.job_title || "").toLowerCase().includes(search.toLowerCase()) ||
      (clientMap[c.client_id]?.company_name || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("first_name") as string).trim() + " " + (fd.get("last_name") as string).trim();
    const clientId = fd.get("client_id") as string;
    if (!clientId) {
      toast.error("Every contact must be linked to a company");
      return;
    }
    await createContact.mutateAsync({
      client_id: clientId,
      name: name.trim(),
      first_name: (fd.get("first_name") as string).trim() || null,
      last_name: (fd.get("last_name") as string).trim() || null,
      job_title: (fd.get("job_title") as string) || null,
      email: (fd.get("email") as string) || null,
      phone: (fd.get("phone") as string) || null,
      linkedin_url: (fd.get("linkedin_url") as string) || null,
      status: (fd.get("status") as string) || "Active",
    });
    const notes = (fd.get("notes") as string || "").trim();
    if (notes && clientId) {
      const dateStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      await createNote.mutateAsync({
        client_id: clientId,
        content: `Added on creation — ${dateStr}\n\n${notes}`,
        activity_type: "Note",
      });
    }
    setDialogOpen(false);
  };

  if (selectedContact) {
    return (
      <ContactFullView
        contact={selectedContact}
        client={clientMap[selectedContact.client_id] || null}
        onBack={() => setSelectedContact(null)}
        onDelete={async () => {
          await deleteContact.mutateAsync(selectedContact.id);
          setSelectedContact(null);
        }}
        onContactUpdate={(updated) => setSelectedContact(updated)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1 h-4 w-4" />Add Contact</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>New Contact</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>First Name *</Label><Input name="first_name" required /></div>
                <div><Label>Last Name *</Label><Input name="last_name" required /></div>
              </div>
              <div>
                <Label>Company *</Label>
                <select name="client_id" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Select a company...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
              </div>
              <div><Label>Job Title</Label><Input name="job_title" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Email</Label><Input name="email" type="email" /></div>
                <div><Label>Phone</Label><Input name="phone" /></div>
              </div>
              <div><Label>LinkedIn URL</Label><Input name="linkedin_url" /></div>
              <div>
                <Label>Notes</Label>
                <Textarea name="notes" placeholder="Add any notes about this contact — how you know them, first impressions..." className="min-h-[80px]" />
              </div>
              <div>
                <Label>Status</Label>
                <select name="status" defaultValue="Active" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {CONTACT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <Button type="submit" className="w-full" disabled={createContact.isPending}>
                {createContact.isPending ? "Creating..." : "Create Contact"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search contacts..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {CONTACT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Job Title</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Company</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No contacts found</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} className="border-b border-border hover:bg-muted/20 cursor-pointer transition-colors" onClick={() => setSelectedContact(c)}>
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.job_title || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{clientMap[c.client_id]?.company_name || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.email || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="secondary" className={statusColor[c.status] || ""}>{c.status}</Badge>
                      {c.status === "Cold" && c.reengage_date && <ReengageBadge date={c.reengage_date} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ContactFullView({ contact, client, onBack, onDelete, onContactUpdate, backLabel }: {
  contact: Contact;
  client: Client | null;
  onBack: () => void;
  onDelete: () => Promise<void>;
  onContactUpdate: (updated: Contact) => void;
  backLabel?: string;
}) {
  const [touchpointOpen, setTouchpointOpen] = useState(false);

  const handleFieldSave = async (field: string, value: string) => {
    const updates: any = { [field]: value || null };
    if (field === "name") {
      const parts = value.trim().split(/\s+/);
      updates.first_name = parts[0];
      updates.last_name = parts.slice(1).join(" ") || null;
    }
    // Clear re-engage data when status leaves Cold
    if (field === "status" && contact.status === "Cold" && value !== "Cold") {
      updates.reengage_date = null;
      updates.reengage_reason = null;
    }
    await supabase.from("contacts").update(updates).eq("id", contact.id);
    onContactUpdate({ ...contact, ...updates });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <ArrowLeft className="h-4 w-4" />
          {backLabel ? <span className="text-sm">Back to {backLabel}</span> : null}
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{contact.name}</h1>
          <p className="text-xs text-muted-foreground">
            {contact.job_title || ""}
            {client ? ` at ${client.company_name}` : ""}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {contact.phone && (
            <a href={`tel:${contact.phone}`}>
              <Button size="sm" variant="default" className="gap-1.5">
                <PhoneCall className="h-3.5 w-3.5" /> Call
              </Button>
            </a>
          )}
          <CallPrepButton entityType="client" entityId={contact.client_id} entityName={contact.name} />
          <Button size="sm" variant="outline" onClick={() => setTouchpointOpen(true)}>
            <PhoneCall className="h-3.5 w-3.5 mr-1" /> Log Touchpoint
          </Button>
          <AddToSequencePanel
            entityType="contact"
            entityId={contact.id}
            entityName={contact.name}
            trigger={
              <Button size="sm" variant="outline" className="gap-1.5">
                <GitBranch className="h-3.5 w-3.5" /> Add to Sequence
              </Button>
            }
          />
          <Badge variant="secondary" className={statusColor[contact.status] || ""}>{contact.status}</Badge>
          {contact.status === "Cold" && contact.reengage_date && <ReengageBadge date={contact.reengage_date} />}
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      <ActiveSequencesSection entityType="contact" entityId={contact.id} entityName={contact.name} />

      {/* Cold Re-engage Banner */}
      {contact.status === "Cold" && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 text-sm text-amber-500">
            <CalendarClock className="h-4 w-4 shrink-0" />
            <span className="font-medium">
              Cold — {contact.reengage_date ? `re-engage ${formatReengageDate(contact.reengage_date)}` : "no re-engage date set"}
            </span>
          </div>
          {contact.reengage_reason && (
            <p className="text-xs text-amber-500/80 pl-6">{contact.reengage_reason}</p>
          )}
          <ReengageInlineEditor
            date={contact.reengage_date}
            reason={contact.reengage_reason}
            onSave={async (date, reason) => {
              await supabase.from("contacts").update({ reengage_date: date, reengage_reason: reason }).eq("id", contact.id);
              onContactUpdate({ ...contact, reengage_date: date, reengage_reason: reason } as any);
              toast.success(date ? "Re-engage date saved" : "Re-engage cleared");
            }}
          />
        </div>
      )}

      {/* Contact info — click to edit */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm rounded-lg border border-border p-4">
        <div>
          <span className="text-muted-foreground block text-xs mb-0.5">Company</span>
          {client ? (
            <button className="text-primary hover:underline text-left text-sm" onClick={onBack}>
              {client.company_name}
            </button>
          ) : "—"}
        </div>
        <ClickToEditField label="Job Title" value={contact.job_title || ""} field="job_title" layout="stacked" onSave={(v) => handleFieldSave("job_title", v)} entityType="contact" entityId={contact.id} />
        <ClickToEditField label="Email" value={contact.email || ""} field="email" type="email" layout="stacked" onSave={(v) => handleFieldSave("email", v)} entityType="contact" entityId={contact.id} />
        <ClickToEditField label="Phone" value={contact.phone || ""} field="phone" layout="stacked" onSave={(v) => handleFieldSave("phone", v)} entityType="contact" entityId={contact.id} />
        <ClickToEditField label="Personal Email" value={contact.personal_email || ""} field="personal_email" type="email" layout="stacked" onSave={(v) => handleFieldSave("personal_email", v)} entityType="contact" entityId={contact.id} />
        <ClickToEditField label="Mobile" value={contact.mobile_phone || ""} field="mobile_phone" layout="stacked" onSave={(v) => handleFieldSave("mobile_phone", v)} entityType="contact" entityId={contact.id} />
        <ClickToEditField label="Direct Dial" value={contact.direct_phone || ""} field="direct_phone" layout="stacked" onSave={(v) => handleFieldSave("direct_phone", v)} entityType="contact" entityId={contact.id} />
        <ClickToEditField label="Status" value={contact.status} field="status" options={CONTACT_STATUSES} layout="stacked" onSave={(v) => handleFieldSave("status", v)} entityType="contact" entityId={contact.id} />
        {contact.linkedin_url ? (
          <div>
            <span className="text-muted-foreground block text-xs">LinkedIn</span>
            <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 text-sm">
              <ExternalLink className="h-3 w-3" /> Profile
            </a>
          </div>
        ) : (
          <ClickToEditField label="LinkedIn" value="" field="linkedin_url" layout="stacked" onSave={(v) => handleFieldSave("linkedin_url", v)} entityType="contact" entityId={contact.id} />
        )}
      </div>

      <SummaryField
        label="Summary"
        storageKey={`contact:${contact.id}`}
        value={contact.summary || ""}
        placeholder="Add an overview of this contact — their role, what they care about, and how you work together."
        onSave={async (next) => {
          await supabase.from("contacts").update({ summary: next || null }).eq("id", contact.id);
          onContactUpdate({ ...contact, summary: next || null });
        }}
      />

      <ConversationPrompts entityType="contact" entityId={contact.id} />

      <ProfileTabs entityType="client" entityId={contact.client_id} />

      <LogTouchpointModal
        open={touchpointOpen}
        onOpenChange={setTouchpointOpen}
        entityType="client"
        entityId={contact.client_id}
        entityName={contact.name}
      />
    </div>
  );
}
