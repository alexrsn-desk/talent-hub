import { useState, useMemo, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, AlertTriangle } from "lucide-react";
import { useClients, useCreateClient, useCreateJob, useContacts, useCreateContact } from "@/hooks/use-data";
import { toast } from "sonner";

const JOB_TYPES = ["Perm", "Contract"] as const;

type NewClientData = {
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  contact_job_title: string;
};

export function AddJobDialog() {
  const { data: clients = [] } = useClients();
  const { data: allContacts = [] } = useContacts();
  const createJob = useCreateJob();
  const createClient = useCreateClient();
  const createContact = useCreateContact();

  const [open, setOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [isNewClient, setIsNewClient] = useState(false);
  const [newClient, setNewClient] = useState<NewClientData>({
    company_name: "", contact_name: "", contact_email: "", contact_phone: "", contact_job_title: "",
  });
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [saving, setSaving] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filtered clients for dropdown
  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients;
    return clients.filter(c =>
      c.company_name.toLowerCase().includes(clientSearch.toLowerCase())
    );
  }, [clients, clientSearch]);

  // Contacts for selected client
  const clientContacts = useMemo(() => {
    if (!selectedClientId) return [];
    return allContacts.filter(c => c.client_id === selectedClientId);
  }, [allContacts, selectedClientId]);

  // Selected client object
  const selectedClient = useMemo(() =>
    clients.find(c => c.id === selectedClientId) || null,
    [clients, selectedClientId]
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const resetForm = () => {
    setClientSearch("");
    setSelectedClientId(null);
    setSelectedContactId(null);
    setIsNewClient(false);
    setNewClient({ company_name: "", contact_name: "", contact_email: "", contact_phone: "", contact_job_title: "" });
    setDuplicateWarning(false);
    setShowDropdown(false);
  };

  const handleSelectClient = (id: string) => {
    setSelectedClientId(id);
    const client = clients.find(c => c.id === id);
    setClientSearch(client?.company_name || "");
    setIsNewClient(false);
    setDuplicateWarning(false);
    setShowDropdown(false);
  };

  const handleAddNewClient = () => {
    // Check for duplicate
    const existing = clients.find(c =>
      c.company_name.toLowerCase() === clientSearch.trim().toLowerCase()
    );
    if (existing) {
      setDuplicateWarning(true);
      setShowDropdown(false);
      return;
    }
    setIsNewClient(true);
    setSelectedClientId(null);
    setNewClient(prev => ({ ...prev, company_name: clientSearch.trim() }));
    setShowDropdown(false);
    setDuplicateWarning(false);
  };

  const handleLinkExisting = () => {
    const existing = clients.find(c =>
      c.company_name.toLowerCase() === clientSearch.trim().toLowerCase()
    );
    if (existing) handleSelectClient(existing.id);
    setDuplicateWarning(false);
  };

  const handleCreateNewAnyway = () => {
    setIsNewClient(true);
    setSelectedClientId(null);
    setNewClient(prev => ({ ...prev, company_name: clientSearch.trim() }));
    setDuplicateWarning(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);

    try {
      const fd = new FormData(e.currentTarget);
      let clientId: string | null = selectedClientId;

      // Create new client if needed
      if (isNewClient) {
        if (!newClient.company_name.trim() || !newClient.contact_name.trim()) {
          toast.error("Company name and contact name are required");
          setSaving(false);
          return;
        }

        const nameParts = newClient.contact_name.trim().split(" ");
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(" ") || null;

        const createdClient = await createClient.mutateAsync({
          company_name: newClient.company_name.trim(),
          contact_name: newClient.contact_name.trim(),
          email: newClient.contact_email.trim() || null,
          phone: newClient.contact_phone.trim() || null,
          job_title: newClient.contact_job_title.trim() || null,
          status: "Active",
          sector: null,
          linkedin_url: null,
          next_action: null,
          next_action_due_date: null,
          last_activity_date: new Date().toISOString().split("T")[0],
          location: null,
          website: null,
        });
        clientId = createdClient.id;

        // Also create a contact record
        await createContact.mutateAsync({
          client_id: createdClient.id,
          name: newClient.contact_name.trim(),
          first_name: firstName,
          last_name: lastName,
          email: newClient.contact_email.trim() || null,
          phone: newClient.contact_phone.trim() || null,
          job_title: newClient.contact_job_title.trim() || null,
          linkedin_url: null,
        });

        toast.success(`New client "${newClient.company_name}" created and linked`);
      }

      await createJob.mutateAsync({
        title: fd.get("title") as string,
        client_id: clientId,
        location: (fd.get("location") as string) || null,
        salary_min: fd.get("salary_min") ? Number(fd.get("salary_min")) : null,
        salary_max: fd.get("salary_max") ? Number(fd.get("salary_max")) : null,
        job_type: (fd.get("job_type") as string) || "Perm",
        status: "Open",
        fee_type: (fd.get("fee_type") as string) || "Percentage",
        fee_value: fd.get("fee_value") ? Number(fd.get("fee_value")) : null,
        date_opened: new Date().toISOString().split("T")[0],
      });

      resetForm();
      setOpen(false);
    } catch (err) {
      toast.error("Failed to create job");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-1 h-4 w-4" />Add Job</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New Job</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div><Label>Job Title *</Label><Input name="title" required /></div>

          {/* Client search field */}
          <div className="relative">
            <Label>Client</Label>
            <Input
              ref={inputRef}
              placeholder="Search or add new client..."
              value={clientSearch}
              onChange={(e) => {
                setClientSearch(e.target.value);
                setSelectedClientId(null);
                setIsNewClient(false);
                setDuplicateWarning(false);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
            />

            {/* Dropdown */}
            {showDropdown && clientSearch.trim() && (
              <div
                ref={dropdownRef}
                className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-48 overflow-y-auto"
              >
                {filteredClients.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors flex items-center justify-between"
                    onClick={() => handleSelectClient(c.id)}
                  >
                    <span>{c.company_name}</span>
                    {c.contact_name && (
                      <span className="text-xs text-muted-foreground">{c.contact_name}</span>
                    )}
                  </button>
                ))}
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-primary/10 transition-colors border-t border-border font-medium"
                  onClick={handleAddNewClient}
                >
                  <Plus className="inline h-3.5 w-3.5 mr-1" />
                  Add "{clientSearch.trim()}" as new client
                </button>
              </div>
            )}
          </div>

          {/* Duplicate warning */}
          {duplicateWarning && (
            <div className="rounded-md border border-warning/50 bg-warning/10 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <span>A client called "{clientSearch.trim()}" already exists.</span>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={handleLinkExisting}>
                  Link Existing
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={handleCreateNewAnyway}>
                  Create New
                </Button>
              </div>
            </div>
          )}

          {/* Selected existing client — show contact picker */}
          {selectedClientId && !isNewClient && (
            <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                Linked to: <span className="font-medium text-foreground">{selectedClient?.company_name}</span>
              </p>
              {clientContacts.length > 1 && (
                <div>
                  <Label className="text-xs">Contact</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={selectedContactId || ""}
                    onChange={(e) => setSelectedContactId(e.target.value || null)}
                  >
                    <option value="">Primary ({selectedClient?.contact_name || "—"})</option>
                    {clientContacts.map(c => (
                      <option key={c.id} value={c.id}>{c.name}{c.job_title ? ` — ${c.job_title}` : ""}</option>
                    ))}
                  </select>
                </div>
              )}
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => { setSelectedClientId(null); setClientSearch(""); }}
              >
                ✕ Remove client
              </button>
            </div>
          )}

          {/* New client inline fields */}
          {isNewClient && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
              <p className="text-xs font-medium text-primary">New client details</p>
              <div>
                <Label className="text-xs">Company Name *</Label>
                <Input
                  value={newClient.company_name}
                  onChange={(e) => setNewClient(prev => ({ ...prev, company_name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label className="text-xs">Contact Name *</Label>
                <Input
                  value={newClient.contact_name}
                  onChange={(e) => setNewClient(prev => ({ ...prev, contact_name: e.target.value }))}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input
                    type="email"
                    value={newClient.contact_email}
                    onChange={(e) => setNewClient(prev => ({ ...prev, contact_email: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input
                    value={newClient.contact_phone}
                    onChange={(e) => setNewClient(prev => ({ ...prev, contact_phone: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Job Title</Label>
                <Input
                  value={newClient.contact_job_title}
                  onChange={(e) => setNewClient(prev => ({ ...prev, contact_job_title: e.target.value }))}
                />
              </div>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => { setIsNewClient(false); setClientSearch(""); }}
              >
                ✕ Cancel new client
              </button>
            </div>
          )}

          <div><Label>Location</Label><Input name="location" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Salary Min</Label><Input name="salary_min" type="number" /></div>
            <div><Label>Salary Max</Label><Input name="salary_max" type="number" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Job Type</Label>
              <select name="job_type" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <Label>Fee Type</Label>
              <select name="fee_type" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="Percentage">Percentage</option>
                <option value="Flat">Flat Fee</option>
              </select>
            </div>
          </div>
          <div><Label>Fee Value</Label><Input name="fee_value" type="number" step="0.1" /></div>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Creating..." : "Create Job"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
