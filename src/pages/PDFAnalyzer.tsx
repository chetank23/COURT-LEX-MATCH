import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, Brain, Layers, Scale, ChevronDown, ChevronRight, Tag, Eye, AlertTriangle, ShieldCheck, GitCompare, ArrowUpRight, Clock3, Flag, ShieldAlert, User } from "lucide-react";
import { Section, FIRPriorityAssessment, FIRJudgeAssignment, CaseResult } from "@/types";
import { dataService } from "@/services/dataService";
import { useSearch } from "@/contexts/SearchContext";

const analysisSteps = [
  { icon: FileText, label: "Extracting text", duration: 1200 },
  { icon: Layers, label: "Identifying sections", duration: 1000 },
  { icon: Brain, label: "Understanding context", duration: 1400 },
  { icon: Scale, label: "Matching cases", duration: 1000 },
];

type WorkflowMode = "find-cases";
type Phase = "upload" | "choice" | "analyzing" | "results";

function SectionCard({ section, lawyerMode }: { section: Section; lawyerMode: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [showMatches, setShowMatches] = useState(false);
  const Icon = section.icon;

  const renderContent = (text: string, highlights: string[]) => {
    if (!lawyerMode) return text;
    let result = text;
    highlights.forEach((h) => {
      result = result.replace(h, `【${h}】`);
    });
    return result;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel rounded-2xl overflow-hidden"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 p-5 cursor-pointer hover:bg-muted/30 transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 text-left">
          <h3 className="font-display font-semibold text-foreground">{section.title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{section.summary}</p>
        </div>
        <div className="flex items-center gap-2">
          {section.matches.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent/10 text-accent">
              {section.matches.length} matches
            </span>
          )}
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-4">
              {/* Summary */}
              <div className="p-4 rounded-xl gradient-surface border border-primary/10">
                <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">AI Summary</p>
                <p className="text-sm text-foreground/80 leading-relaxed">{section.summary}</p>
              </div>

              {/* Full content */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Full Content</p>
                <p className="text-sm text-foreground/70 leading-relaxed">
                  {renderContent(section.content, section.highlights)}
                </p>
              </div>

              {/* Tags */}
              <div className="flex items-center gap-2 flex-wrap">
                <Tag className="w-3 h-3 text-muted-foreground" />
                {section.tags.map((t) => (
                  <span key={t} className="px-2 py-0.5 rounded text-[10px] font-medium bg-accent/10 text-accent">{t}</span>
                ))}
              </div>

              {/* Matches */}
              {section.matches.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowMatches(!showMatches)}
                    className="flex items-center gap-2 text-xs font-semibold text-primary cursor-pointer hover:underline"
                  >
                    <Eye className="w-3 h-3" />
                    {showMatches ? "Hide" : "View"} Similar Cases ({section.matches.length})
                  </button>
                  <AnimatePresence>
                    {showMatches && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden mt-2 space-y-2"
                      >
                        {section.matches.map((m) => (
                          <div key={m.title} className="p-3 rounded-xl bg-muted/50 border border-border">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-sm font-medium text-foreground">{m.title}</p>
                              <span className="text-xs font-bold gradient-text">{m.similarity}%</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{m.reason}</p>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function PDFAnalyzer() {
  const { state, setPDFAnalysisData } = useSearch();
  const [phase, setPhase] = useState<Phase>("upload");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>("find-cases");
  const [currentStep, setCurrentStep] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [lawyerMode, setLawyerMode] = useState(false);
  const [sections, setSections] = useState<Section[]>([]);
  const [firPriority, setFirPriority] = useState<FIRPriorityAssessment | null>(null);
  const [firJudgeAssignment, setFirJudgeAssignment] = useState<FIRJudgeAssignment | null>(null);
  const [overrideCaseType, setOverrideCaseType] = useState<FIRPriorityAssessment["caseType"] | "">("");
  const [overrideSeverity, setOverrideSeverity] = useState<FIRPriorityAssessment["severity"] | "">("");
  const [isApplyingOverride, setIsApplyingOverride] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const extractMatchesFromSections = (analyzedSections: Section[]): CaseResult[] => {
    const matchMap = new Map<string, CaseResult>();
    
    analyzedSections.forEach((section) => {
      section.matches.forEach((match, idx) => {
        const matchId = `${section.id}-match-${idx}`;
        if (!matchMap.has(match.title)) {
          matchMap.set(match.title, {
            id: matchId,
            title: match.title,
            court: "Supreme Court of India",
            year: new Date().getFullYear(),
            similarity: match.similarity,
            summary: match.reason,
            whyMatch: match.reason,
            type: "Legal Case",
            tags: [section.title],
          });
        }
      });
    });

    return Array.from(matchMap.values());
  };

  const applyManualOverride = async () => {
    if (!selectedFile || !firPriority || !overrideCaseType || !overrideSeverity) return;

    setIsApplyingOverride(true);
    const score = computeManualPriorityScore(overrideCaseType, overrideSeverity);
    const nextPriority: FIRPriorityAssessment = {
      caseType: overrideCaseType,
      severity: overrideSeverity,
      priorityScore: score,
      priorityBand: toPriorityBand(score),
      bailRiskScore: overrideSeverity === "Critical" ? 84 : overrideSeverity === "High" ? 68 : overrideSeverity === "Medium" ? 48 : 28,
      escapeRiskScore: overrideSeverity === "Critical" ? 78 : overrideSeverity === "High" ? 62 : overrideSeverity === "Medium" ? 38 : 18,
      riskScore: overrideSeverity === "Critical" ? 82 : overrideSeverity === "High" ? 64 : overrideSeverity === "Medium" ? 43 : 24,
      riskFactors: [
        `manual override: ${overrideCaseType}`,
        `manual severity: ${overrideSeverity}`,
      ],
      rationale: `Priority manually overridden to ${overrideCaseType} with ${overrideSeverity.toLowerCase()} severity based on reviewer assessment.`,
    };

    const nextJudge = await dataService.assignJudgeForFIR(selectedFile, nextPriority, sections);
    setFirPriority(nextPriority);
    setFirJudgeAssignment(nextJudge);
    setIsApplyingOverride(false);
  };

  const startAnalysis = async (file: File) => {
    setSelectedFile(file);
    setPhase("choice");
  };

  const proceedWithAnalysis = async (mode: WorkflowMode) => {
    if (!selectedFile) return;
    setWorkflowMode(mode);
    setPhase("analyzing");
    setAnalysisError(null);
    setCurrentStep(0);
    let step = 0;
    const advance = async () => {
      try {
        step++;
        if (step < analysisSteps.length) {
          setCurrentStep(step);
          setTimeout(advance, analysisSteps[step].duration);
        } else {
          // Analyze PDF using data service
          const analyzedSections = await dataService.analyzePDF(selectedFile);
          const assessedPriority = await dataService.assessFIRPriority(selectedFile, analyzedSections);
          const assignedJudge = await dataService.assignJudgeForFIR(selectedFile, assessedPriority, analyzedSections);
          setSections(analyzedSections);
          setFirPriority(assessedPriority);
          setFirJudgeAssignment(assignedJudge);
          setOverrideCaseType(assessedPriority.caseType);
          setOverrideSeverity(assessedPriority.severity);
          if (analyzedSections.length > 0) {
            await dataService.savePDFUpload(selectedFile.name, analyzedSections.length);
            // Extract matches from sections and push to context
            const matchResults = extractMatchesFromSections(analyzedSections);
            if (matchResults.length > 0) {
              setPDFAnalysisData(matchResults);
            }
          }

          setTimeout(() => setPhase("results"), 500);
        }
      } catch (err: unknown) {
        console.error("Analysis failed:", err);
        setPhase("upload");
        setAnalysisError((err as Error).message || "An unexpected error occurred during analysis.");
      }
    };
    setTimeout(advance, analysisSteps[0].duration);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      startAnalysis(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === 'application/pdf') {
      startAnalysis(file);
    }
  };

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dot-grid opacity-30" />
      <div className="fixed top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-accent/5 blur-[120px]" />

      <AnimatePresence mode="wait">
        {phase === "upload" && (
          <motion.div
            key="upload"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="min-h-screen flex items-center justify-center px-6 relative z-10"
          >
            <div className="w-full max-w-lg text-center">
              <h1 className="text-3xl font-display font-bold gradient-text mb-3">PDF Analyzer</h1>
              <p className="text-muted-foreground mb-8">Upload a legal document for AI-powered analysis</p>

              <motion.div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                whileHover={{ scale: 1.02 }}
                className={`p-12 rounded-2xl border-2 border-dashed transition-all cursor-pointer ${
                  dragOver ? "border-primary bg-primary/5 glow-primary" : "border-border hover:border-primary/50"
                }`}
              >
                {analysisError && (
                  <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-red-400 text-left">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold">Analysis Failed</p>
                      <p className="text-xs opacity-80">{analysisError}</p>
                    </div>
                  </div>
                )}
                <Upload className={`w-12 h-12 mx-auto mb-4 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
                <p className="font-medium text-foreground mb-1">Drop your PDF here</p>
                <p className="text-sm text-muted-foreground">or click to browse files</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </motion.div>
            </div>
          </motion.div>
        )}

        {phase === "choice" && (
          <motion.div
            key="choice"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="min-h-screen flex items-center justify-center relative z-10 px-6"
          >
            <div className="max-w-lg w-full text-center">
              <h2 className="text-2xl font-display font-bold text-foreground mb-2">Find Matching Cases</h2>
              <p className="text-sm text-muted-foreground mb-8">Search for matching precedents related to this FIR</p>

              <button
                onClick={() => proceedWithAnalysis("find-cases")}
                className="w-full glass-panel rounded-2xl p-6 hover:glow-primary hover:bg-primary/5 transition-all cursor-pointer group"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20">
                  <GitCompare className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Begin Analysis</h3>
                <p className="text-xs text-muted-foreground">AI will extract and analyze the FIR document</p>
              </button>

              <button
                onClick={() => setPhase("upload")}
                className="mt-6 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Back to upload
              </button>
            </div>
          </motion.div>
        )}

        {phase === "analyzing" && (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex items-center justify-center px-6 relative z-10"
          >
            <div className="w-full max-w-md">
              <div className="text-center mb-10">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4"
                >
                  <FileText className="w-8 h-8 text-accent" />
                </motion.div>
                <h2 className="font-display font-bold text-xl text-foreground">Analyzing Document</h2>
                <p className="text-sm text-muted-foreground mt-1">AI is processing your legal document</p>
              </div>
              <div className="space-y-3">
                {analysisSteps.map((step, i) => {
                  const StepIcon = step.icon;
                  const active = i === currentStep;
                  const done = i < currentStep;
                  return (
                    <motion.div
                      key={step.label}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className={`flex items-center gap-4 p-4 rounded-xl transition-all ${
                        active ? "glass-panel glow-accent" : done ? "bg-accent/5" : "bg-muted/50"
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        active ? "bg-accent text-accent-foreground" : done ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"
                      }`}>
                        <StepIcon className="w-5 h-5" />
                      </div>
                      <span className={`text-sm font-medium ${active ? "text-foreground" : done ? "text-accent" : "text-muted-foreground"}`}>
                        {step.label}
                      </span>
                      {active && (
                        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity }} className="ml-auto w-2 h-2 rounded-full bg-accent" />
                      )}
                      {done && <span className="ml-auto text-xs text-accent">✓</span>}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {phase === "results" && (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="min-h-screen relative z-10 pt-24 pb-12 px-6"
          >
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h1 className="text-2xl font-display font-bold gradient-text">Document Analysis</h1>
                  <p className="text-sm text-muted-foreground mt-1">AI-structured breakdown of your legal document</p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-xs text-muted-foreground">Lawyer Mode</span>
                    <button
                      onClick={() => setLawyerMode(!lawyerMode)}
                      className={`w-10 h-6 rounded-full transition-colors ${lawyerMode ? "bg-primary" : "bg-muted"} relative cursor-pointer`}
                    >
                      <motion.div
                        animate={{ x: lawyerMode ? 18 : 2 }}
                        className="absolute top-1 w-4 h-4 rounded-full bg-card shadow"
                      />
                    </button>
                  </label>
                  <button
                    onClick={() => {
                      setPhase("upload");
                      setSections([]);
                      setFirPriority(null);
                      setFirJudgeAssignment(null);
                      setOverrideCaseType("");
                      setOverrideSeverity("");
                      setSelectedFile(null);
                      setWorkflowMode("find-cases");
                    }}
                    className="px-4 py-2 rounded-xl bg-muted text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    New Upload
                  </button>
                </div>
              </div>

              {firPriority && firJudgeAssignment && (
                <div className="glass-panel rounded-2xl p-5 mb-5 border border-primary/20">
                  <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">FIR Priority Assessment</p>
                      <h2 className="text-lg font-display font-bold text-foreground mt-1">{selectedFile?.name || "Uploaded FIR"}</h2>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-destructive/10 text-destructive">
                      {firPriority.priorityBand} · {firPriority.priorityScore}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                    <div className="rounded-xl border border-border p-3 bg-muted/30">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Case Type</p>
                      <p className="text-sm font-semibold text-foreground">{firPriority.caseType}</p>
                    </div>
                    <div className="rounded-xl border border-border p-3 bg-muted/30">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> Severity
                      </p>
                      <p className="text-sm font-semibold text-foreground">{firPriority.severity}</p>
                    </div>
                    <div className="rounded-xl border border-border p-3 bg-muted/30">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Assigned Judge</p>
                      <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <User className="w-4 h-4 text-primary" />
                        {firJudgeAssignment.assignedJudge}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                    <div className="rounded-xl border border-border p-3 bg-muted/20">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
                        <Flag className="w-3.5 h-3.5" /> Bail Risk
                      </p>
                      <p className="text-sm font-semibold text-foreground">{firPriority.bailRiskScore}</p>
                    </div>
                    <div className="rounded-xl border border-border p-3 bg-muted/20">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5" /> Escape Risk
                      </p>
                      <p className="text-sm font-semibold text-foreground">{firPriority.escapeRiskScore}</p>
                    </div>
                    <div className="rounded-xl border border-border p-3 bg-muted/20">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
                        <Clock3 className="w-3.5 h-3.5" /> Risk Composite
                      </p>
                      <p className="text-sm font-semibold text-foreground">{firPriority.riskScore}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border p-3 mb-4 bg-muted/20">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Manual Override</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <select
                        value={overrideCaseType}
                        onChange={(event) => setOverrideCaseType(event.target.value as FIRPriorityAssessment["caseType"])}
                        className="rounded-lg border border-border bg-card px-2.5 py-2 text-xs text-foreground"
                      >
                        <option value="Criminal">Criminal</option>
                        <option value="Civil">Civil</option>
                        <option value="Specialized Cases">Specialized Cases</option>
                      </select>
                      <select
                        value={overrideSeverity}
                        onChange={(event) => setOverrideSeverity(event.target.value as FIRPriorityAssessment["severity"])}
                        className="rounded-lg border border-border bg-card px-2.5 py-2 text-xs text-foreground"
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Critical">Critical</option>
                      </select>
                      <button
                        onClick={applyManualOverride}
                        disabled={isApplyingOverride || !overrideCaseType || !overrideSeverity}
                        className="rounded-lg bg-primary text-primary-foreground text-xs font-semibold px-3 py-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {isApplyingOverride ? "Applying..." : "Apply Override"}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-primary/10 bg-primary/5 p-3 mb-3">
                    <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">Rationale</p>
                    <p className="text-sm text-foreground/80">{firPriority.rationale}</p>
                  </div>

                  {firPriority.riskFactors.length > 0 ? (
                    <div className="rounded-xl border border-border p-3 mb-3 bg-muted/20">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Risk Signals</p>
                      <div className="flex flex-wrap gap-2">
                        {firPriority.riskFactors.slice(0, 4).map((factor) => (
                          <span key={factor} className="px-2.5 py-1 rounded-full text-[11px] bg-primary/10 text-primary font-medium">
                            {factor}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5">
                    <span className="text-xs text-foreground/90">{firJudgeAssignment.partyLabel} needs public prosecutor</span>
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded-md flex items-center gap-1 ${
                        firJudgeAssignment.requiresPublicProsecutor ? "bg-green-500/15 text-green-700" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {firJudgeAssignment.requiresPublicProsecutor ? "Required" : "Not Required"}
                    </span>
                  </div>

                  <div className="mt-3 rounded-xl border border-border p-3 bg-muted/20">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Judge Ranking</p>
                      <span className="text-[11px] text-muted-foreground">{firJudgeAssignment.routeMode.toUpperCase()}</span>
                    </div>
                    <p className="text-xs text-foreground/80 mb-3">{firJudgeAssignment.assignmentReason}</p>
                    <div className="space-y-2">
                      {firJudgeAssignment.judgeRankings.slice(0, 3).map((item, index) => (
                        <div key={`${item.judgeName}-${index}`} className="rounded-lg border border-border bg-card/60 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                              <ArrowUpRight className="w-4 h-4 text-primary" />
                              {item.judgeName}
                            </p>
                            <span className="text-xs font-semibold text-primary">{item.score}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1">{item.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {sections.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No sections to display</p>
                  </div>
                ) : (
                  sections.map((s) => (
                    <SectionCard key={s.id} section={s} lawyerMode={lawyerMode} />
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function computeManualPriorityScore(
  caseType: FIRPriorityAssessment["caseType"],
  severity: FIRPriorityAssessment["severity"]
) {
  const typeWeight: Record<FIRPriorityAssessment["caseType"], number> = {
    Criminal: 35,
    Civil: 22,
    "Specialized Cases": 28,
  };
  const severityWeight: Record<FIRPriorityAssessment["severity"], number> = {
    Low: 12,
    Medium: 24,
    High: 36,
    Critical: 48,
  };

  return Math.max(20, Math.min(99, typeWeight[caseType] + severityWeight[severity]));
}

function toPriorityBand(score: number): FIRPriorityAssessment["priorityBand"] {
  if (score >= 85) return "P0";
  if (score >= 70) return "P1";
  if (score >= 50) return "P2";
  return "P3";
}

function hashText(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}
