import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Paperclip, Loader2, X, FileCheck2 } from "lucide-react";
import { toast } from "sonner";
import mammoth from "mammoth";

type Props = {
  value: string;
  onChange: (text: string) => void;
  label?: string;
  placeholder?: string;
  rows?: number;
  helper?: string;
};

const ACCEPT = ".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

async function extractPdf(file: File): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist");
  // Use a worker via CDN matching installed version to avoid bundling issues
  try {
    // @ts-ignore
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  } catch {}
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it: any) => it.str).join(" ") + "\n\n";
  }
  return text.trim();
}

async function extractDocx(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return (result.value || "").trim();
}

async function extractTxt(file: File): Promise<string> {
  return (await file.text()).trim();
}

export function JobSpecUploader({ value, onChange, label = "Job spec", placeholder, rows = 6, helper }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  async function handleFile(file: File) {
    setExtracting(true);
    try {
      const name = file.name.toLowerCase();
      let text = "";
      if (name.endsWith(".pdf")) text = await extractPdf(file);
      else if (name.endsWith(".docx") || name.endsWith(".doc")) text = await extractDocx(file);
      else if (name.endsWith(".txt")) text = await extractTxt(file);
      else throw new Error("Unsupported file type");

      if (!text || text.length < 20) throw new Error("No readable text");
      onChange(text);
      setFilename(file.name);
      toast.success(`${file.name} extracted`);
    } catch (e: any) {
      toast.error("Could not read this file. Please paste the job spec as text instead.");
    } finally {
      setExtracting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        {filename ? (
          <div className="flex items-center gap-2 text-xs text-green-500">
            <FileCheck2 className="h-3.5 w-3.5" />
            <span className="truncate max-w-[200px]">{filename} uploaded</span>
            <button
              type="button"
              onClick={() => { setFilename(null); onChange(""); }}
              className="text-muted-foreground hover:text-foreground"
              title="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={extracting}
            onClick={() => inputRef.current?.click()}
          >
            {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
            {extracting ? "Extracting…" : "Upload job spec"}
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder || "Upload a PDF/Word/TXT above, or paste the job spec here…"}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {helper && <p className="text-[11px] text-muted-foreground">{helper}</p>}
    </div>
  );
}
