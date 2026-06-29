import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Upload, FileSpreadsheet, ArrowRight, ArrowLeft, Check, Download,
  Loader2, AlertCircle, History, Trash2, Sparkles, Users, Building2, Briefcase,
} from "lucide-react";
import {
  parseFile, detectSource, mappingForSource, SourceKey, WIZARD_FIELDS,
  WizardFilters, DEFAULT_FILTERS, evaluateRows, previewDuplicates, RowMeta,
  runWizardImport, DuplicateMode, loadSavedTemplates, saveTemplate, deleteSavedTemplate,
  SavedTemplate, downloadDeskyTemplate, downloadErrorLog, WizardImportResult,
} from "@/lib/import-wizard";
import { RecordType, saveImportHistory, getImportHistory } from "@/lib/csv-import";
import { supabase } from "@/integrations/supabase/client";

type Step = "upload" | "mapping" | "preview" | "duplicates" | "importing" | "results";

const RECORD_TYPE_OPTIONS: { value: RecordType; label: string; icon: any }[] = [
  { value: "candidates", label: "Candidates", icon: Users },
  { value: "contacts", label: "Contacts / Clients", icon: Building2 },
  { value: "jobs", label: "Jobs", icon: Briefcase },
];

const MAX_FILE_SIZE = 50 * 1024 * 1024;

export function ImportWizard() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [recordType, setRecordType] = useState<RecordType>("candidates");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [source, setSource] = useState<SourceKey>("unknown");
  const [sourceLabel, setSourceLabel] = useState("CSV");
  const [detectionMessage, setDetectionMessage] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<WizardFilters>(DEFAULT_FILTERS);
  const [rowMeta, setRowMeta] = useState<RowMeta[]>([]);
  const [previewStats, setPreviewStats] = useState({ total: 0, validName: 0, hasContact: 0, emptyRows: 0, willImport: 0 });
  const [dupCount, setDupCount] = useState(0);
  const [dupKeys, setDupKeys] = useState<Map<number, string>>(new Map());
  const [dupMode, setDupMode] = useState<DuplicateMode>("update");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<WizardImportResult | null>(null);
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>(() => loadSavedTemplates());
  const [templateName, setTemplateName] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const fields = useMemo(() => WIZARD_FIELDS[recordType], [recordType]);

  useEffect(() => { getImportHistory().then(setHistory).catch(() => {}); }, [step]);

  const reset = () => {
    setStep("upload"); setFile(null); setHeaders([]); setRows([]);
    setSource("unknown"); setSourceLabel("CSV"); setDetectionMessage("");
    setMapping({}); setFilters(DEFAULT_FILTERS); setRowMeta([]);
    setPreviewStats({ total: 0, validName: 0, hasContact: 0, emptyRows: 0, willImport: 0 });
    setDupCount(0); setDupKeys(new Map()); setDupMode("update");
    setProgress({ current: 0, total: 0 }); setResult(null); setTemplateName("");
  };

  // ── Upload handling ─────────────────────────────────────────────
  const handleFile = async (f: File) => {
    if (f.size > MAX_FILE_SIZE) { toast.error("File exceeds 50MB"); return; }
    const isCsv = f.name.toLowerCase().endsWith(".csv");
    const isXlsx = f.name.toLowerCase().endsWith(".xlsx") || f.name.toLowerCase().endsWith(".xls");
    if (!isCsv && !isXlsx) { toast.error("Only .csv and .xlsx files are supported"); return; }
    try {
      const { headers: h, rows: r } = await parseFile(f);
      if (!h.length) { toast.error("File appears empty"); return; }
      setFile(f); setHeaders(h); setRows(r);
      const det = detectSource(h);
      setSource(det.source);
      setSourceLabel(det.label);
      setDetectionMessage(det.message);
      const m = mappingForSource(det.source, h, recordType);
      setMapping(m);
      toast.success(`${f.name} — ${r.length} rows detected`);
    } catch (e: any) {
      toast.error(`Failed to parse file: ${e?.message || e}`);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  // ── Mapping helpers ─────────────────────────────────────────────
  const updateMapping = (csvHeader: string, fieldKey: string) => {
    setMapping(prev => ({ ...prev, [csvHeader]: fieldKey === "__skip" ? "_skip" : fieldKey }));
  };

  const requiredOk = useMemo(() => {
    const reqKeys = fields.filter(f => f.required).map(f => f.key);
    const mapped = new Set(Object.values(mapping));
    return reqKeys.every(k => {
      if (k === "first_name" || k === "last_name") {
        return mapped.has("first_name") || mapped.has("_fullname") || mapped.has(k);
      }
      return mapped.has(k);
    });
  }, [fields, mapping]);

  const applyTemplate = (tpl: SavedTemplate) => {
    if (tpl.recordType !== recordType) {
      toast.error(`This template is for ${tpl.recordType}`);
      return;
    }
    const m: Record<string, string> = {};
    for (const h of headers) m[h] = tpl.mapping[h] || mapping[h] || "_skip";
    setMapping(m);
    toast.success(`Applied "${tpl.name}"`);
  };

  const handleSaveTemplate = () => {
    if (!templateName.trim()) { toast.error("Enter a template name"); return; }
    const t = saveTemplate({ name: templateName.trim(), recordType, source, mapping });
    setSavedTemplates(loadSavedTemplates());
    setTemplateName("");
    toast.success(`Saved "${t.name}"`);
  };

  // ── Step transitions ────────────────────────────────────────────
  const goToPreview = () => {
    const { stats, rowMeta } = evaluateRows(rows, headers, mapping, source, filters, recordType);
    setRowMeta(rowMeta); setPreviewStats(stats);
    setStep("preview");
  };

  useEffect(() => {
    if (step !== "preview") return;
    const { stats, rowMeta } = evaluateRows(rows, headers, mapping, source, filters, recordType);
    setRowMeta(rowMeta); setPreviewStats(stats);
  }, [filters, step, rows, headers, mapping, source, recordType]);

  const goToDuplicates = async () => {
    const dp = await previewDuplicates(rowMeta, recordType);
    setDupCount(dp.duplicates); setDupKeys(dp.matchKeys);
    setStep("duplicates");
  };

  const startImport = async () => {
    setStep("importing");
    setProgress({ current: 0, total: rowMeta.length });
    try {
      const res = await runWizardImport({
        recordType, rowMeta, source, sourceLabel,
        dupMode, matchKeys: dupKeys, filters,
        onProgress: (c, t) => setProgress({ current: c, total: t }),
      });
      setResult(res);
      // Save history
      await saveImportHistory(sourceLabel, recordType, {
        imported: res.imported, skipped: res.skippedEmpty + res.skippedNoContact + res.skippedDup,
        updated: res.updated, skippedMissingData: res.skippedEmpty,
        errors: res.errors, nameReviewItems: [],
      }, res.importedIds);
      setStep("results");
    } catch (e: any) {
      toast.error(`Import failed: ${e?.message || e}`);
      setStep("duplicates");
    }
  };

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <Tabs defaultValue="wizard">
        <TabsList>
          <TabsTrigger value="wizard"><Upload className="h-4 w-4 mr-1.5" />Import</TabsTrigger>
          <TabsTrigger value="history"><History className="h-4 w-4 mr-1.5" />History</TabsTrigger>
        </TabsList>

        <TabsContent value="wizard" className="space-y-4 mt-4">
          {/* Stepper */}
          <StepHeader step={step} />

          {step === "upload" && (
            <UploadStep
              recordType={recordType}
              onRecordTypeChange={(t) => { reset(); setRecordType(t); }}
              file={file}
              rowCount={rows.length}
              detectionMessage={detectionMessage}
              sourceLabel={sourceLabel}
              dragOver={dragOver}
              setDragOver={setDragOver}
              onDrop={onDrop}
              onPick={() => fileRef.current?.click()}
              onClear={reset}
              onNext={() => setStep("mapping")}
            />
          )}
          <input
            ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          />

          {step === "mapping" && (
            <MappingStep
              headers={headers}
              fields={fields}
              mapping={mapping}
              updateMapping={updateMapping}
              requiredOk={requiredOk}
              savedTemplates={savedTemplates.filter(t => t.recordType === recordType)}
              applyTemplate={applyTemplate}
              deleteTemplate={(id) => { deleteSavedTemplate(id); setSavedTemplates(loadSavedTemplates()); }}
              templateName={templateName}
              setTemplateName={setTemplateName}
              handleSaveTemplate={handleSaveTemplate}
              onBack={() => setStep("upload")}
              onNext={goToPreview}
            />
          )}

          {step === "preview" && (
            <PreviewStep
              stats={previewStats}
              filters={filters}
              setFilters={setFilters}
              recordType={recordType}
              onBack={() => setStep("mapping")}
              onNext={goToDuplicates}
            />
          )}

          {step === "duplicates" && (
            <DuplicatesStep
              dupCount={dupCount}
              willImport={previewStats.willImport}
              dupMode={dupMode}
              setDupMode={setDupMode}
              recordType={recordType}
              onBack={() => setStep("preview")}
              onNext={startImport}
            />
          )}

          {step === "importing" && (
            <Card>
              <CardContent className="py-12 text-center space-y-4">
                <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
                <p className="text-lg font-medium">Importing {recordType}…</p>
                <Progress value={progress.total ? (progress.current / progress.total) * 100 : 0} className="max-w-md mx-auto" />
                <p className="text-sm text-muted-foreground">{progress.current} of {progress.total} complete</p>
              </CardContent>
            </Card>
          )}

          {step === "results" && result && (
            <ResultsStep
              result={result}
              recordType={recordType}
              onReset={reset}
              onView={() => navigate(`/${recordType}`)}
            />
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryTab history={history} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Stepper header ─────────────────────────────────────────────────
const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "mapping", label: "Mapping" },
  { key: "preview", label: "Preview" },
  { key: "duplicates", label: "Duplicates" },
  { key: "results", label: "Done" },
];
function StepHeader({ step }: { step: Step }) {
  const idx = STEPS.findIndex(s => s.key === step);
  const activeIdx = step === "importing" ? 3 : idx;
  return (
    <div className="flex items-center gap-2 text-xs">
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold ${
            i < activeIdx ? "bg-primary text-primary-foreground" :
            i === activeIdx ? "bg-primary text-primary-foreground ring-2 ring-primary/30" :
            "bg-muted text-muted-foreground"
          }`}>
            {i < activeIdx ? <Check className="h-3 w-3" /> : i + 1}
          </div>
          <span className={i === activeIdx ? "font-medium" : "text-muted-foreground"}>{s.label}</span>
          {i < STEPS.length - 1 && <div className="w-6 h-px bg-border" />}
        </div>
      ))}
    </div>
  );
}

// ── Step 1: Upload ────────────────────────────────────────────────
function UploadStep(p: {
  recordType: RecordType; onRecordTypeChange: (t: RecordType) => void;
  file: File | null; rowCount: number; detectionMessage: string; sourceLabel: string;
  dragOver: boolean; setDragOver: (b: boolean) => void;
  onDrop: (e: React.DragEvent) => void; onPick: () => void;
  onClear: () => void; onNext: () => void;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">What are you importing?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {RECORD_TYPE_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const active = p.recordType === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => p.onRecordTypeChange(opt.value)}
                  className={`p-4 rounded-lg border-2 flex flex-col items-center gap-2 transition ${
                    active ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  }`}
                >
                  <Icon className={`h-6 w-6 ${active ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="text-sm font-medium">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div
            onDragOver={(e) => { e.preventDefault(); p.setDragOver(true); }}
            onDragLeave={() => p.setDragOver(false)}
            onDrop={p.onDrop}
            onClick={p.onPick}
            className={`border-2 border-dashed rounded-xl py-16 px-6 text-center cursor-pointer transition ${
              p.dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
            }`}
          >
            <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Drop your CSV here</p>
            <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
            <p className="text-xs text-muted-foreground mt-3">.csv or .xlsx · up to 50MB · no row limit</p>
          </div>

          {p.file && (
            <div className="mt-4 p-3 bg-muted/50 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">{p.file.name}</p>
                  <p className="text-xs text-muted-foreground">{p.rowCount} rows detected</p>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); p.onClear(); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}

          {p.file && p.detectionMessage && (
            <div className="mt-3 p-3 rounded-lg border bg-primary/5 border-primary/20 flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-primary mt-0.5" />
              <p className="text-sm">{p.detectionMessage}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadDeskyTemplate(p.recordType)}>
            <Download className="h-4 w-4 mr-1.5" />Download Desky template
          </Button>
        </div>
        <Button disabled={!p.file} onClick={p.onNext}>
          Next: Mapping <ArrowRight className="h-4 w-4 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Step 2: Mapping ───────────────────────────────────────────────
function MappingStep(p: {
  headers: string[]; fields: { key: string; label: string; required?: boolean }[];
  mapping: Record<string, string>; updateMapping: (h: string, k: string) => void;
  requiredOk: boolean;
  savedTemplates: SavedTemplate[]; applyTemplate: (t: SavedTemplate) => void;
  deleteTemplate: (id: string) => void;
  templateName: string; setTemplateName: (s: string) => void;
  handleSaveTemplate: () => void;
  onBack: () => void; onNext: () => void;
}) {
  const fieldOptions = [...p.fields, { key: "_skip", label: "— Ignore this column —" }];
  return (
    <div className="space-y-4">
      {p.savedTemplates.length > 0 && (
        <Card>
          <CardContent className="pt-4 flex flex-wrap gap-2 items-center">
            <span className="text-sm font-medium mr-2">Saved templates:</span>
            {p.savedTemplates.map(t => (
              <div key={t.id} className="flex items-center gap-1 px-2 py-1 rounded-md border bg-muted/30 text-xs">
                <button onClick={() => p.applyTemplate(t)} className="hover:underline">{t.name}</button>
                <button onClick={() => p.deleteTemplate(t.id)} className="text-muted-foreground hover:text-destructive ml-1">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Map your columns to Desky fields</CardTitle>
          <CardDescription>
            Auto-mapped columns are marked with a check. Adjust any that look wrong, or set unwanted columns to "Ignore".
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 max-h-[480px] overflow-y-auto pr-2">
            {p.headers.map(h => {
              const val = p.mapping[h] || "_skip";
              const isMapped = val && val !== "_skip";
              return (
                <div key={h} className="grid grid-cols-[1fr_24px_1fr] gap-2 items-center py-1.5 border-b last:border-0">
                  <div className="text-sm truncate" title={h}>
                    <span className="font-medium">{h}</span>
                  </div>
                  <ArrowRight className={`h-4 w-4 ${isMapped ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="flex items-center gap-2">
                    <Select value={val} onValueChange={(v) => p.updateMapping(h, v)}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {fieldOptions.map(f => (
                          <SelectItem key={f.key} value={f.key}>
                            {f.label}{(f as any).required ? " *" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isMapped && <Check className="h-4 w-4 text-emerald-600 shrink-0" />}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs">Save this mapping as a template</Label>
            <Input
              value={p.templateName}
              onChange={(e) => p.setTemplateName(e.target.value)}
              placeholder="e.g. Vincere export"
              className="h-8 mt-1"
            />
          </div>
          <Button variant="outline" size="sm" onClick={p.handleSaveTemplate}>Save template</Button>
        </CardContent>
      </Card>

      {!p.requiredOk && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
          <AlertCircle className="h-4 w-4" />
          Map required fields (First/Last Name or Full Name) to continue.
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={p.onBack}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
        <Button disabled={!p.requiredOk} onClick={p.onNext}>
          Next: Preview <ArrowRight className="h-4 w-4 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Step 3: Preview + filters ─────────────────────────────────────
function PreviewStep(p: {
  stats: { total: number; validName: number; hasContact: number; emptyRows: number; willImport: number };
  filters: WizardFilters; setFilters: (f: WizardFilters) => void;
  recordType: RecordType;
  onBack: () => void; onNext: () => void;
}) {
  const { stats, filters, setFilters, recordType } = p;
  const setStatus = (k: keyof WizardFilters["statuses"], v: boolean) =>
    setFilters({ ...filters, statuses: { ...filters.statuses, [k]: v } });
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Here's what will be imported</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Total rows in file" value={stats.total} />
          <Row label="Rows with valid name" value={stats.validName} />
          <Row label="Rows with email or phone" value={stats.hasContact} />
          <Row label="Empty rows (skipped)" value={stats.emptyRows} muted />
          <div className="border-t pt-2 mt-2 flex items-center justify-between">
            <span className="font-medium">Estimated import:</span>
            <Badge variant="default" className="text-base px-3 py-1">{stats.willImport} {recordType}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Filter what to import</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          {(recordType === "candidates" || recordType === "contacts") && (
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-muted-foreground">Status</Label>
              {([
                ["active", "Active"], ["passive", "Passive"],
                ["inactive", "Inactive / Archived"], ["unknown", "Unknown status"],
              ] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={filters.statuses[k]} onCheckedChange={(c) => setStatus(k, !!c)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase text-muted-foreground">Last activity</Label>
            <RadioGroup value={filters.lastActivity} onValueChange={(v) => setFilters({ ...filters, lastActivity: v as any })}>
              {[
                ["all", "All records"], ["6m", "Active in last 6 months"],
                ["12m", "Active in last 12 months"], ["all_time", "All time"],
              ].map(([v, label]) => (
                <label key={v} className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value={v} /><span>{label}</span>
                </label>
              ))}
            </RadioGroup>
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={filters.requireContact} onCheckedChange={(c) => setFilters({ ...filters, requireContact: !!c })} />
              <span>Must have email or phone</span>
            </label>
            {recordType !== "clients" && (
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={filters.requireJobTitle} onCheckedChange={(c) => setFilters({ ...filters, requireJobTitle: !!c })} />
                <span>Must have job title</span>
              </label>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="md:col-span-2 flex justify-between">
        <Button variant="outline" onClick={p.onBack}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
        <Button disabled={stats.willImport === 0} onClick={p.onNext}>
          Next: Duplicates <ArrowRight className="h-4 w-4 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className={`flex justify-between ${muted ? "text-muted-foreground" : ""}`}>
      <span>{label}</span><span className="font-medium">{value}</span>
    </div>
  );
}

// ── Step 4: Duplicates ────────────────────────────────────────────
function DuplicatesStep(p: {
  dupCount: number; willImport: number;
  dupMode: DuplicateMode; setDupMode: (m: DuplicateMode) => void;
  recordType: RecordType;
  onBack: () => void; onNext: () => void;
}) {
  const newCount = Math.max(0, p.willImport - p.dupCount);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Duplicate check</CardTitle>
          <CardDescription>
            {p.recordType === "candidates" || p.recordType === "contacts"
              ? "Matched on email first, then first + last name + employer."
              : "No duplicate detection runs for this record type."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-md border bg-emerald-50 border-emerald-200">
              <p className="text-xs text-emerald-700 uppercase tracking-wide">New records</p>
              <p className="text-2xl font-semibold text-emerald-900">{newCount}</p>
            </div>
            <div className="p-3 rounded-md border bg-amber-50 border-amber-200">
              <p className="text-xs text-amber-700 uppercase tracking-wide">Potential duplicates</p>
              <p className="text-2xl font-semibold text-amber-900">{p.dupCount}</p>
            </div>
          </div>

          {p.dupCount > 0 && (
            <div className="space-y-1.5 pt-2">
              <Label className="text-xs uppercase text-muted-foreground">What to do with duplicates</Label>
              <RadioGroup value={p.dupMode} onValueChange={(v) => p.setDupMode(v as DuplicateMode)}>
                <label className="flex items-start gap-2 cursor-pointer p-2 rounded hover:bg-muted/30">
                  <RadioGroupItem value="skip" className="mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Skip duplicates</p>
                    <p className="text-xs text-muted-foreground">Keep existing records — don't change anything.</p>
                  </div>
                </label>
                <label className="flex items-start gap-2 cursor-pointer p-2 rounded hover:bg-muted/30">
                  <RadioGroupItem value="update" className="mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Update duplicates (recommended)</p>
                    <p className="text-xs text-muted-foreground">Only fills empty fields with newer info from CSV. Existing data is never overwritten.</p>
                  </div>
                </label>
                <label className="flex items-start gap-2 cursor-pointer p-2 rounded hover:bg-muted/30">
                  <RadioGroupItem value="create" className="mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Import anyway</p>
                    <p className="text-xs text-muted-foreground">Creates new records — may produce duplicates.</p>
                  </div>
                </label>
              </RadioGroup>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={p.onBack}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
        <Button onClick={p.onNext}>
          Import {p.willImport} {p.recordType} <ArrowRight className="h-4 w-4 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Step 5: Results ───────────────────────────────────────────────
function ResultsStep(p: {
  result: WizardImportResult; recordType: RecordType;
  onReset: () => void; onView: () => void;
}) {
  const r = p.result;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
            <Check className="h-5 w-5 text-emerald-700" />
          </div>
          <div>
            <CardTitle>Import complete</CardTitle>
            <CardDescription>From {r.source}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <Row label="Successfully imported" value={r.imported} />
        <Row label="Updated existing records" value={r.updated} />
        <Row label="Skipped (empty rows / missing name)" value={r.skippedEmpty} muted />
        <Row label="Skipped (no contact details)" value={r.skippedNoContact} muted />
        <Row label="Skipped (duplicates)" value={r.skippedDup} muted />
        <Row label="Failed (errors)" value={r.failed} muted />
        <div className="flex gap-2 pt-4">
          <Button onClick={p.onView}>
            View imported {p.recordType}
          </Button>
          {r.errors.length > 0 && (
            <Button variant="outline" onClick={() => downloadErrorLog(r.errors)}>
              <Download className="h-4 w-4 mr-1.5" />Download error log
            </Button>
          )}
          <Button variant="ghost" onClick={p.onReset}>Start another import</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── History ───────────────────────────────────────────────────────
function HistoryTab({ history }: { history: any[] }) {
  if (!history.length) {
    return <div className="text-sm text-muted-foreground py-12 text-center">No imports yet.</div>;
  }
  return (
    <div className="space-y-2">
      {history.map(h => (
        <Card key={h.id}>
          <CardContent className="py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                {new Date(h.created_at).toLocaleDateString()} — {h.source} ({h.record_type})
              </p>
              <p className="text-xs text-muted-foreground">
                {h.records_imported} imported · {h.records_updated} updated · {h.records_skipped} skipped
              </p>
            </div>
            <Badge variant="outline">{(h.imported_ids?.length || 0)} records</Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
