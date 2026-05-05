import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Sparkles,
  Zap,
  Brain,
  Network,
  ArrowRight,
  Scale,
  GitCompare,
  Users,
  AlertCircle,
  CheckCircle,
  Gavel,
} from "lucide-react";
import { CaseResult, JudgeProfile } from "@/types";
import { dataService } from "@/services/dataService";
import { useSearch } from "@/contexts/SearchContext";
import LiveMotionBackground from "@/components/LiveMotionBackground";
import { JudgeAvailabilityWidget } from "@/components/JudgeAvailabilityWidget";

const aiSteps = [
  { icon: Brain, label: "Understanding context", duration: 800 },
  { icon: Network, label: "Generating embeddings", duration: 1000 },
  { icon: Scale, label: "Matching precedents", duration: 1200 },
];

const QUICK_PROMPT_ROTATE_MS = 3000;
const QUICK_PROMPT_WINDOW = 3;
const QUICK_CASE_PROMPTS = [
  "Contractor abandoned municipal bridge project mid-phase",
  "Hospital shared patient scans with insurer without consent",
  "Tenant evicted without written notice despite rent receipts",
  "Employer fired me after I reported unsafe factory conditions",
  "Bank froze my account without notice during a loan dispute",
  "Insurance claim rejected as pre-existing illness without clear proof",
  "Startup cofounder exited and kept company source code access",
  "Municipality demolished shop without prior notice or hearing",
  "Buyer paid token amount but seller sold property to someone else",
  "Parent denied child visitation despite family court interim order",
];

function getOrderedPromptWindow(prompts: string[], offset: number, size: number): string[] {
  if (prompts.length <= size) return prompts;
  return Array.from({ length: size }, (_, index) => prompts[(offset + index) % prompts.length]);
}

type WorkflowMode = "find-cases";
type Phase = "idle" | "choice" | "transition" | "analyzing" | "results" | "scheduling";

type LocalCourtOption = {
  localCourtName: string;
  courtRoom: string;
};

// Optimized with useCallback and reduced re-renders
const TypingText = memo(function TypingText({
  text,
  speed = 20,
}: {
  text: string;
  speed?: number;
}) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    if (!text) return;
    let i = 0;
    let timeoutId: NodeJS.Timeout;
    const scheduleNext = () => {
      if (i <= text.length) {
        setDisplayed(text.slice(0, i));
        i++;
        timeoutId = setTimeout(scheduleNext, speed);
      }
    };
    scheduleNext();
    return () => clearTimeout(timeoutId);
  }, [text, speed]);
  return <>{displayed}</>;
});

const SimilarityBar = memo(function SimilarityBar({
  score,
  delay,
}: {
  score: number;
  delay: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{
            background: `linear-gradient(90deg, hsl(238 70% 55%), hsl(270 60% 60%))`,
          }}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, delay: delay / 1000, ease: "easeOut" }}
        />
      </div>
      <span className="text-sm font-semibold font-display text-primary min-w-[40px]">
        {score}%
      </span>
    </div>
  );
});

const ResultCard = memo(function ResultCard({
  result,
  index,
}: {
  result: CaseResult;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.15, duration: 0.5 }}
      className="glass-panel rounded-2xl p-5 hover:glow-primary transition-all cursor-pointer group"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-display font-semibold text-foreground group-hover:text-primary transition-colors">
            {result.title}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {result.court} · {result.year}
          </p>
        </div>
        <div className="flex gap-1.5 flex-wrap justify-end">
          {result.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
      <SimilarityBar score={result.similarity} delay={index * 150 + 300} />
      <div className="mt-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          <TypingText text={result.summary} speed={8} />
        </p>
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-4 pt-4 border-t border-border"
          >
            <div className="space-y-3 text-sm text-muted-foreground">
              {result.judgment || result.finalVerdict ? (
                <div>
                  <p className="font-semibold text-foreground mb-1">Judgment</p>
                  <p>{result.judgment || result.finalVerdict}</p>
                </div>
              ) : null}
              {result.whyMatch || result.whyMatched ? (
                <div>
                  <p className="font-semibold text-foreground mb-1">Why this match</p>
                  <p>{result.whyMatch || result.whyMatched}</p>
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});


export default function AISearchLab() {
  const { state, setAISearchData, addHearing } = useSearch();

  // Initialize from context or use default state
  const [query, setQuery] = useState(state.aiSearchQuery || "");
  const [phase, setPhase] = useState<Phase>("idle");
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>("find-cases");
  const [currentStep, setCurrentStep] = useState(0);
  const [results, setResults] = useState<CaseResult[]>(state.aiSearchResults || []);
  const [isLoading, setIsLoading] = useState(false);

  // Judge & Scheduling states
  const [selectedDistrict, setSelectedDistrict] = useState("Bangalore");
  const [selectedCaseType, setSelectedCaseType] = useState("Criminal");
  const [schedulingDate, setSchedulingDate] = useState("");
  const [schedulingTime, setSchedulingTime] = useState("10:30");
  const [scheduleFeedback, setScheduleFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isScheduling, setIsScheduling] = useState(false);
  const [schedulingJudgeId, setSchedulingJudgeId] = useState<string | null>(null);

  const [promptOffset, setPromptOffset] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const persistTimeoutRef = useRef<NodeJS.Timeout>();
  const visibleQuickPrompts = useMemo(
    () => getOrderedPromptWindow(QUICK_CASE_PROMPTS, promptOffset, QUICK_PROMPT_WINDOW),
    [promptOffset]
  );

  useEffect(() => {
    if (phase !== "idle") return;
    if (QUICK_CASE_PROMPTS.length <= QUICK_PROMPT_WINDOW) return;

    const intervalId = setInterval(() => {
      setPromptOffset((previous) => (previous + 1) % QUICK_CASE_PROMPTS.length);
    }, QUICK_PROMPT_ROTATE_MS);

    return () => clearInterval(intervalId);
  }, [phase]);

  // Debounced sync to context for persistence
  useEffect(() => {
    clearTimeout(persistTimeoutRef.current);
    persistTimeoutRef.current = setTimeout(() => {
      setAISearchData(query, results);
    }, 500);

    return () => clearTimeout(persistTimeoutRef.current);
  }, [phase, results, setAISearchData, query]);

  const handleSearch = useCallback(() => {
    if (!query.trim()) return;
    setPhase("choice");
  }, [query]);



  const startAnalysis = useCallback(
    async (mode: WorkflowMode) => {
      if (!query.trim()) return;
      setWorkflowMode(mode);
      setPhase("transition");
      setIsLoading(true);

      setTimeout(() => {
        setPhase("analyzing");
        setCurrentStep(0);
        let step = 0;
        const advance = async () => {
          step++;
          if (step < aiSteps.length) {
            setCurrentStep(step);
            setTimeout(advance, aiSteps[step].duration);
          } else {
            // Fetch results
            const searchResults = await dataService.searchCases(query);
            setResults(searchResults);
            setAISearchData(query, searchResults);

            setIsLoading(false);
            setTimeout(() => setPhase("results"), 600);
          }
        };
        setTimeout(advance, aiSteps[0].duration);
      }, 2000);
    },
    [query, setAISearchData]
  );

  const handleReset = useCallback(() => {
    setPhase("idle");
    setQuery("");
    setCurrentStep(0);
    setWorkflowMode("find-cases");
    setResults([]);
    setSchedulingDate("");
    setSchedulingTime("10:30");
    setScheduleFeedback(null);
  }, []);

  const normalizeDateDMY = useCallback((rawValue: string) => {
    const raw = `${rawValue || ""}`.trim();
    if (!raw) return "";
    if (raw.includes("-") && raw.split("-")[0].length === 4) {
      const [y, m, d] = raw.split("-");
      return `${d}-${m}-${y}`;
    }
    const normalized = raw.replace(/\//g, "-");
    const parts = normalized.split("-");
    if (parts.length !== 3) return "";
    const [d, m, y] = parts;
    if (d.length < 1 || m.length < 1 || y.length !== 4) return "";
    return `${d.padStart(2, "0")}-${m.padStart(2, "0")}-${y}`;
  }, []);

  const handleScheduleFromJudge = useCallback(
    async (judge: JudgeProfile) => {
      const normalizedDate = normalizeDateDMY(schedulingDate);
      if (!normalizedDate) {
        setScheduleFeedback({
          type: "error",
          message: "Enter hearing date in DD-MM-YYYY or DD/MM/YYYY format.",
        });
        return;
      }

      const caseTitle = query.trim() || results[0]?.title || "Case from Case Lab";
      const caseId = `case-${Math.abs(hashText(caseTitle))}`;
      const selectedTime = `${schedulingTime || "10:30"}`.trim();

      setIsScheduling(true);
      setSchedulingJudgeId(judge.id);
      setScheduleFeedback(null);

      try {
        const hearing = await dataService.scheduleHearingForAssignment({
          caseId,
          caseTitle,
          assignedJudgeId: judge.id,
          assignedJudgeName: judge.name,
          localCourtName: judge.courtName || `${selectedDistrict} District Court`,
          courtRoom: "Court Room 1",
          state: judge.state || "TBD",
          district: judge.district || selectedDistrict,
          hearingDate: normalizedDate,
          hearingTime: selectedTime,
          notes: `Scheduled from Case Lab. Case type: ${selectedCaseType}.`,
        });

        addHearing(hearing);
        setScheduleFeedback({
          type: "success",
          message: `Scheduled with ${judge.name} on ${normalizedDate} at ${selectedTime}.`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to schedule hearing.";
        setScheduleFeedback({ type: "error", message });
      } finally {
        setIsScheduling(false);
        setSchedulingJudgeId(null);
      }
    },
    [addHearing, normalizeDateDMY, query, results, schedulingDate, schedulingTime, selectedDistrict, selectedCaseType]
  );

  return (
    <div className="min-h-screen relative overflow-hidden">
      <LiveMotionBackground />

      <AnimatePresence mode="wait">
        {/* IDLE STATE */}
        {phase === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -30 }}
            className="min-h-screen flex flex-col items-center justify-center px-6 relative z-10"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 20 }}
              className="text-center mb-10"
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1 text-[11px] font-semibold tracking-[0.14em] text-primary/90 mb-5">
                <Sparkles className="w-3.5 h-3.5" /> NARRATIVE-FIRST LEGAL SEARCH
              </span>
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-accent/20 flex items-center justify-center mx-auto mb-6 border border-primary/20 shadow-lg shadow-primary/10">
                <Sparkles className="w-9 h-9 text-primary" />
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold gradient-text mb-4 tracking-tight">
                Case Lab
              </h1>
              <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                Turn raw facts into a courtroom-ready brief. Write the situation naturally, and Case Lab maps legal intent, finds similar precedents, and flags judge availability by district and case type.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] text-muted-foreground">
                <span className="rounded-full bg-muted/60 px-3 py-1">Context-aware matching</span>
                <span className="rounded-full bg-muted/60 px-3 py-1">Priority-focused ranking</span>
                <span className="rounded-full bg-muted/60 px-3 py-1">Bench availability signals</span>
              </div>
            </motion.div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="w-full max-w-3xl relative floating-glow rounded-2xl"
            >
              <div className="glass-panel rounded-2xl p-2 border border-primary/15 shadow-xl shadow-primary/5">
                <div className="flex items-center gap-3">
                  <div className="pl-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20 flex items-center justify-center">
                      <Search className="w-5 h-5 text-primary" />
                    </div>
                  </div>
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="Example: Employer terminated me after reporting payroll fraud; what legal remedies are strongest?"
                    className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none py-4 text-base"
                  />
                  <button
                    onClick={handleSearch}
                    disabled={!query.trim()}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-medium text-sm flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
                  >
                    <Zap className="w-4 h-4" />
                    Run Analysis
                  </button>
                </div>
              </div>
              <p className="text-center text-xs text-muted-foreground mt-3">
                Write facts as a story: what happened, who is involved, and what relief you need.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-12 flex flex-wrap justify-center gap-2"
            >
              {visibleQuickPrompts.map((ex) => (
                <button
                  key={ex}
                  onClick={() => {
                    setQuery(ex);
                    inputRef.current?.focus();
                  }}
                  className="px-4 py-2 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
                >
                  {ex}
                </button>
              ))}
            </motion.div>
          </motion.div>
        )}

        {/* CHOICE STATE */}
        {phase === "choice" && (
          <motion.div
            key="choice"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="min-h-screen flex items-center justify-center relative z-10 px-6"
          >
            <div className="max-w-lg w-full text-center">
              <h2 className="text-2xl font-display font-bold text-foreground mb-2">
                Find Matching Cases
              </h2>
              <p className="text-sm text-muted-foreground mb-8">
                Search for matching precedents and similar legal cases
              </p>

              <button
                onClick={() => startAnalysis("find-cases")}
                className="w-full glass-panel rounded-2xl p-6 hover:glow-primary hover:bg-primary/5 transition-all cursor-pointer group"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20">
                  <GitCompare className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Begin Analysis</h3>
                <p className="text-xs text-muted-foreground">
                  AI will search for matching precedents and similar legal cases
                </p>
              </button>

              <button
                onClick={() => setPhase("idle")}
                className="mt-6 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Back to search
              </button>
            </div>
          </motion.div>
        )}

        {/* TRANSITION STATE */}
        {phase === "transition" && (
          <motion.div
            key="transition"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex items-center justify-center relative z-10"
          >
            <div className="text-center">
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xl text-muted-foreground font-display"
              >
                ⏳ Traditional systems take hours…
              </motion.p>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="text-2xl font-display font-bold gradient-text mt-4"
              >
                ⚡ LexMatch AI is analyzing meaning…
              </motion.p>
            </div>
          </motion.div>
        )}

        {/* ANALYZING STATE */}
        {phase === "analyzing" && (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex items-center justify-center relative z-10"
          >
            <div className="w-full max-w-md px-6">
              <div className="text-center mb-10">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                  className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4"
                >
                  <Brain className="w-8 h-8 text-primary" />
                </motion.div>
                <p className="font-display font-semibold text-foreground text-lg">
                  Analyzing your query
                </p>
                <p className="text-sm text-muted-foreground mt-1">"{query}"</p>
              </div>

              <div className="space-y-4">
                {aiSteps.map((step, i) => {
                  const StepIcon = step.icon;
                  const active = i === currentStep;
                  const done = i < currentStep;
                  return (
                    <motion.div
                      key={step.label}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.15 }}
                      className={`flex items-center gap-4 p-4 rounded-xl transition-all ${
                        active
                          ? "glass-panel glow-primary"
                          : done
                            ? "bg-primary/5"
                            : "bg-muted/50"
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                          active
                            ? "bg-primary text-primary-foreground"
                            : done
                              ? "bg-primary/20 text-primary"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <StepIcon className="w-5 h-5" />
                      </div>
                      <span
                        className={`text-sm font-medium ${
                          active
                            ? "text-foreground"
                            : done
                              ? "text-primary"
                              : "text-muted-foreground"
                        }`}
                      >
                        {step.label}
                      </span>
                      {active && (
                        <motion.div
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1, repeat: Infinity }}
                          className="ml-auto w-2 h-2 rounded-full bg-primary"
                        />
                      )}
                      {done && <span className="ml-auto text-xs text-primary">✓</span>}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* RESULTS STATE */}
        {phase === "results" && (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="min-h-screen relative z-10 pt-24 pb-12 px-6"
          >
            <div className="max-w-3xl mx-auto">
              {/* Header */}
              <motion.div
                initial={{ y: -10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="mb-8"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Results for</p>
                    <h2 className="text-xl font-display font-bold text-foreground">
                      "{query}"
                    </h2>
                  </div>
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    New Search <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Found{" "}
                  <span className="text-primary font-semibold">{results.length}</span>{" "}
                  matching precedents
                </p>
              </motion.div>


              {/* Judge Availability & Scheduling Controls */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 glass-panel rounded-2xl p-6 border border-primary/20"
              >
                <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" /> Check Judge Availability
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div>
                    <label className="text-sm font-semibold text-foreground block mb-2">
                      District/Area
                    </label>
                    <select
                      value={selectedDistrict}
                      onChange={(e) => setSelectedDistrict(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
                    >
                      <option>Bangalore</option>
                      <option>Mysore</option>
                      <option>Belgaum</option>
                      <option>Yadgir</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-foreground block mb-2">
                      Case Type
                    </label>
                    <select
                      value={selectedCaseType}
                      onChange={(e) => setSelectedCaseType(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
                    >
                      <option>Criminal</option>
                      <option>Civil</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-foreground block mb-2">
                      Hearing Date
                    </label>
                    <input
                      type="date"
                      value={schedulingDate}
                      onChange={(e) => setSchedulingDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
                    />
                  </div>
                </div>

                <div className="mb-6 max-w-xs">
                  <label className="text-sm font-semibold text-foreground block mb-2">
                    Hearing Time
                  </label>
                  <input
                    type="text"
                    value={schedulingTime}
                    onChange={(e) => setSchedulingTime(e.target.value)}
                    placeholder="HH:MM"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
                  />
                </div>

                {scheduleFeedback ? (
                  <div
                    className={`mb-4 flex items-center gap-2 rounded-lg border p-3 text-sm ${
                      scheduleFeedback.type === "success"
                        ? "border-green-500/40 bg-green-500/10 text-green-700"
                        : "border-red-500/40 bg-red-500/10 text-red-700"
                    }`}
                  >
                    {scheduleFeedback.type === "success" ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <span>{scheduleFeedback.message}</span>
                  </div>
                ) : null}

                {/* Judge Availability Widget */}
                {selectedDistrict && selectedCaseType && schedulingDate && (
                  <JudgeAvailabilityWidget
                    district={selectedDistrict}
                    caseType={selectedCaseType}
                    hearingDate={normalizeDateDMY(schedulingDate)}
                    hearingTime={schedulingTime}
                    isScheduling={isScheduling}
                    schedulingJudgeId={schedulingJudgeId}
                    onSchedule={handleScheduleFromJudge}
                  />
                )}
              </motion.div>

              {/* Results */}
              <div className="space-y-4">
                {results.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">
                      No results found. Please try a different query.
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground mb-3">
                        MATCHING PRECEDENTS
                      </p>
                    </div>
                    <div className="space-y-4">
                      {results.map((c, i) => (
                        <ResultCard key={c.id} result={c} index={i} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function hashText(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
