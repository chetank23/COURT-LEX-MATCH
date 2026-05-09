import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Scale,
  FileText,
  AlertTriangle,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Flame,
  Gavel,
  BookOpen,
  Send,
  Sparkles,
  Loader2,
  CheckCircle,
  XCircle,
  Info,
  Users,
  Target,
  TrendingUp,
  Upload,
  FilePlus,
  X as XIcon,
} from "lucide-react";
import { dataService } from "@/services/dataService";
import type { CaseAnalysisReport } from "@/types";

/* ─── Priority helpers ──────────────────────────────────────────────────── */
const PRIORITY_CONFIG = {
  HIGH: {
    color: "hsl(0,72%,51%)",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-500",
    badgeBg: "bg-red-500",
    icon: Flame,
    label: "HIGH PRIORITY",
  },
  MEDIUM: {
    color: "hsl(45,93%,47%)",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    text: "text-yellow-500",
    badgeBg: "bg-yellow-500",
    icon: ShieldAlert,
    label: "MEDIUM PRIORITY",
  },
  LOW: {
    color: "hsl(142,71%,45%)",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-500",
    badgeBg: "bg-emerald-500",
    icon: ShieldCheck,
    label: "LOW PRIORITY",
  },
} as const;

function ScoreRing({
  value,
  color,
  size = 80,
}: {
  value: number;
  color: string;
  size?: number;
}) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <div className="relative inline-block">
      <motion.div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{ background: color, filter: "blur(14px)" }}
        animate={{ opacity: [0, 0.28, 0] }}
        transition={{
          duration: 2.8,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1.3,
        }}
      />
      <svg width={size} height={size} className="block relative z-10">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={6}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-foreground text-lg font-bold"
        >
          {value}
        </text>
      </svg>
    </div>
  );
}

function DriftOrb({
  x,
  y,
  size,
  color,
  duration,
}: {
  x: string;
  y: string;
  size: number;
  color: string;
  duration: number;
}) {
  return (
    <motion.div
      className="fixed rounded-full pointer-events-none z-0"
      style={{
        left: x,
        top: y,
        width: size,
        height: size,
        background: color,
        filter: "blur(80px)",
      }}
      animate={{
        x: [0, 50, -25, 0],
        y: [0, -35, 25, 0],
        opacity: [0.1, 0.2, 0.08, 0.1],
      }}
      transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

function SectionBlock({
  title,
  icon: Icon,
  children,
  delay = 0,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      className="glass-panel rounded-2xl p-5 md:p-6"
    >
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4.5 h-4.5 text-primary" />
        </div>
        <h3 className="text-base font-display font-bold text-foreground">
          {title}
        </h3>
      </div>
      {children}
    </motion.div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────── */
export default function CaseAnalysis() {
  const [context, setContext] = useState("");
  const [report, setReport] = useState<CaseAnalysisReport | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<"text" | "pdf">("text");
  const [isDragOver, setIsDragOver] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isExtractingPdf, setIsExtractingPdf] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAnalyze = async () => {
    const trimmed = context.trim();
    if (!trimmed) return;
    setIsAnalyzing(true);
    setError(null);
    setReport(null);
    try {
      const result = await dataService.analyzeCaseContext(trimmed);
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePdfUpload = useCallback(async (file: File) => {
    if (!file || file.type !== "application/pdf") {
      setError("Please upload a valid PDF file.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("PDF file must be under 20 MB.");
      return;
    }
    setPdfFile(file);
    setIsExtractingPdf(true);
    setError(null);
    setReport(null);
    try {
      const sections = await dataService.analyzePDF(file);
      // Concatenate all section content into a coherent context string
      const extractedText = sections
        .map((s) => [s.title ? `[${s.title}]` : "", s.content || s.summary || ""].filter(Boolean).join("\n"))
        .join("\n\n")
        .trim();
      if (!extractedText || extractedText.length < 30) {
        throw new Error("Could not extract readable text from this PDF. Try a text-based PDF.");
      }
      setContext(extractedText);
      // Auto-trigger analysis with the extracted text
      setIsExtractingPdf(false);
      setIsAnalyzing(true);
      const result = await dataService.analyzeCaseContext(extractedText);
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF extraction failed. Please try again.");
    } finally {
      setIsExtractingPdf(false);
      setIsAnalyzing(false);
    }
  }, []);

  const priorityConfig = report ? PRIORITY_CONFIG[report.priorityLevel] : null;
  const PriorityIcon = priorityConfig?.icon || Shield;

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dot-grid opacity-20" />
      <DriftOrb
        x="5%"
        y="10%"
        size={500}
        color="hsl(238,70%,55%)"
        duration={20}
      />
      <DriftOrb
        x="60%"
        y="50%"
        size={420}
        color="hsl(270,60%,60%)"
        duration={25}
      />
      <DriftOrb
        x="35%"
        y="72%"
        size={320}
        color="hsl(200,70%,50%)"
        duration={17}
      />

      <div className="relative z-10 pt-24 pb-16 px-4 max-w-5xl mx-auto">
        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel rounded-2xl p-5 md:p-6 mb-5 overflow-hidden relative text-center"
        >
          {/* Sweeping scan beam */}
          <motion.div
            className="absolute top-0 left-0 h-full w-[3px] pointer-events-none"
            style={{
              background:
                "linear-gradient(180deg,transparent,hsl(var(--primary)/0.7),transparent)",
              zIndex: 10,
            }}
            animate={{ x: ["-5%", "120%"] }}
            transition={{
              duration: 3.5,
              repeat: Infinity,
              ease: "linear",
              repeatDelay: 5,
            }}
          />
          <div
            className="absolute top-0 left-0 right-0 h-[2px]"
            style={{
              background:
                "linear-gradient(90deg,transparent,hsl(var(--primary)/0.6),hsl(var(--accent)/0.6),transparent)",
            }}
          />

          <div className="flex justify-center mb-3">
            <motion.div
              className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-accent/20 flex items-center justify-center border border-primary/20"
              animate={{
                boxShadow: [
                  "0 0 0px hsl(var(--primary)/0)",
                  "0 0 20px hsl(var(--primary)/0.45)",
                  "0 0 0px hsl(var(--primary)/0)",
                ],
              }}
              transition={{
                duration: 2.8,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <Brain className="w-5 h-5 text-primary" />
            </motion.div>
          </div>

          <div className="flex justify-center mb-2.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-primary/25 bg-primary/8 text-primary">
              <Sparkles className="w-2.5 h-2.5" />
              RAG-Powered Legal Intelligence
            </span>
          </div>

          <h1 className="text-2xl md:text-3xl font-display font-bold gradient-text mb-2">
            Case Analysis Engine
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
            Structured case analysis with priority scoring, legal reasoning, and
            precedent retrieval
          </p>

          <div className="flex justify-center mt-4">
            <motion.div
              className="h-px rounded-full"
              style={{
                background:
                  "linear-gradient(90deg,transparent,hsl(var(--primary)/0.5),transparent)",
              }}
              animate={{ width: ["3rem", "8rem", "3rem"] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
        </motion.div>

        {/* ── Input Panel ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-panel rounded-2xl p-4 md:p-5 mb-6 relative overflow-hidden"
        >
          {/* Decorative top strip */}
          <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: "linear-gradient(90deg,transparent,hsl(var(--accent)/0.5),transparent)" }} />

          {/* Mode toggle + label row */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
              <FileText className="w-3 h-3 text-primary" />
            </div>
            <span className="text-sm font-semibold text-foreground">
              {inputMode === "text" ? "Describe the case or paste case context" : "Upload a legal case PDF"}
            </span>

            {/* Text / PDF toggle */}
            <div className="ml-auto flex items-center gap-1 p-1 rounded-lg bg-muted/60 border border-border">
              <button
                onClick={() => { setInputMode("text"); setPdfFile(null); setError(null); }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${inputMode === "text" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <FileText className="w-3 h-3" /> Text
              </button>
              <button
                onClick={() => { setInputMode("pdf"); setError(null); }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${inputMode === "pdf" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Upload className="w-3 h-3" /> PDF
              </button>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {inputMode === "text" ? (
              <motion.div key="text-mode" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative group">
                <div className="absolute -inset-1 rounded-xl opacity-0 group-focus-within:opacity-100 transition-all duration-300 pointer-events-none z-0">
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-primary rounded-tl-xl" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-primary rounded-tr-xl" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-primary rounded-bl-xl" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-primary rounded-br-xl" />
                </div>
                <textarea
                  ref={textareaRef}
                  id="case-context-input"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleAnalyze(); }}
                  placeholder="E.g. An accused charged under Section 302 IPC for murder of a colleague following a workplace dispute. Accused claims self-defense under Section 100 IPC. FIR filed at Bangalore Central PS. Bail application pending..."
                  rows={6}
                  className="relative z-10 w-full bg-background/60 rounded-xl border border-border group-focus-within:border-primary/20 px-5 py-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none resize-y min-h-[140px] leading-relaxed transition-colors duration-300"
                />
              </motion.div>
            ) : (
              <motion.div key="pdf-mode" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {/* Hidden file input */}
                <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePdfUpload(f); e.target.value = ""; }} />

                {pdfFile ? (
                  /* PDF loaded chip */
                  <div className="flex items-center gap-3 p-4 rounded-xl border border-primary/30 bg-primary/5">
                    <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
                      <FilePlus className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{pdfFile.name}</p>
                      <p className="text-[11px] text-muted-foreground">{(pdfFile.size / 1024).toFixed(0)} KB · PDF extracted</p>
                    </div>
                    <button onClick={() => { setPdfFile(null); setContext(""); setReport(null); setError(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="w-7 h-7 rounded-lg bg-muted/60 flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 transition-colors cursor-pointer">
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  /* Drop zone */
                  <motion.div
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setIsDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handlePdfUpload(f); }}
                    onClick={() => fileInputRef.current?.click()}
                    animate={{ borderColor: isDragOver ? "hsl(var(--primary))" : "hsl(var(--border))", backgroundColor: isDragOver ? "hsl(var(--primary)/0.08)" : "hsl(var(--background)/0.4)" }}
                    className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer min-h-[160px] transition-colors"
                  >
                    <motion.div
                      animate={isDragOver ? { scale: 1.15 } : { scale: 1 }}
                      className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center"
                    >
                      <Upload className="w-7 h-7 text-primary" />
                    </motion.div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-foreground">{isDragOver ? "Drop PDF here" : "Drag & drop a PDF"}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">or <span className="text-primary underline underline-offset-2">click to browse</span> · Max 20 MB</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground/60 px-4 text-center">Text will be extracted and analyzed through the RAG engine automatically</p>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer row */}
          <div className="flex items-center justify-between mt-4 gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              {inputMode === "text" && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <kbd className="px-2 py-0.5 rounded-md bg-muted border border-border text-[10px] font-mono text-foreground/70">Ctrl+Enter</kbd>
                  <span>to analyze</span>
                </p>
              )}
              {context.trim().length > 0 && (
                <motion.span initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-[10px] text-muted-foreground">
                  {context.trim().length} chars extracted
                </motion.span>
              )}
            </div>

            {inputMode === "text" && (
              <motion.button
                id="analyze-case-btn"
                onClick={handleAnalyze}
                disabled={!context.trim() || isAnalyzing}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="relative flex items-center gap-2.5 px-7 py-2.5 rounded-xl text-primary-foreground font-semibold text-sm disabled:opacity-40 cursor-pointer overflow-hidden"
                style={{ background: "linear-gradient(135deg,hsl(var(--primary)),hsl(var(--accent)))" }}
              >
                <motion.div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(105deg,transparent 40%,rgba(255,255,255,0.2) 50%,transparent 60%)" }} animate={{ x: ["-100%", "200%"] }} transition={{ duration: 2.2, repeat: Infinity, ease: "linear", repeatDelay: 1 }} />
                {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin relative z-10" /> : <Send className="w-4 h-4 relative z-10" />}
                <span className="relative z-10">{isAnalyzing ? "Analyzing..." : "Analyze Case"}</span>
              </motion.button>
            )}
          </div>

          {error && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-500">Error</p>
                <p className="text-xs text-red-400/80 mt-0.5">{error}</p>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* ── Loading State (PDF extraction or RAG analysis) ── */}
        <AnimatePresence>
          {(isAnalyzing || isExtractingPdf) && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-panel rounded-2xl p-8 md:p-12 mb-8 flex flex-col items-center overflow-hidden relative"
            >
              {/* Background scanning grid */}
              <div
                className="absolute inset-0 pointer-events-none opacity-20"
                style={{
                  backgroundImage:
                    "linear-gradient(hsl(var(--primary)/0.2) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)/0.2) 1px, transparent 1px)",
                  backgroundSize: "20px 20px",
                }}
              >
                <motion.div
                  className="w-full h-[100px] bg-gradient-to-b from-transparent via-primary/30 to-transparent"
                  animate={{ y: ["-100px", "500px"] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                />
              </div>

              <div className="relative w-full max-w-lg mx-auto flex flex-col items-center z-10">
                {/* Cybernetic Core */}
                <div className="relative flex items-center justify-center mb-10 mt-2">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 12,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                    className="absolute w-32 h-32 rounded-full border border-dashed border-primary/40"
                  />
                  <motion.div
                    animate={{ rotate: -360 }}
                    transition={{
                      duration: 18,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                    className="absolute w-40 h-40 rounded-full border-t-2 border-b-2 border-primary/20"
                  />
                  <motion.div
                    animate={{ scale: [1, 1.25, 1], opacity: [0.4, 0.8, 0.4] }}
                    transition={{
                      duration: 2.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="absolute w-24 h-24 bg-primary/20 rounded-full blur-xl"
                  />
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center relative z-10 border border-primary/50 bg-background/90 backdrop-blur-md overflow-hidden shadow-[0_0_20px_hsl(var(--primary)/0.4)]">
                    <motion.div
                      className="absolute inset-0 bg-primary/20"
                      animate={{ y: ["100%", "-100%"] }}
                      transition={{
                        duration: 1.8,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                    />
                    <Brain className="w-8 h-8 text-primary relative z-10" />
                  </div>
                </div>

                <p className="text-xl font-display font-bold text-foreground mb-1 tracking-wide">
                  {isExtractingPdf ? "EXTRACTING PDF" : "SIMULATION IN PROGRESS"}
                </p>
                <p className="text-xs text-primary/80 mb-8 font-mono uppercase tracking-widest">
                  {isExtractingPdf ? "Parsing legal document..." : "Connecting to Vector Engine..."}
                </p>

                <div className="w-full space-y-5">
                  {(isExtractingPdf ? [
                    "Reading PDF structure",
                    "Extracting legal text",
                    "Preparing context for RAG",
                    "Initiating analysis engine",
                  ] : [
                    "Establishing semantic vector connection",
                    "Retrieving related precedents",
                    "Applying weighted priority scoring",
                    "Generating judicial reasoning",
                  ]).map((text, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: i * 0.7 }}
                        className="relative w-3 h-3 flex items-center justify-center flex-shrink-0"
                      >
                        <motion.span
                          className="absolute w-full h-full bg-primary/40 rounded-full"
                          animate={{ scale: [1, 2, 1], opacity: [1, 0, 1] }}
                          transition={{
                            duration: 1.5,
                            repeat: Infinity,
                            delay: i * 0.7,
                          }}
                        />
                        <span className="w-1.5 h-1.5 bg-primary rounded-full z-10" />
                      </motion.div>
                      <motion.div
                        initial={{ opacity: 0, x: -15 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.7 + 0.2 }}
                        className="flex-1"
                      >
                        <div className="flex justify-between items-center text-[11px] uppercase tracking-wider mb-1.5">
                          <span className="font-mono text-foreground/80">
                            {text}
                          </span>
                          <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: [0, 1, 0] }}
                            transition={{
                              delay: i * 0.7 + 0.4,
                              duration: 1.5,
                              repeat: Infinity,
                            }}
                            className="text-primary font-mono font-bold"
                          >
                            [OK]
                          </motion.span>
                        </div>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: "100%" }}
                          transition={{
                            delay: i * 0.7 + 0.2,
                            duration: 1.8,
                            ease: "easeOut",
                          }}
                          className="h-px bg-gradient-to-r from-primary/50 to-transparent"
                        />
                      </motion.div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Report ── */}
        <AnimatePresence>
          {report && !isAnalyzing && (
            <motion.div
              key="report"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-5"
            >
              {/* Grounded / Generative badge */}
              {report.generativeNote && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center gap-3"
                >
                  <Info className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                  <p className="text-xs text-yellow-500 font-medium">
                    {report.generativeNote}
                  </p>
                </motion.div>
              )}

              {/* ── Top Summary Row ── */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Priority Card */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className={`glass-panel rounded-2xl p-6 border-2 ${priorityConfig?.border}`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${priorityConfig?.bg}`}
                    >
                      <PriorityIcon
                        className={`w-5 h-5 ${priorityConfig?.text}`}
                      />
                    </div>
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full text-white ${priorityConfig?.badgeBg}`}
                    >
                      {report.priorityLevel}
                    </span>
                  </div>
                  <div className="flex items-end gap-4">
                    <ScoreRing
                      value={report.priorityScore}
                      color={priorityConfig?.color || "#888"}
                    />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        Priority Score
                      </p>
                      <p
                        className={`text-2xl font-display font-bold ${priorityConfig?.text}`}
                      >
                        {report.priorityScore}/100
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                    {report.priorityJustification}
                  </p>
                </motion.div>

                {/* Case Title + Type */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="glass-panel rounded-2xl p-6"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Gavel className="w-4 h-4 text-primary" />
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Case Title
                    </span>
                  </div>
                  <p className="text-base font-display font-bold text-foreground leading-snug mb-4">
                    {report.caseTitle}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Type:
                    </span>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                      {report.caseType}
                    </span>
                  </div>
                </motion.div>

                {/* Confidence + Grounded */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="glass-panel rounded-2xl p-6"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Target className="w-4 h-4 text-primary" />
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Confidence
                    </span>
                  </div>
                  <div className="flex items-end gap-4 mb-4">
                    <ScoreRing
                      value={Math.round(report.confidenceScore * 100)}
                      color="hsl(238,70%,55%)"
                    />
                    <div>
                      <p className="text-2xl font-display font-bold text-primary">
                        {report.confidenceScore}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        out of 1.0
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {report.grounded ? (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-500">
                        <CheckCircle className="w-3.5 h-3.5" /> Grounded in
                        precedents
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-yellow-500">
                        <Sparkles className="w-3.5 h-3.5" /> Generative
                        reasoning
                      </span>
                    )}
                  </div>
                </motion.div>
              </div>

              {/* ── Structured Sections ── */}
              {report.expandedScenario && (
                <SectionBlock
                  title="Expanded Case Scenario"
                  icon={Sparkles}
                  delay={0.18}
                >
                  {(() => {
                    const text = report.expandedScenario;
                    if (!text.includes("[Facts]") && !text.includes("[Issues]")) {
                      return (
                        <div className="rounded-xl bg-gradient-to-br from-primary/5 to-accent/5 border border-primary/10 p-4">
                          <p className="text-sm text-foreground/85 leading-relaxed">
                            {text}
                          </p>
                        </div>
                      );
                    }

                    const factsMatch = text.match(
                      /\[Facts\]([\s\S]*?)(?=\[Issues\]|\[Relief Sought\]|$)/i
                    );
                    const issuesMatch = text.match(
                      /\[Issues\]([\s\S]*?)(?=\[Relief Sought\]|$)/i
                    );
                    const reliefMatch = text.match(/\[Relief Sought\]([\s\S]*?)$/i);

                    return (
                      <div className="space-y-3">
                        {factsMatch && factsMatch[1].trim() && (
                          <div className="rounded-xl border border-border p-4 bg-background/50">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                              <span className="text-[10px] font-bold tracking-wider text-blue-500 uppercase">
                                Facts
                              </span>
                            </div>
                            <p className="text-sm text-foreground/80 leading-relaxed">
                              {factsMatch[1].trim()}
                            </p>
                          </div>
                        )}
                        {issuesMatch && issuesMatch[1].trim() && (
                          <div className="rounded-xl border border-border p-4 bg-background/50">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                              <span className="text-[10px] font-bold tracking-wider text-orange-500 uppercase">
                                Issues
                              </span>
                            </div>
                            <p className="text-sm text-foreground/80 leading-relaxed">
                              {issuesMatch[1].trim()}
                            </p>
                          </div>
                        )}
                        {reliefMatch && reliefMatch[1].trim() && (
                          <div className="rounded-xl border border-border p-4 bg-background/50">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                              <span className="text-[10px] font-bold tracking-wider text-purple-500 uppercase">
                                Relief Sought
                              </span>
                            </div>
                            <p className="text-sm text-foreground/80 leading-relaxed">
                              {reliefMatch[1].trim()}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </SectionBlock>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <SectionBlock title="Key Facts" icon={FileText} delay={0.2}>
                  <ul className="space-y-2">
                    {report.keyFacts.map((fact, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                        <span className="text-sm text-foreground/80 leading-relaxed">
                          {fact}
                        </span>
                      </li>
                    ))}
                  </ul>
                </SectionBlock>

                <SectionBlock
                  title="Legal Issues"
                  icon={AlertTriangle}
                  delay={0.25}
                >
                  <ul className="space-y-2">
                    {report.legalIssues.map((issue, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-yellow-500 flex-shrink-0" />
                        <span className="text-sm text-foreground/80 leading-relaxed">
                          {issue}
                        </span>
                      </li>
                    ))}
                  </ul>
                </SectionBlock>

                <SectionBlock title="Relevant Laws" icon={BookOpen} delay={0.3}>
                  <div className="flex flex-wrap gap-2">
                    {report.relevantLaws.map((law, i) => (
                      <span
                        key={i}
                        className="px-3 py-1.5 rounded-lg bg-primary/8 border border-primary/15 text-xs font-medium text-primary"
                      >
                        {law}
                      </span>
                    ))}
                  </div>
                </SectionBlock>

                <SectionBlock title="Arguments" icon={Users} delay={0.35}>
                  <div className="space-y-3">
                    <div className="rounded-xl bg-blue-500/5 border border-blue-500/15 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-blue-500 font-bold mb-1">
                        Plaintiff / Petitioner
                      </p>
                      <p className="text-xs text-foreground/80 leading-relaxed">
                        {report.arguments.plaintiff}
                      </p>
                    </div>
                    <div className="rounded-xl bg-orange-500/5 border border-orange-500/15 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-orange-500 font-bold mb-1">
                        Defendant / Respondent
                      </p>
                      <p className="text-xs text-foreground/80 leading-relaxed">
                        {report.arguments.defendant}
                      </p>
                    </div>
                  </div>
                </SectionBlock>
              </div>

              {/* ── Similar Cases ── */}
              {report.similarCaseReferences.length > 0 && (
                <SectionBlock
                  title="Similar Case References"
                  icon={Scale}
                  delay={0.4}
                >
                  <div className="space-y-2.5">
                    {report.similarCaseReferences.map((ref, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.45 + i * 0.06 }}
                        className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border hover:bg-muted/50 transition-colors"
                      >
                        <span className="mt-0.5 w-6 h-6 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {ref.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {ref.court} · {ref.year}
                          </p>
                          {ref.excerpt && (
                            <p className="text-xs text-foreground/60 mt-1 line-clamp-2">
                              {ref.excerpt}
                            </p>
                          )}
                        </div>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary flex-shrink-0">
                          {ref.similarity}%
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </SectionBlock>
              )}

              {/* ── Predicted Outcome + Reasoning ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <SectionBlock
                  title="Predicted Outcome"
                  icon={TrendingUp}
                  delay={0.5}
                >
                  <div className="rounded-xl bg-gradient-to-br from-primary/5 to-accent/5 border border-primary/10 p-4">
                    <p className="text-sm text-foreground leading-relaxed">
                      {report.predictedOutcome}
                    </p>
                  </div>
                </SectionBlock>

                <SectionBlock title="Reasoning" icon={Brain} delay={0.55}>
                  <p className="text-sm text-foreground/80 leading-relaxed">
                    {report.reasoning}
                  </p>
                </SectionBlock>
              </div>

              {/* ── New Analysis Button ── */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.65 }}
                className="text-center pt-4"
              >
                <button
                  onClick={() => {
                    setReport(null);
                    setContext("");
                    setPdfFile(null);
                    setError(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                    textareaRef.current?.focus();
                  }}
                  className="px-6 py-2.5 rounded-xl bg-muted text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  Analyze Another Case
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
