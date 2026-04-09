import { useState, useEffect, useRef, useCallback, memo } from "react";
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
} from "lucide-react";
import { CaseResult, JudgeProfile } from "@/types";
import { dataService } from "@/services/dataService";
import { useSearch } from "@/contexts/SearchContext";

const aiSteps = [
  { icon: Brain, label: "Understanding context", duration: 800 },
  { icon: Network, label: "Generating embeddings", duration: 1000 },
  { icon: Scale, label: "Matching precedents", duration: 1200 },
];

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

const JudgeAvailabilityWidget = memo(function JudgeAvailabilityWidget({
  district,
  caseType,
  hearingDate,
  hearingTime,
  isScheduling,
  schedulingJudgeId,
  onSchedule,
}: {
  district: string;
  caseType: string;
  hearingDate: string;
  hearingTime: string;
  isScheduling: boolean;
  schedulingJudgeId: string | null;
  onSchedule: (judge: JudgeProfile) => void;
}) {
  const [judges, setJudges] = useState<JudgeProfile[]>([]);
  const [counts, setCounts] = useState<Awaited<ReturnType<typeof dataService.getJudgesCountByArea>> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      setLoading(true);
      try {
        const normalizedCaseType: NonNullable<Parameters<typeof dataService.getAvailableJudgesByArea>[0]["caseType"]> =
          caseType === "Criminal" || caseType === "Civil" || caseType === "Other" ? caseType : "Criminal";

        const [judgeList, judgeStats] = await Promise.all([
          dataService.getAvailableJudgesByArea({
            district,
            caseType: normalizedCaseType,
            date: hearingDate,
            onlyAvailable: true,
          }),
          dataService.getJudgesCountByArea(district),
        ]);
        if (!cancelled) {
          setJudges(judgeList);
          setCounts(judgeStats);
        }
      } catch (error) {
        console.error("Error loading judges:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [district, caseType, hearingDate]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-bold text-blue-700 flex items-center gap-2">
          <Users className="w-4 h-4" /> Judge Availability in {district}
        </h4>
        {loading && <span className="text-xs text-blue-600 animate-pulse">Loading...</span>}
      </div>

      {counts ? (
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="text-center p-2 rounded bg-white/30">
            <p className="text-xs text-blue-600 font-semibold">Total</p>
            <p className="text-lg font-bold text-blue-700">{counts.total}</p>
          </div>
          <div className="text-center p-2 rounded bg-green-500/20">
            <p className="text-xs text-green-700 font-semibold">Available</p>
            <p className="text-lg font-bold text-green-700">{counts.available}</p>
          </div>
          <div className="text-center p-2 rounded bg-yellow-500/20">
            <p className="text-xs text-yellow-700 font-semibold">Busy</p>
            <p className="text-lg font-bold text-yellow-700">{counts.busy}</p>
          </div>
          <div className="text-center p-2 rounded bg-red-500/20">
            <p className="text-xs text-red-700 font-semibold">On Leave</p>
            <p className="text-lg font-bold text-red-700">{counts.onLeave}</p>
          </div>
        </div>
      ) : null}

      {counts?.byCaseType ? (
        <div className="text-xs text-blue-700 mb-3 p-2 rounded bg-blue-500/20">
          <p className="font-semibold mb-1">Specializations:</p>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(counts.byCaseType).map(([type, count]) => (
              <span key={type} className="px-2 py-1 rounded bg-blue-500/30">
                {type}: {count as number}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {judges.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-blue-700 mb-2">
            ✓ Available Judges for {caseType} Cases:
          </p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {judges.slice(0, 5).map((judge) => (
              <div
                key={judge.id}
                className="flex items-start justify-between p-2 rounded bg-white/40"
              >
                <div className="flex-1">
                  <p className="text-xs font-semibold text-foreground">{judge.name}</p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    {judge.courtLevel} • {judge.currentCaseLoad}/{judge.caseLoadCapacity} cases
                  </p>
                  {judge.yearsOfExperience && (
                    <p className="text-xs text-blue-600">
                      {judge.yearsOfExperience} years experience
                    </p>
                  )}
                  {judge.specializations && judge.specializations.length > 0 ? (
                    <p className="text-xs text-blue-600 mt-1">
                      Specializations: {judge.specializations.slice(0, 2).join(", ")}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onSchedule(judge)}
                    disabled={isScheduling}
                    className="mt-2 inline-flex items-center gap-1 rounded-md bg-primary/90 px-2 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary disabled:opacity-60"
                  >
                    {isScheduling && schedulingJudgeId === judge.id ? "Scheduling..." : `Schedule ${hearingTime || "10:30"}`}
                  </button>
                </div>
                <span
                  className={`text-xs font-bold px-2 py-1 rounded whitespace-nowrap ml-2 ${
                    judge.availability === "Available"
                      ? "bg-green-500/30 text-green-700"
                      : judge.availability === "Busy"
                        ? "bg-yellow-500/30 text-yellow-700"
                        : "bg-red-500/30 text-red-700"
                  }`}
                >
                  {judge.availability}
                </span>
              </div>
            ))}
          </div>
          {judges.length > 5 ? (
            <p className="text-xs text-blue-600 mt-2">
              +{judges.length - 5} more available judges
            </p>
          ) : null}
        </div>
      ) : (
        <div className="text-xs text-blue-700 flex items-center gap-2">
          <AlertCircle className="w-3 h-3" />
          {loading
            ? "Loading judge availability..."
            : "No available judges for selected date and case type"}
        </div>
      )}
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

  const inputRef = useRef<HTMLInputElement>(null);
  const persistTimeoutRef = useRef<NodeJS.Timeout>();

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
      {/* Background pattern */}
      <div className="fixed inset-0 dot-grid opacity-50" />
      <div className="fixed top-0 right-0 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px]" />
      <div className="fixed bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-accent/5 blur-[100px]" />

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
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold gradient-text mb-4">
                Case Lab
              </h1>
              <p className="text-lg text-muted-foreground max-w-lg mx-auto">
                Describe your case in plain English. Our AI understands legal meaning, not just keywords. Automatically check judge availability by district and case type.
              </p>
            </motion.div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="w-full max-w-2xl relative floating-glow rounded-2xl"
            >
              <div className="glass-panel rounded-2xl p-2">
                <div className="flex items-center gap-3">
                  <div className="pl-4">
                    <Search className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="Describe your case in plain English…"
                    className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none py-4 text-base"
                  />
                  <button
                    onClick={handleSearch}
                    disabled={!query.trim()}
                    className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
                  >
                    <Zap className="w-4 h-4" />
                    Search
                  </button>
                </div>
              </div>
              <p className="text-center text-xs text-muted-foreground mt-3">
                No keywords needed. Just explain the situation.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-12 flex flex-wrap justify-center gap-2"
            >
              {[
                "AI liability in automated decisions",
                "Data privacy in healthcare AI",
                "Autonomous vehicle negligence",
              ].map((ex) => (
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
                      type="text"
                      value={schedulingDate}
                      onChange={(e) => setSchedulingDate(e.target.value)}
                      placeholder="dd-mm-yyyy"
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
                    hearingDate={schedulingDate}
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
