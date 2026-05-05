import { useState, useRef } from "react";
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
  ChevronDown,
  Send,
  Sparkles,
  Loader2,
  CheckCircle,
  XCircle,
  Info,
  Users,
  Target,
  TrendingUp,
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

function ScoreRing({ value, color, size = 80 }: { value: number; color: string; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <svg width={size} height={size} className="block">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={6} />
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
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="fill-foreground text-lg font-bold">
        {value}
      </text>
    </svg>
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
        <h3 className="text-base font-display font-bold text-foreground">{title}</h3>
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const priorityConfig = report ? PRIORITY_CONFIG[report.priorityLevel] : null;
  const PriorityIcon = priorityConfig?.icon || Shield;

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dot-grid opacity-30" />
      <div className="fixed top-1/3 left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full bg-primary/5 blur-[140px]" />

      <div className="relative z-10 pt-24 pb-16 px-4 max-w-5xl mx-auto">
        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel rounded-2xl p-6 md:p-8 mb-8"
        >
          <div className="flex items-center gap-3 mb-1">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-accent/20 flex items-center justify-center border border-primary/20">
              <Brain className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                RAG-Powered Legal Intelligence
              </p>
              <h1 className="text-3xl font-display font-bold text-foreground">Case Analysis Engine</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Structured case analysis with priority scoring, legal reasoning, and precedent retrieval
              </p>
            </div>
          </div>
        </motion.div>

        {/* ── Input Panel ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-panel rounded-2xl p-6 mb-8"
        >
          <label htmlFor="case-context-input" className="text-sm font-semibold text-foreground mb-3 block">
            Describe the case or paste case context
          </label>
          <div className="relative">
            <textarea
              ref={textareaRef}
              id="case-context-input"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleAnalyze();
              }}
              placeholder="Example: An accused has been charged under Section 302 IPC for the murder of a colleague following a workplace dispute. The accused claims self-defense under Section 100 IPC. FIR filed at Bangalore Central PS. Bail application pending."
              rows={5}
              className="w-full bg-muted/30 rounded-xl border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 resize-y min-h-[120px]"
            />
            <div className="flex items-center justify-between mt-3">
              <p className="text-[11px] text-muted-foreground">
                <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">Ctrl+Enter</kbd> to analyze
              </p>
              <button
                id="analyze-case-btn"
                onClick={handleAnalyze}
                disabled={!context.trim() || isAnalyzing}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
              >
                {isAnalyzing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {isAnalyzing ? "Analyzing..." : "Analyze Case"}
              </button>
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3"
            >
              <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-500">Analysis Failed</p>
                <p className="text-xs text-red-400/80 mt-0.5">{error}</p>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* ── Loading State ── */}
        <AnimatePresence>
          {isAnalyzing && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-panel rounded-2xl p-10 mb-8 flex flex-col items-center"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5"
              >
                <Brain className="w-8 h-8 text-primary" />
              </motion.div>
              <p className="text-lg font-display font-semibold text-foreground mb-2">Running RAG Analysis</p>
              <p className="text-sm text-muted-foreground">
                Retrieving precedents, scoring priority, and generating structured analysis…
              </p>
              <div className="flex gap-3 mt-6">
              {["Retrieval", "Inference", "Laws", "Priority", "Reasoning"].map((step, i) => (
                  <motion.div
                    key={step}
                    initial={{ opacity: 0.3 }}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.5, delay: i * 0.4, repeat: Infinity }}
                    className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold"
                  >
                    {step}
                  </motion.div>
                ))}
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
                  <p className="text-xs text-yellow-500 font-medium">{report.generativeNote}</p>
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
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${priorityConfig?.bg}`}>
                      <PriorityIcon className={`w-5 h-5 ${priorityConfig?.text}`} />
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full text-white ${priorityConfig?.badgeBg}`}>
                      {report.priorityLevel}
                    </span>
                  </div>
                  <div className="flex items-end gap-4">
                    <ScoreRing value={report.priorityScore} color={priorityConfig?.color || "#888"} />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Priority Score</p>
                      <p className={`text-2xl font-display font-bold ${priorityConfig?.text}`}>{report.priorityScore}/100</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3 leading-relaxed">{report.priorityJustification}</p>
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
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Case Title</span>
                  </div>
                  <p className="text-base font-display font-bold text-foreground leading-snug mb-4">{report.caseTitle}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Type:</span>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">{report.caseType}</span>
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
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Confidence</span>
                  </div>
                  <div className="flex items-end gap-4 mb-4">
                    <ScoreRing value={Math.round(report.confidenceScore * 100)} color="hsl(238,70%,55%)" />
                    <div>
                      <p className="text-2xl font-display font-bold text-primary">{report.confidenceScore}</p>
                      <p className="text-[10px] text-muted-foreground">out of 1.0</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {report.grounded ? (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-500">
                        <CheckCircle className="w-3.5 h-3.5" /> Grounded in precedents
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-yellow-500">
                        <Sparkles className="w-3.5 h-3.5" /> Generative reasoning
                      </span>
                    )}
                  </div>
                </motion.div>
              </div>

              {/* ── Structured Sections ── */}
              {report.expandedScenario && (
                <SectionBlock title="Expanded Case Scenario" icon={Sparkles} delay={0.18}>
                  <div className="rounded-xl bg-gradient-to-br from-primary/5 to-accent/5 border border-primary/10 p-4">
                    <p className="text-sm text-foreground/85 leading-relaxed">{report.expandedScenario}</p>
                  </div>
                </SectionBlock>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <SectionBlock title="Key Facts" icon={FileText} delay={0.2}>
                  <ul className="space-y-2">
                    {report.keyFacts.map((fact, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                        <span className="text-sm text-foreground/80 leading-relaxed">{fact}</span>
                      </li>
                    ))}
                  </ul>
                </SectionBlock>

                <SectionBlock title="Legal Issues" icon={AlertTriangle} delay={0.25}>
                  <ul className="space-y-2">
                    {report.legalIssues.map((issue, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-yellow-500 flex-shrink-0" />
                        <span className="text-sm text-foreground/80 leading-relaxed">{issue}</span>
                      </li>
                    ))}
                  </ul>
                </SectionBlock>

                <SectionBlock title="Relevant Laws" icon={BookOpen} delay={0.3}>
                  <div className="flex flex-wrap gap-2">
                    {report.relevantLaws.map((law, i) => (
                      <span key={i} className="px-3 py-1.5 rounded-lg bg-primary/8 border border-primary/15 text-xs font-medium text-primary">
                        {law}
                      </span>
                    ))}
                  </div>
                </SectionBlock>

                <SectionBlock title="Arguments" icon={Users} delay={0.35}>
                  <div className="space-y-3">
                    <div className="rounded-xl bg-blue-500/5 border border-blue-500/15 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-blue-500 font-bold mb-1">Plaintiff / Petitioner</p>
                      <p className="text-xs text-foreground/80 leading-relaxed">{report.arguments.plaintiff}</p>
                    </div>
                    <div className="rounded-xl bg-orange-500/5 border border-orange-500/15 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-orange-500 font-bold mb-1">Defendant / Respondent</p>
                      <p className="text-xs text-foreground/80 leading-relaxed">{report.arguments.defendant}</p>
                    </div>
                  </div>
                </SectionBlock>
              </div>

              {/* ── Similar Cases ── */}
              {report.similarCaseReferences.length > 0 && (
                <SectionBlock title="Similar Case References" icon={Scale} delay={0.4}>
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
                          <p className="text-sm font-semibold text-foreground truncate">{ref.title}</p>
                          <p className="text-[11px] text-muted-foreground">{ref.court} · {ref.year}</p>
                          {ref.excerpt && (
                            <p className="text-xs text-foreground/60 mt-1 line-clamp-2">{ref.excerpt}</p>
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
                <SectionBlock title="Predicted Outcome" icon={TrendingUp} delay={0.5}>
                  <div className="rounded-xl bg-gradient-to-br from-primary/5 to-accent/5 border border-primary/10 p-4">
                    <p className="text-sm text-foreground leading-relaxed">{report.predictedOutcome}</p>
                  </div>
                </SectionBlock>

                <SectionBlock title="Reasoning" icon={Brain} delay={0.55}>
                  <p className="text-sm text-foreground/80 leading-relaxed">{report.reasoning}</p>
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
