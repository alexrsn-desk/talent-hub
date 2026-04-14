import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search, Trash2 } from "lucide-react";
import { useClients, useCreateClient, useUpdateClient, useDeleteClient, type Client } from "@/hooks/use-data";
import { NotesSection } from "@/components/NotesSection";

const BD_STAGES = ["Target", "Cold", "Warm", "Active"] as const;

const stageColor: Record<string, string> = {
  Target: "bg-purple-500/20 text-purple-400",
  Cold: "bg-blue-500/20 text-blue-400",
  Warm: "bg-orange-500/20 text-orange-400",
  Active: "bg-success/20 text-green-400",
};

export default function BDPipelinePage() {
  const { data: clients = [], isLoading } = useClients();
  const updateClient = useUpdateClient();

  // Group clients by status for pipeline view
  const pipeline = BD_STAGES.map(stage => ({
    stage,
    clients: clients.filter(c => c.status === stage),
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">BD Pipeline</h1>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {pipeline.map(({ stage, clients: stageClients }) => (
            <div key={stage} className="rounded-lg border border-border bg-card">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-medium">{stage}</h3>
                <Badge variant="secondary" className={stageColor[stage]}>{stageClients.length}</Badge>
              </div>
              <div className="p-2 space-y-2 min-h-[200px]">
                {stageClients.map(client => (
                  <div key={client.id} className="rounded-md bg-muted/30 p-3 text-sm space-y-1">
                    <p className="font-medium">{client.company_name}</p>
                    {client.contact_name && <p className="text-muted-foreground text-xs">{client.contact_name}</p>}
                    {client.sector && <p className="text-muted-foreground text-xs">{client.sector}</p>}
                    <Select defaultValue={client.status} onValueChange={(v) => updateClient.mutate({ id: client.id, status: v })}>
                      <SelectTrigger className="w-full h-7 text-xs mt-2"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {BD_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                {stageClients.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">No clients</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
