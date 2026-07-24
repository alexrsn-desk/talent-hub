import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Plus, Inbox } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useBuckets, useCreateBucket } from "@/hooks/use-buckets";

interface Props {
  /** Controlled selected bucket IDs. */
  value: string[];
  /** Called with the new set of bucket IDs. */
  onChange: (ids: string[]) => void;
  label?: string;
  placeholder?: string;
  compact?: boolean;
}

/**
 * Staged bucket picker — works before the entity exists.
 * Just picks bucket IDs; caller applies them after save via useAddToBuckets.
 */
export function BucketSelector({
  value,
  onChange,
  label = "Buckets",
  placeholder = "Add to bucket…",
  compact,
}: Props) {
  const { data: buckets = [], isLoading } = useBuckets();
  const createBucket = useCreateBucket();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const selectedSet = useMemo(() => new Set(value), [value]);
  const filtered = useMemo(
    () => buckets.filter((b) => b.name.toLowerCase().includes(search.toLowerCase())),
    [buckets, search]
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
      const b = await createBucket.mutateAsync({ name: newName.trim() });
      onChange([...value, b.id]);
      setNewName("");
      setCreating(false);
      setSearch("");
      toast.success(`Created "${b.name}"`);
    } catch (e: any) {
      toast.error(e?.message || "Could not create bucket");
    }
  };

  const selected = buckets.filter((b) => selectedSet.has(b.id));

  return (
    <div className="space-y-2">
      {!compact && (
        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Inbox className="h-3.5 w-3.5" /> {label}
        </Label>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-between h-auto min-h-9 py-1.5">
            <div className="flex flex-wrap gap-1 items-center">
              {selected.length === 0 ? (
                <span className="text-muted-foreground text-xs">{placeholder}</span>
              ) : (
                selected.map((b) => (
                  <Badge key={b.id} variant="secondary" className="text-[10px]">
                    {b.name}
                  </Badge>
                ))
              )}
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <div className="p-2 border-b border-border">
            <Input
              placeholder="Search buckets…"
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
              <div className="p-3 text-xs text-muted-foreground">No buckets. Create one below.</div>
            ) : (
              filtered.map((b) => {
                const isSel = selectedSet.has(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggle(b.id)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/40"
                  >
                    <Check className={`h-3.5 w-3.5 ${isSel ? "opacity-100 text-primary" : "opacity-0"}`} />
                    <span className="flex-1 text-left truncate">{b.name}</span>
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
                  placeholder="New bucket name"
                  className="h-7 text-xs"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
                <Button
                  size="sm"
                  className="h-7"
                  onClick={handleCreate}
                  disabled={!newName.trim() || createBucket.isPending}
                >
                  Add
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start h-7 text-xs"
                onClick={() => setCreating(true)}
              >
                <Plus className="h-3 w-3 mr-1" /> Create new bucket
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
