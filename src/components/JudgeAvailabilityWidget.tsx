import { memo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Users, AlertCircle } from "lucide-react";
import { JudgeProfile } from "@/types";
import { dataService } from "@/services/dataService";

interface JudgeAvailabilityWidgetProps {
  district: string;
  caseType: string;
  hearingDate: string; // may be empty string when no date yet selected
  hearingTime: string;
  isScheduling: boolean;
  schedulingJudgeId: string | null;
  onSchedule: (judge: JudgeProfile) => void;
}

export const JudgeAvailabilityWidget = memo(function JudgeAvailabilityWidget({
  district,
  caseType,
  hearingDate,
  hearingTime,
  isScheduling,
  schedulingJudgeId,
  onSchedule,
}: JudgeAvailabilityWidgetProps) {
  const [judges, setJudges] = useState<JudgeProfile[]>([]);
  const [counts, setCounts] = useState<Awaited<
    ReturnType<typeof dataService.getJudgesCountByArea>
  > | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      setLoading(true);
      try {
        const normalizedCaseType: NonNullable<
          Parameters<typeof dataService.getAvailableJudgesByArea>[0]["caseType"]
        > =
          caseType === "Criminal" ||
          caseType === "Civil" ||
          caseType === "Other"
            ? (caseType as typeof normalizedCaseType)
            : "Criminal";

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
        {loading && (
          <span className="text-xs text-blue-600 animate-pulse">
            Loading...
          </span>
        )}
      </div>

      {counts ? (
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="text-center p-2 rounded bg-white/30">
            <p className="text-xs text-blue-600 font-semibold">Total</p>
            <p className="text-lg font-bold text-blue-700">{counts.total}</p>
          </div>
          <div className="text-center p-2 rounded bg-green-500/20">
            <p className="text-xs text-green-700 font-semibold">Available</p>
            <p className="text-lg font-bold text-green-700">
              {counts.available}
            </p>
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
                  <p className="text-xs font-semibold text-foreground">
                    {judge.name}
                  </p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    {judge.courtLevel} • {judge.currentCaseLoad}/
                    {judge.caseLoadCapacity} cases
                  </p>
                  {judge.yearsOfExperience && (
                    <p className="text-xs text-blue-600">
                      {judge.yearsOfExperience} years experience
                    </p>
                  )}
                  {judge.specializations && judge.specializations.length > 0 ? (
                    <p className="text-xs text-blue-600 mt-1">
                      Specializations:{" "}
                      {judge.specializations.slice(0, 2).join(", ")}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onSchedule(judge)}
                    disabled={isScheduling || !hearingDate}
                    title={
                      !hearingDate ? "Select a hearing date first" : undefined
                    }
                    className={`mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-all ${
                      !hearingDate
                        ? "bg-muted text-muted-foreground cursor-not-allowed border border-dashed border-border"
                        : "bg-primary/90 text-primary-foreground hover:bg-primary cursor-pointer"
                    } disabled:opacity-60`}
                  >
                    {isScheduling && schedulingJudgeId === judge.id
                      ? "Scheduling..."
                      : !hearingDate
                        ? "Pick a date first"
                        : `Schedule ${hearingTime || "10:00"}`}
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
            : hearingDate
              ? "No available judges for the selected criteria"
              : "No judges found for this district and case type"}
        </div>
      )}
    </motion.div>
  );
});
