import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Archive, ArchiveRestore, Tags } from "lucide-react";
import { toast } from "sonner";
import {
  useTagDefinitions,
  useCreateTagDefinition,
  useUpdateTagDefinition,
  TAG_CATEGORIES,
} from "@/hooks/use-tags";

export function TagManagement() {
  const { data: definitions = [], isLoading } = useTagDefinitions();
  const createTag = useCreateTagDefinition();
  const updateTag = useUpdateTagDefinition();
  const [newLabels, setNewLabels] = useState<Record<string, string>>({});
  const [showArchived, setShowArchived] = useState(false);

  const categories = Object.keys(TAG_CATEGORIES);

  const handleAdd = async (category: string) => {
    const label = newLabels[category]?.trim();
    if (!label) return;
    const existing = definitions.find(
      (d) => d.category === category && d.label.toLowerCase() === label.toLowerCase()
    );
    if (existing) {
      toast.error("Tag already exists");
      return;
    }
    const maxPos = Math.max(0, ...definitions.filter((d) => d.category === category).map((d) => d.position));
    try {
      await createTag.mutateAsync({ category, label, position: maxPos + 1 });
      setNewLabels((prev) => ({ ...prev, [category]: "" }));
      toast.success(`Added "${label}"`);
    } catch {
      toast.error("Failed to add tag");
    }
  };

  const handleArchive = async (id: string, archived: boolean) => {
    await updateTag.mutateAsync({ id, archived });
    toast.success(archived ? "Tag archived" : "Tag restored");
  };

  if (isLoading) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tags className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-medium">Tag Management</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={() => setShowArchived(!showArchived)}
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Add, rename or archive tag options. Archiving removes from future use but keeps on existing records.
      </p>

      {categories.map((cat) => {
        const catDefs = definitions.filter(
          (d) => d.category === cat && (showArchived || !d.archived)
        );

        return (
          <div key={cat} className="space-y-2 border border-border rounded-lg p-3">
            <span className="text-xs font-medium text-muted-foreground">{TAG_CATEGORIES[cat]}</span>
            <div className="flex flex-wrap gap-1.5">
              {catDefs.map((d) => (
                <Badge
                  key={d.id}
                  variant={d.archived ? "outline" : "secondary"}
                  className="gap-1 pr-1 text-xs"
                >
                  {d.archived && <span className="opacity-50 line-through">{d.label}</span>}
                  {!d.archived && d.label}
                  <button
                    onClick={() => handleArchive(d.id, !d.archived)}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                    title={d.archived ? "Restore" : "Archive"}
                  >
                    {d.archived ? (
                      <ArchiveRestore className="h-2.5 w-2.5" />
                    ) : (
                      <Archive className="h-2.5 w-2.5" />
                    )}
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="New tag…"
                className="h-7 text-xs flex-1"
                value={newLabels[cat] || ""}
                onChange={(e) => setNewLabels((prev) => ({ ...prev, [cat]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && handleAdd(cat)}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2"
                onClick={() => handleAdd(cat)}
                disabled={!newLabels[cat]?.trim()}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
