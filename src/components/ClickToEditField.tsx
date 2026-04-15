import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil } from "lucide-react";
import { logActivity } from "@/lib/activity-log";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ClickToEditFieldProps {
  /** Display label like "Email", "Phone" */
  label: string;
  /** Current value to display */
  value: string;
  /** Field key for activity logging */
  field: string;
  /** Called with new value on save */
  onSave: (newValue: string) => Promise<void>;
  /** Entity type for activity log */
  entityType?: "candidate" | "client" | "job" | "contact";
  /** Entity ID for activity log */
  entityId?: string;
  /** Input type: text, email, number, url */
  type?: string;
  /** If provided, renders as a select dropdown instead of input */
  options?: readonly string[];
  /** Layout: 'inline' for label: value on one line, 'stacked' for label above value */
  layout?: "inline" | "stacked";
  /** Additional class on the wrapper */
  className?: string;
}

export function ClickToEditField({
  label,
  value,
  field,
  onSave,
  entityType,
  entityId,
  type = "text",
  options,
  layout = "inline",
  className,
}: ClickToEditFieldProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = async () => {
    if (editValue === value) {
      setEditing(false);
      return;
    }
    const labelClean = label.replace(/:$/, "");
    await onSave(editValue);
    if (entityType && entityId) {
      await logActivity({
        action_type: `${entityType}_updated`,
        [`${entityType === "contact" ? "client" : entityType}_id`]: entityId,
        metadata: {
          changes: [`${labelClean}: ${value || "—"} → ${editValue || "—"}`],
          fields_updated: [field],
        },
      });
    }
    setEditing(false);
    toast.success(`${labelClean} updated`);
  };

  const handleCancel = () => {
    setEditValue(value);
    setEditing(false);
  };

  const startEdit = () => {
    setEditValue(value);
    setEditing(true);
  };

  // Select dropdown mode
  if (options && editing) {
    return (
      <div className={cn(layout === "stacked" ? "" : "", className)}>
        {layout === "stacked" && <span className="text-muted-foreground block text-xs mb-0.5">{label}</span>}
        {layout === "inline" && <span className="text-muted-foreground text-xs mr-1">{label}:</span>}
        <Select
          value={editValue}
          onValueChange={async (v) => {
            setEditValue(v);
            const labelClean = label.replace(/:$/, "");
            await onSave(v);
            if (entityType && entityId) {
              await logActivity({
                action_type: `${entityType}_updated`,
                [`${entityType === "contact" ? "client" : entityType}_id`]: entityId,
                metadata: {
                  changes: [`${labelClean}: ${value || "—"} → ${v || "—"}`],
                  fields_updated: [field],
                },
              });
            }
            setEditing(false);
            toast.success(`${labelClean} updated`);
          }}
          open={true}
          onOpenChange={(open) => { if (!open) setEditing(false); }}
        >
          <SelectTrigger className="h-7 text-sm w-auto min-w-[100px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (editing) {
    return (
      <div className={cn(layout === "stacked" ? "" : "", className)}>
        {layout === "stacked" && <span className="text-muted-foreground block text-xs mb-0.5">{label}</span>}
        {layout === "inline" && <span className="text-muted-foreground text-xs mr-1">{label}:</span>}
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") handleCancel();
          }}
          onBlur={handleSave}
          type={type}
          className="h-7 text-sm inline-block w-auto min-w-[120px]"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group/edit cursor-pointer rounded px-1 -mx-1 py-0.5 hover:bg-muted/30 transition-colors",
        className
      )}
      onClick={startEdit}
      title="Click to edit"
    >
      {layout === "stacked" ? (
        <>
          <span className="text-muted-foreground block text-xs">{label}</span>
          <span className="text-sm flex items-center gap-1">
            {value || "—"}
            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover/edit:opacity-100 transition-opacity" />
          </span>
        </>
      ) : (
        <span className="text-sm flex items-center gap-1">
          <span className="text-muted-foreground text-xs">{label}:</span>{" "}
          {value || "—"}
          <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover/edit:opacity-100 transition-opacity" />
        </span>
      )}
    </div>
  );
}
