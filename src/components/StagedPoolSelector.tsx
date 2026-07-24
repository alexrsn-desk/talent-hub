import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Plus, Users } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { usePools, useCreatePool } from "@/hooks/use-talent-pools";

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
}

/** Talent-pool picker for the Quick-Add flow (candidate doesn't exist yet). */
export function StagedPoolSelector({ value, onChange }: Props) {
  const { data: pools = [], isLoading } = usePools();
  const createPool = useCreatePool();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const selectedSet = useMemo(() => new Set(value), [value]);
  const filtered = useMemo(
    () => pools.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())),
    [pools, search]
  );

  const toggle = (id: string) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const p = await createPool.mutateAsync({ name: newName.trim() });
      onChange([...value, p.id]);
      setNewName("");
      setCreating(false);
      setSearch("");
      toast.success(`Created "${p.name}"`);
    } catch (e: any) {
      toast.error(e?.message || "Could not create pool");
    }
  };

  const selected = pools.filter((p) => selectedSet.has(p.id));

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5" /> Talent Pools
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-between h-auto min-h-9 py-1.5">
            <div className="flex flex-wrap gap-1 items-center">
              {selected.length === 0 ? (
                <span className="text-muted-foreground text-xs">Add to pool…</span>
              ) : (
                selected.map((p) => (
                  <Badge key={p.id} variant="secondary" className="text-[10px]">{p.name}</Badge>
                ))
              )}
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <div className="p-2 border-b border-border">
            <Input
              placeholder="Search pools…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8"
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="p-3 text-xs text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 && !creating ? (
              <div className="p-3 text-xs text-muted-foreground">No pools. Create one below.</div>
            ) : (
              filtered.map((p) => {
                const isSel = selectedSet.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggle(p.id)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/40"
                  >
                    <Check className={`h-3.5 w-3.5 ${isSel ? "opacity-100 text-primary" : "opacity-0"}`} />
                    <span className="flex-1 text-left truncate">{p.name}</span>
                  </button>
                );
              })
            )}
          </div>
          <div className="border-t border-border p-2">
            {creating ? (
              <div className="flex gap-1">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="New pool name"
                  className="h-7 text-xs"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
                <Button size="sm" className="h-7" onClick={handleCreate} disabled={!newName.trim() || createPool.isPending}>
                  Add
                </Button>
              </div>
            ) : (
              <Button type="button" variant="ghost" size="sm" className="w-full justify-start h-7 text-xs" onClick={() => setCreating(true)}>
                <Plus className="h-3 w-3 mr-1" /> Create new pool
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
