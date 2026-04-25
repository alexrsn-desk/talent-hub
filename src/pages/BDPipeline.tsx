import { useState } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useClients, useUpdateClient, useDeleteClient, useCreateClient, useContacts, useCreateContact, useDeleteContact, type Client, type Contact } from "@/hooks/use-data";
import { NotesSection } from "@/components/NotesSection";
import { BDTipsButton } from "@/components/BDTipsPanel";
import { Calendar as CalendarIcon, AlertTriangle, Plus, Trash2, ExternalLink, Users, CalendarPlus, Info } from "lucide-react";

const BD_STAGES = [
  "Target",
  "Contacted",
  "Conversation Started",
  "Meeting Booked",
  "Terms Sent",
  "Active Client",
] as const;

const stageColor: Record<string, string> = {
  Target: "border-purple-500/40",
  Contacted: "border-blue-500/40",
  "Conversation Started": "border-orange-500/40",
  "Meeting Booked": "border-yellow-500/40",
  "Terms Sent": "border-cyan-500/40",
  "Active Client": "border-green-500/40",
};

const stageHeaderColor: Record<string, string> = {
  Target: "text-purple-400",
  Contacted: "text-blue-400",
  "Conversation Started": "text-orange-400",
  "Meeting Booked": "text-yellow-400",
  "Terms Sent": "text-cyan-400",
  "Active Client": "text-green-400",
};

function isOverdue(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date(new Date().toISOString().split("T")[0]);
}

function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function formatRelative(date: string | null | undefined): string {
  if (!date) return "—";
  const today = new Date(new Date().toISOString().split("T")[0]);
  const d = new Date(date);
  const diffDays = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays > 0) return `${diffDays} days ago`;
  if (diffDays === -1) return "tomorrow";
  return `in ${Math.abs(diffDays)} days`;
}

function buildCalendarUrl(title: string, date: string, companyName: string): string {
  const d = date.replace(/-/g, "");
  const text = encodeURIComponent(`${title} – ${companyName}`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${d}/${d}&details=${encodeURIComponent(`BD action for ${companyName}`)}`;
}

const HEAT_OPTIONS = [
  { value: "hot", icon: "🔥", label: "Hot" },
  { value: "warm", icon: "〰", label: "Warm" },
  { value: "cold", icon: "❄", label: "Cold" },
] as const;

function heatIcon(heat: string | null | undefined): string {
  const h = (heat || "warm").toLowerCase();
  return HEAT_OPTIONS.find((o) => o.value === h)?.icon || "〰";
}

function heatLabel(heat: string | null | undefined): string {
  const h = (heat || "warm").toLowerCase();
  return HEAT_OPTIONS.find((o) => o.value === h)?.label || "Warm";
}

export default function BDPipelinePage() {
  const { data: clients = [], isLoading } = useClients();
  const { data: allContacts = [] } = useContacts();
  const updateClient = useUpdateClient();
  const deleteClient = useDeleteClient();
  const createClient = useCreateClient();
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [addingToStage, setAddingToStage] = useState<string | null>(null);

  const contactsByClient = allContacts.reduce<Record<string, Contact[]>>((acc, c) => {
    (acc[c.client_id] ||= []).push(c);
    return acc;
  }, {});

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const newStage = result.destination.droppableId;
    const clientId = result.draggableId;
    if (newStage === result.source.droppableId) return;
    updateClient.mutate({
      id: clientId,
      status: newStage,
      last_activity_date: new Date().toISOString().split("T")[0],
    });
  };

  const handleQuickAdd = async (e: React.FormEvent<HTMLFormElement>, stage: string) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await createClient.mutateAsync({
      company_name: fd.get("company_name") as string,
      contact_name: (fd.get("contact_name") as string) || null,
      status: stage,
      last_activity_date: new Date().toISOString().split("T")[0],
      next_action: null,
      next_action_due_date: null,
      job_title: null,
      email: null,
      phone: null,
      linkedin_url: null,
      sector: "Tech",
      location: null,
      website: null,
    });
    setAddingToStage(null);
  };

  return (
    <div className="space-y-6 h-full">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">BD Pipeline</h1>
        <BDTipsButton />
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading...</div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4 h-[calc(100vh-180px)] snap-x snap-mandatory sm:snap-none">
            {BD_STAGES.map((stage) => {
              const stageClients = clients.filter((c) => c.status === stage);
              return (
                <div key={stage} className="flex-shrink-0 w-[240px] sm:w-[260px] snap-start flex flex-col">
                  <div className="flex items-center justify-between px-3 py-2 mb-2">
                    <div className="flex items-center gap-2">
                      <h3 className={`text-xs font-semibold uppercase tracking-wider ${stageHeaderColor[stage]}`}>
                        {stage}
                      </h3>
                      <span className="text-xs text-muted-foreground">{stageClients.length}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setAddingToStage(addingToStage === stage ? null : stage)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>

                  {addingToStage === stage && (
                    <form onSubmit={(e) => handleQuickAdd(e, stage)} className="mx-1 mb-2 rounded-lg border border-border bg-card p-3 space-y-2">
                      <Input name="company_name" placeholder="Company name" required autoFocus className="h-8 text-xs" />
                      <Input name="contact_name" placeholder="Contact name" className="h-8 text-xs" />
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" className="h-7 text-xs flex-1">Add</Button>
                        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAddingToStage(null)}>Cancel</Button>
                      </div>
                    </form>
                  )}

                  <Droppable droppableId={stage}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 rounded-lg border border-border/50 p-1 space-y-1 overflow-y-auto transition-colors ${
                          snapshot.isDraggingOver ? "bg-muted/30 border-primary/30" : "bg-transparent"
                        }`}
                      >
                        {stageClients.map((client, index) => (
                          <Draggable key={client.id} draggableId={client.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`rounded-lg border bg-card p-3 cursor-grab active:cursor-grabbing transition-shadow ${
                                  stageColor[stage]
                                } ${
                                  snapshot.isDragging ? "shadow-lg shadow-primary/10" : ""
                                } ${
                                  isOverdue(client.next_action_due_date) ? "ring-1 ring-warning/50" : ""
                                }`}
                                onClick={() => {
                                  setSelectedClient(client);
                                  setDetailOpen(true);
                                }}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-sm font-semibold leading-tight flex-1">{client.company_name}</p>
                                  <span
                                    className="text-sm leading-none flex-shrink-0 opacity-80"
                                    title={`Heat: ${heatLabel(client.heat)}`}
                                    aria-label={`Heat: ${heatLabel(client.heat)}`}
                                  >
                                    {heatIcon(client.heat)}
                                  </span>
                                </div>

                                {(contactsByClient[client.id]?.length > 0 || client.contact_name) && (
                                  <div className="mt-0.5">
                                    {contactsByClient[client.id]?.length > 0 ? (
                                      contactsByClient[client.id].map((contact) => (
                                        <p key={contact.id} className="text-xs text-muted-foreground">
                                          {contact.name}
                                        </p>
                                      ))
                                    ) : client.contact_name ? (
                                      <p className="text-xs text-muted-foreground">{client.contact_name}</p>
                                    ) : null}
                                  </div>
                                )}

                                <div className="mt-2 space-y-0.5">
                                  <p className="text-xs text-muted-foreground">
                                    Last: {client.last_activity_date ? formatRelative(client.last_activity_date) : "—"}
                                  </p>
                                  {client.next_action && (
                                    <p className="text-xs text-muted-foreground truncate">
                                      Next: {client.next_action}
                                      {client.next_action_due_date ? ` — ${formatDate(client.next_action_due_date)}` : ""}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      )}

      {/* Detail dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto">
          {selectedClient && (
            <ClientDetailView
              client={selectedClient}
              onUpdate={async (updates) => {
                await updateClient.mutateAsync({ id: selectedClient.id, ...updates });
                setSelectedClient({ ...selectedClient, ...updates });
              }}
              onDelete={async () => {
                await deleteClient.mutateAsync(selectedClient.id);
                setDetailOpen(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClientDetailView({ client, onUpdate, onDelete }: {
  client: Client;
  onUpdate: (updates: Partial<Client>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [nextAction, setNextAction] = useState(client.next_action || "");
  const [dueDate, setDueDate] = useState(client.next_action_due_date || "");
  const [followupDate, setFollowupDate] = useState(client.next_followup_date || "");
  const [followupSaved, setFollowupSaved] = useState(false);
  const [heat, setHeat] = useState((client.heat || "warm").toLowerCase());
  const [heatSaved, setHeatSaved] = useState(false);
  const { data: contacts = [] } = useContacts(client.id);
  const createContact = useCreateContact();
  const deleteContact = useDeleteContact();
  const [addingContact, setAddingContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactTitle, setNewContactTitle] = useState("");

  const saveNextAction = async () => {
    await onUpdate({
      next_action: nextAction || null,
      next_action_due_date: dueDate || null,
      last_activity_date: new Date().toISOString().split("T")[0],
    });
  };

  const saveFollowupDate = async (value: string) => {
    setFollowupDate(value);
    await onUpdate({ next_followup_date: value || null });
    setFollowupSaved(true);
    setTimeout(() => setFollowupSaved(false), 2000);
  };

  const saveHeat = async (value: string) => {
    setHeat(value);
    await onUpdate({ heat: value });
    setHeatSaved(true);
    setTimeout(() => setHeatSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{client.company_name}</h2>
          <p className="text-muted-foreground">
            {client.contact_name || "No contact"} {client.job_title ? `· ${client.job_title}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Select
            defaultValue={client.status}
            onValueChange={(v) => onUpdate({ status: v, last_activity_date: new Date().toISOString().split("T")[0] })}
          >
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BD_STAGES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm">
        <div><span className="text-muted-foreground">Email:</span> {client.email || "—"}</div>
        <div><span className="text-muted-foreground">Phone:</span> {client.phone || "—"}</div>
        <div><span className="text-muted-foreground">Sector:</span> {client.sector || "—"}</div>
        <div><span className="text-muted-foreground">Last Activity:</span> {formatDate(client.last_activity_date)}</div>
        {client.linkedin_url && (
          <div className="col-span-2">
            <a href={client.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
              <ExternalLink className="h-3 w-3" /> LinkedIn
            </a>
          </div>
        )}
      </div>

      {/* Heat */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-medium">Heat</h3>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="What does heat mean?"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="right" align="start" className="w-[300px] text-xs leading-relaxed space-y-3">
                <div>
                  <p className="font-semibold text-sm mb-1">HEAT — Your Professional Judgment</p>
                  <p className="text-muted-foreground">
                    Heat is your read on this opportunity — not automated. It captures things the AI cannot know:
                  </p>
                </div>
                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                  <li>The tone of the conversation.</li>
                  <li>How engaged they actually felt.</li>
                  <li>Whether they were genuine or just polite.</li>
                  <li>Your gut read on their hiring timeline.</li>
                  <li>The strength of your personal relationship.</li>
                  <li>What they said off the record.</li>
                  <li>Whether they would actually pick up your call.</li>
                </ul>
                <p className="text-muted-foreground">
                  Update heat after every conversation. Your gut feel after a call is more accurate than any algorithm. The AI coach uses your heat rating to prioritise BD recommendations.
                </p>
                <div className="space-y-2 border-t border-border pt-2">
                  <div>
                    <p className="font-medium">🔥 Hot</p>
                    <p className="text-muted-foreground">You believe they will hire soon. Based on what they said, how they said it, and your read on the relationship. Needs your attention this week.</p>
                  </div>
                  <div>
                    <p className="font-medium">〰 Warm</p>
                    <p className="text-muted-foreground">Positive signals but not confirmed. Good relationship, likely to hire but timeline is unclear. Stay in regular contact.</p>
                  </div>
                  <div>
                    <p className="font-medium">❄ Cold</p>
                    <p className="text-muted-foreground">Long timeline, vague interest, or early stage relationship. Worth nurturing but no urgency. Check in quarterly.</p>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          {heatSaved && (
            <span className="text-xs text-success">Saved ✓</span>
          )}
        </div>
        <div className="flex gap-2">
          {HEAT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => saveHeat(opt.value)}
              className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                heat === opt.value
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <span className="mr-1.5">{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Next Follow Up */}
      <div className="rounded-lg border border-border p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Next Follow Up</h3>
          {followupSaved && (
            <span className="text-xs text-success flex items-center gap-1">Saved ✓</span>
          )}
        </div>
        <Input
          type="date"
          value={followupDate}
          onChange={(e) => saveFollowupDate(e.target.value)}
          className="max-w-xs"
        />
        {isOverdue(followupDate) && (
          <div className="flex items-center gap-1 text-warning text-xs">
            <AlertTriangle className="h-3 w-3" />
            <span>Follow up overdue</span>
          </div>
        )}
      </div>

      {/* Next Action */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="text-sm font-medium">Next Action</h3>
        <div className="space-y-2">
          <Input
            placeholder="e.g. Follow up on proposal"
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
          />
          <div className="flex gap-2">
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="flex-1"
            />
            <Button size="sm" onClick={saveNextAction}>Save</Button>
            {nextAction && dueDate && (
              <a
                href={buildCalendarUrl(nextAction, dueDate, client.company_name)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                <Button type="button" size="sm" variant="outline" className="gap-1">
                  <CalendarPlus className="h-3.5 w-3.5" /> Calendar
                </Button>
              </a>
            )}
          </div>
          {isOverdue(client.next_action_due_date) && client.next_action && (
            <div className="flex items-center gap-1 text-warning text-xs">
              <AlertTriangle className="h-3 w-3" />
              <span>This action is overdue</span>
            </div>
          )}
        </div>
      </div>

      {/* Contacts */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium flex items-center gap-1.5">
            <Users className="h-4 w-4" /> Contacts ({contacts.length})
          </h3>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAddingContact(!addingContact)}>
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>

        {addingContact && (
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newContactName.trim()) return;
              const nameParts = newContactName.trim().split(" ");
              await createContact.mutateAsync({
                client_id: client.id,
                name: newContactName.trim(),
                first_name: nameParts[0] || null,
                last_name: nameParts.slice(1).join(" ") || null,
                job_title: newContactTitle.trim() || null,
                email: null,
                phone: null,
                linkedin_url: null,
              });
              setNewContactName("");
              setNewContactTitle("");
              setAddingContact(false);
            }}
          >
            <Input placeholder="Name" value={newContactName} onChange={(e) => setNewContactName(e.target.value)} className="h-8 text-xs" required autoFocus />
            <Input placeholder="Job title" value={newContactTitle} onChange={(e) => setNewContactTitle(e.target.value)} className="h-8 text-xs" />
            <Button type="submit" size="sm" className="h-8 text-xs">Add</Button>
          </form>
        )}

        {contacts.length > 0 ? (
          <div className="space-y-1">
            {contacts.map((contact) => (
              <div key={contact.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded bg-muted/30">
                <div>
                  <span className="font-medium">{contact.name}</span>
                  {contact.job_title && <span className="text-muted-foreground ml-1.5">· {contact.job_title}</span>}
                  {contact.email && <span className="text-muted-foreground ml-1.5 text-xs">· {contact.email}</span>}
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteContact.mutate(contact.id)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No contacts yet</p>
        )}
      </div>

      <NotesSection entityType="client" entityId={client.id} />
    </div>
  );
}
