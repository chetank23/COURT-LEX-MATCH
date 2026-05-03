import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gavel,
  AlertTriangle,
  TrendingUp,
  Zap,
  ChevronRight,
  CheckCircle2,
  Clock,
  User,
  Filter,
  RefreshCw,
} from "lucide-react";
import { useAuth, type ManagedCase } from "@/contexts/AuthContext";
import { useSearch } from "@/contexts/SearchContext";
import { dataService } from "@/services/dataService";
import { JudgeAvailabilityWidget } from "@/components/JudgeAvailabilityWidget";
import { JudgeProfile } from "@/types";

type FilterMode = "all" | "unassigned" | "needs-reassign";

const JUDGES = [
  "Justice N. Rao",
  "Justice R. Iyer",
  "Justice P. Mehta",
  "Justice K. Banerjee",
];

const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };

export default function JudgeAssignmentCenter() {
  const { user, managedCases, updateManagedCase } = useAuth();
  const { addHearing } = useSearch();
  const [selectedCase, setSelectedCase] = useState<ManagedCase | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>("unassigned");
  const [suggestedJudge, setSuggestedJudge] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignmentMessage, setAssignmentMessage] = useState("");
  
  // Widget states
  const [selectedDistrict, setSelectedDistrict] = useState("Bangalore");
  const [selectedCaseType, setSelectedCaseType] = useState("Criminal");
  const [schedulingDate, setSchedulingDate] = useState("");
  const [schedulingTime, setSchedulingTime] = useState("10:30");
  const [schedulingJudgeId, setSchedulingJudgeId] = useState<string | null>(null);

  // Filter and sort cases by priority
  const filteredCases = useMemo(() => {
    let filtered = managedCases;

    if (filterMode === "unassigned") {
      filtered = filtered.filter(
        (c) => !c.assignedJudge || c.assignedJudge === "Unassigned"
      );
    } else if (filterMode === "needs-reassign") {
      filtered = filtered.filter((c) => c.status === "Under Review");
    }

    // Sort by priority (P0 first) then by severity
    return [...filtered].sort((a, b) => {
      const priorityA = PRIORITY_ORDER[a.priorityBand || "P3"] || 3;
      const priorityB = PRIORITY_ORDER[b.priorityBand || "P3"] || 3;

      if (priorityA !== priorityB) return priorityA - priorityB;

      // Secondary sort by severity (higher riskScore first)
      return (b.riskScore || 0) - (a.riskScore || 0);
    });
  }, [managedCases, filterMode]);

  // Get judge recommendation based on case severity
  const getJudgeRecommendation = useCallback(async (caseItem: ManagedCase) => {
    try {
      const recommendation = await dataService.recommendJudgeForCase({
        title: caseItem.title,
        summary: caseItem.notes,
        priorityScore: caseItem.priorityScore,
      });
      setSuggestedJudge(recommendation.assignedJudge);
      setAssignmentMessage(recommendation.assignmentReason || "");
    } catch (error) {
      console.error("Error getting judge recommendation:", error);
      setSuggestedJudge(JUDGES[0]);
    }
  }, []);

  // Handle case selection
  const handleSelectCase = useCallback(
    (caseItem: ManagedCase) => {
      setSelectedCase(caseItem);
      setSuggestedJudge(null);
      setAssignmentMessage("");
      getJudgeRecommendation(caseItem);
    },
    [getJudgeRecommendation]
  );

  // Normalize date helper
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

  // Handle schedule from widget
  const handleScheduleFromJudge = useCallback(
    async (judge: JudgeProfile) => {
      if (!selectedCase) return;

      const normalizedDate = normalizeDateDMY(schedulingDate);
      if (!normalizedDate) {
        setAssignmentMessage("Enter a valid hearing date.");
        return;
      }

      setIsAssigning(true);
      setSchedulingJudgeId(judge.id);
      setAssignmentMessage("");

      try {
        updateManagedCase(selectedCase.id, {
          assignedJudge: judge.name,
          status: "Assigned",
          autoAssigned: true,
          assignmentReason: `Assigned via availability widget in ${judge.district || selectedDistrict}`,
        });

        const selectedTime = `${schedulingTime || "10:30"}`.trim();
        const hearing = await dataService.scheduleHearingForAssignment({
          caseId: selectedCase.id,
          caseTitle: selectedCase.title,
          assignedJudgeId: judge.id,
          assignedJudgeName: judge.name,
          localCourtName: judge.courtName || `${selectedDistrict} District Court`,
          courtRoom: "Court Room 1",
          state: judge.state || "TBD",
          district: judge.district || selectedDistrict,
          hearingDate: normalizedDate,
          hearingTime: selectedTime,
          notes: `Scheduled from Judge Assignment Center. Priority: ${selectedCase.priorityBand}. Case type: ${selectedCaseType}.`,
        });

        addHearing(hearing);
        setAssignmentMessage(`✓ Successfully scheduled with ${judge.name} on ${normalizedDate} at ${selectedTime}`);
        
        setTimeout(() => {
          setSelectedCase(null);
          setAssignmentMessage("");
        }, 2000);
      } catch (error) {
        console.error("Error assigning judge:", error);
        setAssignmentMessage("Error assigning judge. Please try again.");
      } finally {
        setIsAssigning(false);
        setSchedulingJudgeId(null);
      }
    },
    [selectedCase, updateManagedCase, addHearing, schedulingDate, schedulingTime, selectedDistrict, selectedCaseType, normalizeDateDMY]
  );

  // Handle manual judge assignment
  const handleAssignJudge = useCallback(
    async (judgeToAssign: string) => {
      if (!selectedCase) return;

      setIsAssigning(true);
      try {
        updateManagedCase(selectedCase.id, {
          assignedJudge: judgeToAssign,
          status: "Assigned",
          autoAssigned: true,
          assignmentReason: assignmentMessage,
        });

        const hearing = await dataService.scheduleHearingForAssignment({
          caseId: selectedCase.id,
          caseTitle: selectedCase.title,
          assignedJudgeId: `judge-${judgeToAssign.toLowerCase().replace(/\s+/g, "-")}`,
          assignedJudgeName: judgeToAssign,
          localCourtName: `${selectedDistrict} District Court`,
          courtRoom: "Court Room 1",
          state: "Karnataka",
          district: selectedDistrict,
          hearingDate: normalizeDateDMY(new Date().toISOString()),
          hearingTime: "10:30",
          notes: `Case assigned to ${judgeToAssign}. Priority: ${selectedCase.priorityBand}. Risk Level: ${getSeverityLevel(selectedCase)}`,
          // Add missing ManagedCase fields if required by param type
          status: "New",
          uploadedBy: user?.name || "Staff",
          priorityScore: 50,
          priorityBand: "P2",
          bailRiskScore: 0,
          escapeRiskScore: 0,
          riskScore: 0,
          publicDefenderStatus: "Not Required"
        } as any);

        addHearing(hearing);

        setAssignmentMessage(`✓ Successfully assigned to ${judgeToAssign}`);
        setTimeout(() => {
          setSelectedCase(null);
          setAssignmentMessage("");
        }, 2000);
      } catch (error) {
        console.error("Error assigning judge:", error);
        setAssignmentMessage("Error assigning judge. Please try again.");
      } finally {
        setIsAssigning(false);
      }
    },
    [selectedCase, user, updateManagedCase, addHearing, assignmentMessage, selectedDistrict, normalizeDateDMY]
  );

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dot-grid opacity-30" />
      <div className="relative z-10 pt-24 pb-12 px-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="glass-panel rounded-2xl p-6 md:p-8 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Gavel className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                Court Operations
              </p>
              <h1 className="text-3xl font-display font-bold text-foreground">
                Judge Assignment Center
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Assign and reassign judges based on case priority and severity
              </p>
            </div>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="glass-panel rounded-2xl p-4 mb-6 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-foreground">Filter:</span>
          </div>
          {(["all", "unassigned", "needs-reassign"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filterMode === mode
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {mode === "all"
                ? "All Cases"
                : mode === "unassigned"
                  ? "Unassigned"
                  : "Needs Reassignment"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Cases List */}
          <div className="xl:col-span-1 glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-display font-bold text-foreground mb-4">
              Cases by Priority
            </h2>
            <div className="space-y-3 max-h-[600px] overflow-auto pr-2">
              {filteredCases.length ? (
                filteredCases.map((caseItem) => (
                  <motion.button
                    key={caseItem.id}
                    onClick={() => handleSelectCase(caseItem)}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                      selectedCase?.id === caseItem.id
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50 bg-card/60"
                    }`}
                    whileHover={{ scale: 1.02 }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {caseItem.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {caseItem.uploadedBy}
                        </p>
                      </div>
                      <span className="px-2 py-1 rounded-full text-[11px] font-bold whitespace-nowrap bg-primary/20 text-primary">
                        {caseItem.priorityBand || "P3"}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1">
                      {caseItem.bailRiskScore ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-600">
                          Bail: {caseItem.bailRiskScore}
                        </span>
                      ) : null}
                      {caseItem.escapeRiskScore ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-orange-500/10 text-orange-600">
                          Escape: {caseItem.escapeRiskScore}
                        </span>
                      ) : null}
                    </div>
                  </motion.button>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No {filterMode === "all" ? "cases" : filterMode === "unassigned" ? "unassigned cases" : "cases needing reassignment"} found
                </p>
              )}
            </div>
          </div>

          {/* Case Details & Judge Assignment */}
          <div className="xl:col-span-2">
            <AnimatePresence mode="wait">
              {selectedCase ? (
                <motion.div
                  key={selectedCase.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-6"
                >
                  {/* Case Summary Card */}
                  <div className="glass-panel rounded-2xl p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h2 className="text-2xl font-display font-bold text-foreground">
                          {selectedCase.title}
                        </h2>
                        <p className="text-sm text-muted-foreground mt-2">
                          {selectedCase.notes}
                        </p>
                      </div>
                      <span className="px-3 py-1.5 rounded-full font-bold bg-primary/20 text-primary">
                        {selectedCase.priorityBand || "P3"}
                      </span>
                    </div>

                    {/* Risk Metrics Grid */}
                    <div className="grid grid-cols-2 gap-3 mt-6">
                      <div className="rounded-lg bg-muted/40 p-4">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                          Severity
                        </p>
                        <p className="text-lg font-bold text-foreground mt-2">
                          {getSeverityLevel(selectedCase)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-4">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                          Overall Risk
                        </p>
                        <p className="text-lg font-bold text-foreground mt-2">
                          {selectedCase.riskScore || 0}/100
                        </p>
                      </div>
                      <div className="rounded-lg bg-red-500/10 p-4 border border-red-500/20">
                        <p className="text-xs uppercase tracking-wider text-red-600 font-semibold">
                          Bail Risk
                        </p>
                        <p className="text-lg font-bold text-red-600 mt-2">
                          {selectedCase.bailRiskScore || 0}/100
                        </p>
                      </div>
                      <div className="rounded-lg bg-orange-500/10 p-4 border border-orange-500/20">
                        <p className="text-xs uppercase tracking-wider text-orange-600 font-semibold">
                          Escape Risk
                        </p>
                        <p className="text-lg font-bold text-orange-600 mt-2">
                          {selectedCase.escapeRiskScore || 0}/100
                        </p>
                      </div>
                    </div>

                    {/* Current Assignment */}
                    {selectedCase.assignedJudge && selectedCase.assignedJudge !== "Unassigned" ? (
                      <div className="mt-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-4">
                        <div className="flex items-center gap-2 text-emerald-600 mb-2">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-xs font-semibold uppercase">Current Assignment</span>
                        </div>
                        <p className="text-foreground font-semibold">
                          {selectedCase.assignedJudge}
                        </p>
                        {selectedCase.assignmentReason && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Reason: {selectedCase.assignmentReason}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-4">
                        <div className="flex items-center gap-2 text-yellow-600 mb-2">
                          <Clock className="w-4 h-4" />
                          <span className="text-xs font-semibold uppercase">
                            No Assignment
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          This case requires judge assignment
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Judge Availability & Scheduling Controls */}
                  <div className="mb-6 glass-panel rounded-2xl p-6 border border-primary/20">
                    <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                      <User className="w-5 h-5 text-primary" /> Check Judge Availability
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
                      <div>
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
                    </div>

                    {/* Judge Availability Widget */}
                    {selectedDistrict && selectedCaseType && schedulingDate && (
                      <JudgeAvailabilityWidget
                        district={selectedDistrict}
                        caseType={selectedCaseType}
                        hearingDate={normalizeDateDMY(schedulingDate)}
                        hearingTime={schedulingTime}
                        isScheduling={isAssigning}
                        schedulingJudgeId={schedulingJudgeId}
                        onSchedule={handleScheduleFromJudge}
                      />
                    )}
                  </div>

                  {/* Judge Recommendation */}
                  <div className="glass-panel rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Zap className="w-5 h-5 text-primary" />
                      <h3 className="text-lg font-bold text-foreground">
                        Judge Recommendation
                      </h3>
                    </div>

                    {suggestedJudge ? (
                      <div className="space-y-4">
                        <div className="rounded-xl bg-primary/10 border border-primary/20 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                                <User className="w-5 h-5 text-primary" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-foreground">
                                  {suggestedJudge}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Recommended match
                                </p>
                              </div>
                            </div>
                            <TrendingUp className="w-5 h-5 text-primary" />
                          </div>
                          {assignmentMessage && (
                            <p className="text-sm text-muted-foreground mt-3 p-3 rounded bg-foreground/5">
                              {assignmentMessage}
                            </p>
                          )}
                          <button
                            onClick={() => handleAssignJudge(suggestedJudge)}
                            disabled={isAssigning}
                            className="w-full mt-4 rounded-lg bg-primary text-primary-foreground py-2.5 font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                          >
                            {isAssigning ? "Assigning..." : "Assign Recommended Judge"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Loading recommendation...
                      </p>
                    )}
                  </div>

                  {/* Manual Judge Selection */}
                  <div className="glass-panel rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <RefreshCw className="w-5 h-5 text-accent" />
                      <h3 className="text-lg font-bold text-foreground">
                        Manual Judge Selection
                      </h3>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {JUDGES.map((judge) => (
                        <button
                          key={judge}
                          onClick={() => handleAssignJudge(judge)}
                          disabled={isAssigning}
                          className={`p-4 rounded-lg border-2 font-semibold transition-all text-sm ${
                            judge === suggestedJudge
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background hover:border-primary/50 text-foreground"
                          } disabled:opacity-60`}
                        >
                          <div className="flex items-center justify-between">
                            <span>{judge}</span>
                            <ChevronRight className="w-4 h-4" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="glass-panel rounded-2xl p-12 text-center"
                >
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                    <AlertTriangle className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-2">
                    Select a case to begin
                  </h3>
                  <p className="text-muted-foreground">
                    Choose a case from the list to view details, get judge
                    recommendations, and make assignments
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper function to determine severity level
function getSeverityLevel(caseItem: ManagedCase): string {
  const riskScore = caseItem.riskScore || 0;
  if (riskScore >= 75) return "Critical";
  if (riskScore >= 50) return "High";
  if (riskScore >= 25) return "Medium";
  return "Low";
}
