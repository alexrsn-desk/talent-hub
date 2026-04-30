import { useNavigate } from "react-router-dom";
import { differenceInDays, parseISO } from "date-fns";
import { usePlacements, useAllOpenCheckins } from "@/hooks/use-placements";
import { Award, Calendar, AlertTriangle, Receipt } from "lucide-react";

export function PlacementsDashboardSection() {
  const navigate = useNavigate();
  const { data: placements = [] } = usePlacements();
  const { data: checkins = [] } = useAllOpenCheckins();

  const today = new Date();
  const in7 = new Date(today.getTime() + 7 * 86400000);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const startingThisWeek = placements.filter((p) => {
    if (!p.start_date) return false;
    const d = parseISO(p.start_date);
    return d >= today && d <= in7;
  }).length;

  const checkinsDue = checkins.filter((c) => parseISO(c.due_date) <= in7).length;

  const guaranteeExpiringMonth = placements.filter((p) => {
    if (!p.guarantee_expiry_date) return false;
    const d = parseISO(p.guarantee_expiry_date);
    return d >= today && d <= monthEnd;
  }).length;

  const overdueInvoices = placements.filter((p) => {
    if (p.invoice_paid) return false;
    if (!p.invoice_due_date) return false;
    return parseISO(p.invoice_due_date) < today && p.invoice_raised;
  }).length;

  const items = [
    { label: "Starting this week", value: startingThisWeek, icon: Calendar, color: "text-amber-400" },
    { label: "Check-ins due", value: checkinsDue, icon: Award, color: "text-emerald-400" },
    { label: "Guarantee expiring this month", value: guaranteeExpiringMonth, icon: AlertTriangle, color: "text-blue-400" },
    { label: "Invoices overdue", value: overdueInvoices, icon: Receipt, color: "text-red-400" },
  ];

  if (items.every((i) => i.value === 0)) return null;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold flex items-center gap-2"><Award className="h-4 w-4" /> Placements</h2>
        <button onClick={() => navigate("/placements")} className="text-xs text-primary hover:underline">View all →</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {items.map((i) => (
          <button
            key={i.label}
            onClick={() => navigate("/placements")}
            className="text-left rounded-md border border-border bg-background/40 hover:bg-muted/40 p-3"
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><i.icon className={`h-3.5 w-3.5 ${i.color}`} />{i.label}</div>
            <div className="text-2xl font-semibold mt-1">{i.value}</div>
          </button>
        ))}
      </div>
    </section>
  );
}
