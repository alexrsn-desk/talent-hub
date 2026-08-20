import { useState, type ReactNode } from "react";

/** Panel with a Minimise/Expand toggle. Used for the email config boxes. */
export function CollapsibleBox({
  title,
  description,
  defaultOpen = true,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
          {open ? "Minimise" : "Expand"}
        </button>
      </div>
      {open && <div className="mt-4">{children}</div>}
    </section>
  );
}

/** Textarea that saves on blur when the value actually changed. */
export function AutoSaveTextarea({
  value,
  onSave,
  rows = 5,
  placeholder,
  label,
  helper,
}: {
  value: string | null | undefined;
  onSave: (next: string) => void;
  rows?: number;
  placeholder?: string;
  label?: string;
  helper?: string;
}) {
  return (
    <div>
      {label && <label className="text-sm font-medium">{label}</label>}
      <textarea
        key={value ?? ""}
        defaultValue={value ?? ""}
        rows={rows}
        placeholder={placeholder}
        onBlur={(e) => {
          if (e.target.value !== (value ?? "")) onSave(e.target.value);
        }}
        className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      {helper && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}
    </div>
  );
}
