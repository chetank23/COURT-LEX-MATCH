import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Sparkles, Zap, Brain, Network, ArrowRight, Scale, Gavel, GitCompare, UserRoundCheck, CalendarClock, BadgeCheck, X } from "lucide-react";
import { CaseResult, JudgeProfile, RagQueryResponse, RagSource } from "@/types";
import { dataService } from "@/services/dataService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const aiSteps = [
  { icon: Brain, label: "Analyzing case...", duration: 800 },
  { icon: Network, label: "Extracting insights...", duration: 1000 },
  { icon: Scale, label: "Finding precedents...", duration: 1200 },
];

type WorkflowMode = "find-cases" | "assign-judge";
type Phase = "idle" | "choice" | "transition" | "analyzing" | "results";
type JudgeCategory = "Criminal" | "Civil" | "Other";
type RetrievalMode = "semantic" | "rag";

interface JudgeAssignmentResult {
  caseItem: CaseResult;
  assignedJudge: JudgeProfile;
  fitScore: number;
  rationale: string;
  requiresPublicProsecutor: boolean;
  suggestedHearingDate: string;
  suggestedHearingTime: string;
  suggestedHearingLabel: string;
}

const FALLBACK_JUDGES: JudgeProfile[] = [
  {
    id: "judge-fallback-1",
    name: "Justice N. Rao",
    courtLevel: "Supreme Court",
    category: "Criminal",
    yearsOfExperience: 20,
    caseLoadCapacity: 50,
    currentCaseLoad: 38,
    availability: "Busy",
  },
  {
    id: "judge-fallback-2",
    name: "Justice P. Mehta",
    courtLevel: "High Court",
    category: "Criminal",
    yearsOfExperience: 15,
    caseLoadCapacity: 60,
    currentCaseLoad: 42,
    availability: "Available",
  },
  {
    id: "judge-fallback-3",
    name: "Justice R. Iyer",
    courtLevel: "High Court",
    category: "Civil",
    yearsOfExperience: 18,
    caseLoadCapacity: 55,
    currentCaseLoad: 28,
    availability: "Available",
  },
  {
    id: "judge-fallback-4",
    name: "Justice A. Menon",
    courtLevel: "District Court",
    category: "Other",
    yearsOfExperience: 12,
    caseLoadCapacity: 45,
    currentCaseLoad: 19,
    availability: "Available",
  },
];


function toShortSummary(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "No summary available for this case.";

  const firstSentence = normalized.match(/^(.+?[.!?])(?:\s|$)/)?.[1] || normalized;
  if (firstSentence.length <= 180) return firstSentence;
  return `${firstSentence.slice(0, 177).trimEnd()}...`;
}

function getFinalVerdict(caseItem: CaseResult): string {
  return caseItem.final_verdict || caseItem.finalVerdict || "Unknown";
}

function getJudgmentText(caseItem: CaseResult): string {
  const text = (caseItem.judgment || "").trim();
  if (text) return text;
  return "Full judgment text is not available for this record.";
}

function ResultCard({ result, index, isLast, onOpenDetails }: { result: CaseResult; index: number; isLast: boolean; onOpenDetails: (item: CaseResult) => void }) {
  const judgementLabel = result.judgement || result.judgment || getFinalVerdict(result);
  const matchLevel = result.matchLevel || "Moderate Match";
  const matchedTerms = (result.matchedTerms || result.tags || []).slice(0, 6);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.15, duration: 0.5 }}
      onClick={() => onOpenDetails(result)}
    >
      <Card className="glass-panel rounded-2xl hover:glow-primary transition-all cursor-pointer group border-primary/10">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-display font-semibold text-primary">Similar Case {index + 1}</p>
              <CardTitle className="mt-1 text-lg font-display leading-snug group-hover:text-primary transition-colors">
                {result.title}
              </CardTitle>
            </div>
            <div className="text-right">
              <p className="text-lg font-display font-bold gradient-text">{result.similarity}%</p>
              <Badge variant="secondary" className="mt-1">{matchLevel}</Badge>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            <span className="font-semibold text-foreground">Court:</span> {result.court} · {result.year}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-display font-semibold text-foreground mb-1">Summary</p>
            <p className="text-sm text-muted-foreground leading-relaxed">{toShortSummary(result.summary)}</p>
          </div>

          <div>
            <p className="text-sm font-display font-semibold text-foreground mb-1">Judgement</p>
            <p className="text-sm text-foreground/85">{judgementLabel}</p>
          </div>

          <div>
            <p className="text-sm font-display font-semibold text-foreground mb-1">Why Matched</p>
            <p className="text-sm text-muted-foreground leading-relaxed">{result.whyMatched || result.whyMatch}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Matched Terms</p>
            <div className="flex flex-wrap gap-1.5">
              {matchedTerms.length > 0 ? (
                matchedTerms.map((term) => (
                  <Badge key={term} variant="outline" className="text-[11px]">{term}</Badge>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">No explicit term overlap extracted.</span>
              )}
            </div>
          </div>

          <p className="pt-3 border-t border-border text-xs text-primary font-semibold">Click to view complete case details and judgment</p>
          {!isLast && <p className="text-xs text-muted-foreground/70 tracking-wide select-none">--------------------------------------------------</p>}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function CaseDetailDrawer({ caseItem, isLoading, onClose }: { caseItem: CaseResult; isLoading: boolean; onClose: () => void }) {
  const finalVerdict = getFinalVerdict(caseItem);

  return (
    <>
      <motion.button
        type="button"
        aria-label="Close case details"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-x-0 bottom-0 top-[84px] z-50 bg-foreground/30 backdrop-blur-[1px]"
      />
      <motion.aside
        initial={{ x: 400, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 400, opacity: 0 }}
        transition={{ type: "spring", damping: 24 }}
        className="fixed right-0 top-[84px] h-[calc(100vh-84px)] w-full max-w-2xl z-[60] bg-card border-l border-border shadow-2xl p-6 overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Complete Case Details</p>
            <h3 className="text-xl font-display font-bold text-foreground mt-1">{caseItem.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Court</p>
            <p className="text-sm font-medium text-foreground mt-1">{caseItem.court}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Year</p>
            <p className="text-sm font-medium text-foreground mt-1">{caseItem.year}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Similarity</p>
            <p className="text-sm font-medium text-foreground mt-1">{caseItem.similarity}%</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Final Verdict</p>
            <p className="text-sm font-medium text-foreground mt-1">{finalVerdict}</p>
          </div>
        </div>

        <div className="mb-6">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Summary</p>
          <p className="text-sm text-foreground/85 leading-relaxed">{caseItem.summary}</p>
        </div>

        <div className="mb-6">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Why This Matched</p>
          <div className="rounded-xl border border-primary/15 bg-primary/5 p-3">
            <p className="text-sm text-foreground/85 leading-relaxed">{caseItem.whyMatch}</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Judgment Given</p>
          <div className="rounded-xl border border-border bg-muted/40 p-4">
            <p className="text-sm text-foreground/85 leading-relaxed whitespace-pre-wrap">
              {isLoading ? "Loading complete judgment..." : getJudgmentText(caseItem)}
            </p>
          </div>
        </div>
      </motion.aside>
    </>
  );
}

function JudgeAssignmentCard({ result, index }: { result: JudgeAssignmentResult; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.45 }}
      className="glass-panel rounded-2xl p-5 hover:glow-primary transition-all cursor-pointer group"
      onClick={() => setExpanded((value) => !value)}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-semibold text-foreground group-hover:text-primary transition-colors truncate">{result.caseItem.title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{result.caseItem.court} · {result.caseItem.year}</p>
        </div>
        <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-primary/10 text-primary">Fit {result.fitScore}%</span>
      </div>

      <div className="rounded-xl border border-primary/15 bg-primary/5 p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Assigned Judge</p>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${result.assignedJudge.availability === "Available" ? "bg-green-500/15 text-green-700" : "bg-muted text-muted-foreground"}`}>
            {result.assignedJudge.availability}
          </span>
        </div>
        <p className="text-sm text-foreground font-semibold flex items-center gap-2">
          <UserRoundCheck className="w-4 h-4 text-primary" /> {result.assignedJudge.name}
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><BadgeCheck className="w-3.5 h-3.5" /> {result.assignedJudge.category}</span>
          <span className="flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" /> {result.suggestedHearingLabel}</span>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-border space-y-2">
              <p className="text-xs font-semibold text-accent uppercase tracking-wider">Assignment rationale</p>
              <p className="text-sm text-foreground/80 leading-relaxed">{result.rationale}</p>
              <p className="text-xs text-muted-foreground">
                Public prosecutor: <span className="font-semibold text-foreground">{result.requiresPublicProsecutor ? "Required" : "Not required"}</span>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function classifyCaseCategory(caseType: string): JudgeCategory {
  const normalizedType = caseType.toLowerCase();
  if (
    normalizedType.includes("criminal") ||
    normalizedType.includes("ipc") ||
    normalizedType.includes("crime") ||
    normalizedType.includes("offence")
  ) {
    return "Criminal";
  }
  if (
    normalizedType.includes("civil") ||
    normalizedType.includes("property") ||
    normalizedType.includes("contract") ||
    normalizedType.includes("family")
  ) {
    return "Civil";
  }
  return "Other";
}

function inferCourtLevel(courtName: string): JudgeProfile["courtLevel"] {
  const value = courtName.toLowerCase();
  if (value.includes("supreme")) return "Supreme Court";
  if (value.includes("high")) return "High Court";
  return "District Court";
}

function computeJudgeFit(caseItem: CaseResult, judge: JudgeProfile, liveLoad: number): number {
  const availabilityScore = judge.availability === "Available" ? 35 : judge.availability === "Busy" ? 12 : -25;
  const categoryMatchScore = judge.category === classifyCaseCategory(caseItem.type) ? 26 : 8;
  const courtMatchScore = judge.courtLevel === inferCourtLevel(caseItem.court) ? 14 : 5;
  const expScore = Math.min(20, Math.round((judge.yearsOfExperience / 25) * 20));
  const capacity = Math.max(1, judge.caseLoadCapacity);
  const loadRatio = Math.min(1.2, liveLoad / capacity);
  const loadScore = Math.round((1 - loadRatio) * 20);

  return Math.max(20, Math.min(99, availabilityScore + categoryMatchScore + courtMatchScore + expScore + loadScore));
}

function buildAssignmentRationale(caseItem: CaseResult, judge: JudgeProfile): string {
  const category = classifyCaseCategory(caseItem.type);
  return `${judge.name} selected for ${category.toLowerCase()}-bench alignment, ${judge.yearsOfExperience} years of experience, and manageable live caseload for ${caseItem.court.toLowerCase()} proceedings.`;
}

function buildSuggestedHearingSlot(index: number): {
  hearingDate: string;
  hearingTime: string;
  label: string;
} {
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + 3 + index);
  const day = baseDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const hour = 10 + (index % 4);
  const hearingDate = baseDate.toISOString().slice(0, 10);
  const hearingTime = `${String(hour).padStart(2, "0")}:00`;
  return {
    hearingDate,
    hearingTime,
    label: `${day}, ${hour}:00`,
  };
}

function inferHearingVenue(courtName: string): {
  state: string;
  district: string;
  localCourtName: string;
  courtRoom: string;
} {
  const source = courtName.toLowerCase();
  if (source.includes("supreme")) {
    return {
      state: "Delhi",
      district: "New Delhi",
      localCourtName: "Supreme Court of India",
      courtRoom: "Court Room 1",
    };
  }
  if (source.includes("high")) {
    return {
      state: "State Jurisdiction",
      district: "High Court District",
      localCourtName: courtName,
      courtRoom: "Court Room 2",
    };
  }
  return {
    state: "Local State",
    district: "Local District",
    localCourtName: courtName,
    courtRoom: "Court Room 3",
  };
}

function assignJudgesToCases(cases: CaseResult[], judges: JudgeProfile[]): JudgeAssignmentResult[] {
  if (cases.length === 0 || judges.length === 0) return [];

  const loadTracker = new Map(judges.map((judge) => [judge.id, judge.currentCaseLoad]));
  const rankedCases = [...cases].sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));

  return rankedCases.map((caseItem, index) => {
    const preferredCategory = classifyCaseCategory(caseItem.type);
    const primaryPool = judges.filter((judge) => judge.category === preferredCategory);
    const pool = primaryPool.length > 0 ? primaryPool : judges;

    const bestJudge = pool
      .map((judge) => {
        const liveLoad = loadTracker.get(judge.id) ?? judge.currentCaseLoad;
        const fit = computeJudgeFit(caseItem, judge, liveLoad);
        return { judge, fit };
      })
      .sort((a, b) => b.fit - a.fit)[0];

    const assignedJudge = bestJudge?.judge || judges[0];
    const previousLoad = loadTracker.get(assignedJudge.id) ?? assignedJudge.currentCaseLoad;
    loadTracker.set(assignedJudge.id, previousLoad + 1);
    const hearingSlot = buildSuggestedHearingSlot(index);

    return {
      caseItem,
      assignedJudge,
      fitScore: bestJudge?.fit || 50,
      rationale: buildAssignmentRationale(caseItem, assignedJudge),
      requiresPublicProsecutor: preferredCategory === "Criminal",
      suggestedHearingDate: hearingSlot.hearingDate,
      suggestedHearingTime: hearingSlot.hearingTime,
      suggestedHearingLabel: hearingSlot.label,
    };
  });
}

export default function AISearchLab() {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>("find-cases");
  const [retrievalMode, setRetrievalMode] = useState<RetrievalMode>("semantic");
  const [currentStep, setCurrentStep] = useState(0);
  const [results, setResults] = useState<CaseResult[]>([]);
  const [ragResult, setRagResult] = useState<RagQueryResponse | null>(null);
  const [assignments, setAssignments] = useState<JudgeAssignmentResult[]>([]);
  const [scheduleSummary, setScheduleSummary] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCase, setSelectedCase] = useState<CaseResult | null>(null);
  const [isCaseDetailLoading, setIsCaseDetailLoading] = useState(false);
  const caseDetailRequestRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = () => {
    if (!query.trim()) return;
    setPhase("choice");
  };

  const createHearingDraftsFromAssignments = async (items: JudgeAssignmentResult[]) => {
    let createdCount = 0;
    let existingCount = 0;

    for (const item of items) {
      const existingHearings = await dataService.getHearingsByCaseId(item.caseItem.id);
      const duplicate = existingHearings.some(
        (hearing) =>
          hearing.assignedJudgeId === item.assignedJudge.id &&
          hearing.hearingDate === item.suggestedHearingDate &&
          hearing.hearingTime === item.suggestedHearingTime
      );

      if (duplicate) {
        existingCount += 1;
        continue;
      }

      const venue = inferHearingVenue(item.caseItem.court);
      await dataService.addHearing({
        id: `hearing-${item.caseItem.id}-${item.assignedJudge.id}-${item.suggestedHearingDate}`,
        caseId: item.caseItem.id,
        caseTitle: item.caseItem.title,
        assignedJudgeId: item.assignedJudge.id,
        assignedJudgeName: item.assignedJudge.name,
        hearingDate: item.suggestedHearingDate,
        hearingTime: item.suggestedHearingTime,
        courtRoom: venue.courtRoom,
        state: venue.state,
        district: venue.district,
        localCourtName: venue.localCourtName,
        status: "Scheduled",
        notes: `Auto-drafted from AI judge assignment (${item.fitScore}% fit).`,
      });
      createdCount += 1;
    }

    if (createdCount > 0) {
      setScheduleSummary(`Auto-created ${createdCount} hearing draft${createdCount > 1 ? "s" : ""}${existingCount > 0 ? ` (${existingCount} already existed)` : ""}.`);
      return;
    }

    setScheduleSummary(existingCount > 0 ? `All ${existingCount} hearing drafts already existed.` : "No hearing drafts were created.");
  };

  const startAnalysis = async (mode: WorkflowMode) => {
    if (!query.trim()) return;
    setWorkflowMode(mode);
    setScheduleSummary("");
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
          let searchResults: CaseResult[] = [];
          if (mode === "find-cases" && retrievalMode === "rag") {
            const ragResponse = await dataService.queryRag(query, 8);
            setRagResult(ragResponse);
            setResults([]);
            await dataService.saveSearch(query, ragResponse.sources.length);
          } else {
            searchResults = await dataService.searchCases(query);
            setResults(searchResults);
            setRagResult(null);
            await dataService.saveSearch(query, searchResults.length);
          }

          if (mode === "assign-judge") {
            const judgePool = await dataService.getJudges();
            const availableJudges = judgePool.length > 0 ? judgePool : FALLBACK_JUDGES;
            const assigned = assignJudgesToCases(searchResults.slice(0, 8), availableJudges);
            setAssignments(assigned);
            await createHearingDraftsFromAssignments(assigned);
          } else {
            setAssignments([]);
          }

          setIsLoading(false);
          setTimeout(() => setPhase("results"), 600);
        }
      };
      setTimeout(advance, aiSteps[0].duration);
    }, 2000);
  };

  const handleReset = () => {
    setPhase("idle");
    setQuery("");
    setCurrentStep(0);
    setWorkflowMode("find-cases");
    setRetrievalMode("semantic");
    setAssignments([]);
    setRagResult(null);
    setResults([]);
    setScheduleSummary("");
    handleCloseCaseDetails();
  };

  const handleCloseCaseDetails = () => {
    caseDetailRequestRef.current += 1;
    setSelectedCase(null);
    setIsCaseDetailLoading(false);
  };

  const openCaseDetails = async (item: CaseResult) => {
    const requestId = caseDetailRequestRef.current + 1;
    caseDetailRequestRef.current = requestId;
    setSelectedCase(item);
    setIsCaseDetailLoading(true);
    try {
      const fullCase = await dataService.getCaseById(item.id);
      if (caseDetailRequestRef.current !== requestId || !fullCase) return;
      setSelectedCase({
        ...item,
        ...fullCase,
        similarity: item.similarity,
        whyMatch: item.whyMatch || fullCase.whyMatch,
      });
    } finally {
      if (caseDetailRequestRef.current === requestId) {
        setIsCaseDetailLoading(false);
      }
    }
  };

  const openCaseDetailsFromRagSource = async (source: RagSource) => {
    const seedCase: CaseResult = {
      id: source.caseId,
      title: source.title,
      court: source.court,
      year: source.year,
      similarity: Math.min(99, Math.max(40, Math.round(source.score * 100))),
      summary: source.excerpt,
      judgment: source.excerpt,
      finalVerdict: source.finalVerdict,
      final_verdict: source.finalVerdict,
      whyMatch: `Retrieved from ${source.section} section by RAG grounding.`,
      type: source.type,
      tags: ["RAG", source.section],
    };

    const requestId = caseDetailRequestRef.current + 1;
    caseDetailRequestRef.current = requestId;
    setSelectedCase(seedCase);
    setIsCaseDetailLoading(true);
    try {
      const fullCase = await dataService.getCaseById(source.caseId);
      if (caseDetailRequestRef.current !== requestId || !fullCase) return;
      setSelectedCase({
        ...seedCase,
        ...fullCase,
        similarity: seedCase.similarity,
        whyMatch: fullCase.whyMatch || seedCase.whyMatch,
      });
    } finally {
      if (caseDetailRequestRef.current === requestId) {
        setIsCaseDetailLoading(false);
      }
    }
  };

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
                AI Search Lab
              </h1>
              <p className="text-lg text-muted-foreground max-w-lg mx-auto">
                Describe your case in plain English. Our AI understands legal meaning, not just keywords.
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
              <div className="mt-3 flex justify-center gap-2">
                <button
                  onClick={() => setRetrievalMode("semantic")}
                  className={`px-4 py-2 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    retrievalMode === "semantic"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Semantic Search
                </button>
                <button
                  onClick={() => setRetrievalMode("rag")}
                  className={`px-4 py-2 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    retrievalMode === "rag"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  RAG Answer Mode
                </button>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-12 flex flex-wrap justify-center gap-2"
            >
              {[
                "A dispute between two brothers over ownership of ancestral property.",
                "Data privacy in healthcare AI",
                "Autonomous vehicle negligence",
              ].map((ex) => (
                <button
                  key={ex}
                  onClick={() => { setQuery(ex); inputRef.current?.focus(); }}
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
              <h2 className="text-2xl font-display font-bold text-foreground mb-2">What would you like to do?</h2>
              <p className="text-sm text-muted-foreground mb-8">Choose how to proceed with your case search</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => startAnalysis("find-cases")}
                  className="glass-panel rounded-2xl p-6 hover:glow-primary hover:bg-primary/5 transition-all cursor-pointer group"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20">
                    <GitCompare className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">Find Matching Cases</h3>
                  <p className="text-xs text-muted-foreground">Search for matching precedents and similar legal cases</p>
                </button>

                <button
                  onClick={() => startAnalysis("assign-judge")}
                  className="glass-panel rounded-2xl p-6 hover:glow-primary hover:bg-primary/5 transition-all cursor-pointer group"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20">
                    <Gavel className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">Assign to Judge</h3>
                  <p className="text-xs text-muted-foreground">Analyze case and assign appropriate judge based on priority</p>
                </button>
              </div>

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
                ⚡ CASE UPHOLDER is analyzing meaning…
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
                <p className="font-display font-semibold text-foreground text-lg">Analyzing your query</p>
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
                        active ? "glass-panel glow-primary" : done ? "bg-primary/5" : "bg-muted/50"
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                        active ? "bg-primary text-primary-foreground" : done ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                      }`}>
                        <StepIcon className="w-5 h-5" />
                      </div>
                      <span className={`text-sm font-medium ${active ? "text-foreground" : done ? "text-primary" : "text-muted-foreground"}`}>
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
              <motion.div
                initial={{ y: -10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="mb-8"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Results for</p>
                    <h2 className="text-xl font-display font-bold text-foreground">"{query}"</h2>
                  </div>
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    New Search <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {workflowMode === "assign-judge" ? (
                    <>
                      Generated <span className="text-primary font-semibold">{assignments.length}</span> judge assignments
                    </>
                  ) : (
                    retrievalMode === "rag" ? (
                      <>
                        RAG confidence <span className="text-primary font-semibold">{ragResult?.confidence || 0}%</span> · sources <span className="text-primary font-semibold">{ragResult?.sources.length || 0}</span>
                      </>
                    ) : (
                      <>
                        Found <span className="text-primary font-semibold">{results.length}</span> matching precedents
                      </>
                    )
                  )}
                </p>
              </motion.div>

              <div className="space-y-4">
                {workflowMode === "assign-judge" ? (
                  assignments.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-muted-foreground">No assignable results found. Please try a different query.</p>
                    </div>
                  ) : (
                    <>
                      {scheduleSummary && (
                        <div className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-foreground/85">
                          {scheduleSummary}
                        </div>
                      )}
                      {assignments.map((assignment, i) => (
                        <JudgeAssignmentCard key={`${assignment.caseItem.id}-${assignment.assignedJudge.id}`} result={assignment} index={i} />
                      ))}
                    </>
                  )
                ) : retrievalMode === "rag" ? (
                  !ragResult || ragResult.sources.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-muted-foreground">{ragResult?.answer || "No grounded legal answer found. Please try a more case-specific legal query."}</p>
                    </div>
                  ) : (
                    <>
                      <Card className="glass-panel rounded-2xl border-primary/15">
                        <CardHeader>
                          <p className="text-sm font-display font-semibold text-primary">Grounded RAG Answer</p>
                          <CardTitle className="text-lg font-display">Answer for your legal query</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <p className="text-sm text-foreground/90 leading-relaxed">{ragResult.answer}</p>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="secondary">Grounded: {ragResult.grounded ? "Yes" : "No"}</Badge>
                            <Badge variant="secondary">Confidence: {ragResult.confidence}%</Badge>
                            <Badge variant="secondary">Retrieved Chunks: {ragResult.retrievedChunks.length}</Badge>
                          </div>
                        </CardContent>
                      </Card>

                      {ragResult.sources.map((source, i) => (
                        <Card key={`${source.caseId}-${source.section}-${i}`} className="glass-panel rounded-2xl border-primary/10">
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-display font-semibold text-primary">Source {i + 1}</p>
                                <CardTitle className="mt-1 text-base font-display leading-snug">{source.title}</CardTitle>
                              </div>
                              <Badge variant="secondary">Score {Math.round(source.score * 100)}%</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-2">{source.court} · {source.year} · {source.section}</p>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {source.finalVerdict && (
                              <p className="text-xs text-foreground"><span className="font-semibold">Final Verdict:</span> {source.finalVerdict}</p>
                            )}
                            <p className="text-sm text-muted-foreground leading-relaxed">{source.excerpt}</p>
                            <div className="pt-2 border-t border-border">
                              <button
                                onClick={() => void openCaseDetailsFromRagSource(source)}
                                className="text-xs font-semibold text-primary hover:opacity-90 transition-opacity cursor-pointer"
                              >
                                Open Full Case Details
                              </button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </>
                  )
                ) : results.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">No results found. Please try a different query.</p>
                  </div>
                ) : (
                  results.map((c, i) => (
                    <ResultCard
                      key={c.id}
                      result={c}
                      index={i}
                      isLast={i === results.length - 1}
                      onOpenDetails={openCaseDetails}
                    />
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedCase && phase === "results" && workflowMode === "find-cases" && (
          <CaseDetailDrawer
            caseItem={selectedCase}
            isLoading={isCaseDetailLoading}
            onClose={handleCloseCaseDetails}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
