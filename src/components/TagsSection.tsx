import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, X, Wand2 } from "lucide-react";
import {
  useTagDefinitions,
  useCandidateTags,
  useAddCandidateTag,
  useRemoveCandidateTag,
  useJobTags,
  useAddJobTag,
  useRemoveJobTag,
  TAG_CATEGORIES,
  type TagDefinition,
} from "@/hooks/use-tags";

const MAX_TAGS_PER_CATEGORY = 3;

interface CandidateTagsSectionProps {
  entityType: "candidate";
  entityId: string;
}

interface JobTagsSectionProps {
  entityType: "job";
  entityId: string;
}

type TagsSectionProps = CandidateTagsSectionProps | JobTagsSectionProps;

export function TagsSection({ entityType, entityId }: TagsSectionProps) {
  const { data: definitions = [] } = useTagDefinitions();
  const candidateTags = useCandidateTags(entityType === "candidate" ? entityId : "");
  const jobTags = useJobTags(entityType === "job" ? entityId : "");
  const addCandidateTag = useAddCandidateTag();
  const removeCandidateTag = useRemoveCandidateTag();
  const addJobTag = useAddJobTag();
  const removeJobTag = useRemoveJobTag();

  const tags = entityType === "candidate" ? candidateTags.data || [] : jobTags.data || [];
  const tagDefIds = new Set(tags.map((t: any) => t.tag_definition_id));

  const activeDefinitions = definitions.filter((d) => !d.archived);
  const categories = Object.keys(TAG_CATEGORIES);

  const handleAdd = (defId: string) => {
    if (entityType === "candidate") {
      addCandidateTag.mutate({ candidate_id: entityId, tag_definition_id: defId });
    } else {
      addJobTag.mutate({ job_id: entityId, tag_definition_id: defId });
    }
  };

  const handleRemove = (tagId: string) => {
    if (entityType === "candidate") {
      removeCandidateTag.mutate({ id: tagId, candidate_id: entityId });
    } else {
      removeJobTag.mutate({ id: tagId, job_id: entityId });
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Tags</h3>
      {categories.map((cat) => {
        const catTags = tags.filter((t: any) => t.tag_definitions?.category === cat);
        const availableOptions = activeDefinitions.filter(
          (d) => d.category === cat && !tagDefIds.has(d.id)
        );
        const canAdd = catTags.length < MAX_TAGS_PER_CATEGORY && availableOptions.length > 0;

        if (catTags.length === 0 && !canAdd) return null;

        return (
          <div key={cat} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">{TAG_CATEGORIES[cat]}</span>
              {canAdd && <AddTagButton category={cat} options={availableOptions} onAdd={handleAdd} />}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {catTags.map((t: any) => (
                <Badge
                  key={t.id}
                  variant="secondary"
                  className="gap-1 pr-1 text-xs"
                >
                  {t.source === "ai" && <Wand2 className="h-2.5 w-2.5 text-primary" />}
                  {t.tag_definitions?.label}
                  <button
                    onClick={() => handleRemove(t.id)}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        );
      })}
      {tags.length === 0 && (
        <p className="text-xs text-muted-foreground">No tags yet. Click + on any category to add tags.</p>
      )}
    </div>
  );
}

function AddTagButton({
  category,
  options,
  onAdd,
}: {
  category: string;
  options: TagDefinition[];
  onAdd: (defId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="h-4 w-4 rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center hover:border-primary hover:text-primary transition-colors">
          <Plus className="h-2.5 w-2.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start">
        <div className="max-h-48 overflow-y-auto">
          {options.map((opt) => (
            <button
              key={opt.id}
              className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors"
              onClick={() => {
                onAdd(opt.id);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
